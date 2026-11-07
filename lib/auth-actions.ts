'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_PASSWORD,
  ADMIN_SESSION_MINUTES,
  ADMIN_USERNAME,
  isExpired,
  MAX_SHARE_MINUTES,
  readSession,
  SESSION_COOKIE,
  signSession,
} from './auth';

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  if (formData.get('username') !== ADMIN_USERNAME || formData.get('password') !== ADMIN_PASSWORD) {
    return 'Tài khoản hoặc mật khẩu không đúng';
  }
  (await cookies()).set(SESSION_COOKIE, await signSession('admin', ADMIN_SESSION_MINUTES), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_MINUTES * 60,
  });
  redirect('/');
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect('/login');
}

/** Returns the share path (e.g. `/share/<token>`); the client prepends its own origin. */
export async function createShareLink(minutes: number): Promise<string> {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || session.role !== 'admin' || isExpired(session)) throw new Error('Chỉ admin mới tạo được link chia sẻ');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_SHARE_MINUTES) {
    throw new Error(`Số phút phải từ 1 đến ${MAX_SHARE_MINUTES}`);
  }
  return `/share/${await signSession('guest', minutes)}`;
}
