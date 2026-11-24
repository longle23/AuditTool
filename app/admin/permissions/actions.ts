'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { isExpired, readSession, SESSION_HEADER } from '@/lib/auth';
import { findRow, listRows, parseJson, updateRow } from '@/lib/nocodb';
import { ASSIGNABLE_PERMISSIONS, SUPER_ADMIN_USERNAME, canAccess } from '@/lib/permissions';

async function requireSuperAdmin() {
  const session = await readSession((await headers()).get(SESSION_HEADER) ?? undefined);
  if (!session || isExpired(session) || !canAccess(session, 'admin.permissions')) {
    throw new Error('Không có quyền');
  }
  return session;
}

export async function saveUser(formData: FormData) {
  await requireSuperAdmin();
  const id = Number(formData.get('id'));
  const role = String(formData.get('role') ?? '').trim();
  const is_active = formData.get('is_active') === 'on';
  if (!Number.isFinite(id) || id < 1) throw new Error('User không hợp lệ');

  const user = (await listRows('users', { limit: 200 })).find((u) => Number(u.Id) === id);
  if (!user) throw new Error('Không tìm thấy user');
  if (String(user.username ?? '') === SUPER_ADMIN_USERNAME) {
    redirect('/admin/permissions?ok=protected');
  }
  if (!role || !(await findRow('roles', `(name,eq,${role})`))) throw new Error(`Role "${role}" không tồn tại`);

  await updateRow('users', { Id: id, role, is_active });
  redirect('/admin/permissions?ok=user');
}

export async function saveRole(formData: FormData) {
  await requireSuperAdmin();
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id) || id < 1) throw new Error('Role không hợp lệ');

  const role = (await listRows('roles', { limit: 50, sort: 'Id' })).find((r) => Number(r.Id) === id);
  if (!role) throw new Error('Không tìm thấy role');

  const permissions: string[] =
    formData.get('all') === 'on'
      ? ['*']
      : ASSIGNABLE_PERMISSIONS.filter((p) => formData.get(p) === 'on');

  await updateRow('roles', { Id: id, permissions });
  redirect('/admin/permissions?ok=role');
}

export async function loadPermissionsData() {
  const [users, roles] = await Promise.all([
    listRows('users', { limit: 200, sort: 'username' }),
    listRows('roles', { limit: 50, sort: 'name' }),
  ]);
  return {
    users: users.map((u) => ({
      Id: Number(u.Id),
      username: String(u.username ?? ''),
      display_name: String(u.display_name ?? ''),
      role: String(u.role ?? ''),
      is_active: Boolean(u.is_active),
      locked: String(u.username ?? '') === SUPER_ADMIN_USERNAME,
    })),
    roles: roles.map((r) => ({
      Id: Number(r.Id),
      name: String(r.name ?? ''),
      description: String(r.description ?? ''),
      permissions: parseJson<string[]>(r.permissions, []),
    })),
    roleNames: roles.map((r) => String(r.name ?? '')).filter(Boolean),
  };
}
