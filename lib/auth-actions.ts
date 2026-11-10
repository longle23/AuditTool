'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  isExpired,
  isGuest,
  MAX_SHARE_MINUTES,
  readSession,
  SESSION_COOKIE,
  SESSION_MINUTES,
  signGuestSession,
  signUserSession,
} from './auth';
import { findRow, parseJson, updateRow } from './nocodb';
import { DUMMY_HASH, USERNAME_PATTERN, verifyPassword } from './password';
import { can } from './permissions';
import { writeLog, type AuthAction } from './usage-log';

const INVALID_LOGIN = 'Tài khoản hoặc mật khẩu không đúng';

const logAuth = (action: AuthAction, row: { username?: string | null; role?: string | null; details?: unknown }) =>
  writeLog('auth_logs', { action, ...row });

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const username = String(formData.get('username') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const fail = async (reason: string) => {
    await logAuth('login_failed', { username: username.slice(0, 100), details: { reason } });
    return INVALID_LOGIN;
  };
  if (!USERNAME_PATTERN.test(username)) return fail('invalid_username');

  let user;
  try {
    user = await findRow('users', `(username,eq,${username})`);
  } catch (error) {
    console.error('Đăng nhập: không đọc được bảng users:', error);
    return 'Không kết nối được cơ sở dữ liệu, vui lòng thử lại sau';
  }
  const passwordOk = await verifyPassword(password, user ? String(user.password_hash ?? '') : DUMMY_HASH);
  if (!user || !passwordOk) return fail(user ? 'wrong_password' : 'unknown_user');
  if (!user.is_active) return fail('inactive');

  const role = String(user.role ?? '');
  let permissions: string[] = [];
  try {
    const roleRow = role ? await findRow('roles', `(name,eq,${role})`) : null;
    permissions = parseJson<string[]>(roleRow?.permissions, []);
  } catch (error) {
    console.error('Đăng nhập: không đọc được bảng roles:', error);
    return 'Không kết nối được cơ sở dữ liệu, vui lòng thử lại sau';
  }

  (await cookies()).set(SESSION_COOKIE, await signUserSession({ username, role, permissions }, SESSION_MINUTES), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MINUTES * 60,
  });
  await Promise.all([
    updateRow('users', { Id: user.Id, last_login_at: new Date().toISOString() }).catch((error) =>
      console.error('Cập nhật last_login_at thất bại:', error),
    ),
    logAuth('login', { username, role }),
  ]);
  redirect('/');
}

export async function logout() {
  const jar = await cookies();
  const session = await readSession(jar.get(SESSION_COOKIE)?.value);
  if (session) await logAuth('logout', { username: session.username, role: session.role });
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}

/** Returns the share path (e.g. `/share/<token>`); the client prepends its own origin. */
export async function createShareLink(minutes: number): Promise<string> {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || isGuest(session) || isExpired(session) || !can(session.permissions, 'share.create')) {
    throw new Error('Bạn không có quyền tạo link chia sẻ');
  }
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_SHARE_MINUTES) {
    throw new Error(`Thời gian phải từ 1 phút đến ${MAX_SHARE_MINUTES / 60} giờ`);
  }
  await logAuth('share_link', { username: session.username, role: session.role, details: { minutes } });
  return `/share/${await signGuestSession(minutes)}`;
}
