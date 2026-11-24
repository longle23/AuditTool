/**
 * Permission keys stored in the NocoDB `roles.permissions` JSON array; `*` grants everything.
 * Add a `tools.<name>` key for every new tool and reference it from `app/config/navigation.ts`.
 */
export const PERMISSIONS = {
  'tools.monthly-merge': 'Gộp file theo tháng',
  'tools.checking-payout': 'Checking Payout',
  'share.create': 'Tạo link chia sẻ',
  'admin.activity': 'Xem lịch sử đăng nhập và sử dụng',
  'admin.permissions': 'Phân quyền người dùng',
} as const;
export type Permission = keyof typeof PERMISSIONS;

/** Only this account may open /admin/permissions — not granted by role `*`. */
export const SUPER_ADMIN_USERNAME = 'jennietam';
export const isSuperAdmin = (username: string | null | undefined) => username === SUPER_ADMIN_USERNAME;

/** Share-link guests may use every tool but nothing else. */
export const GUEST_PERMISSIONS = Object.keys(PERMISSIONS).filter((p) => p.startsWith('tools.'));

/** Role-editable keys (excludes the username-gated super-admin page). */
export const ASSIGNABLE_PERMISSIONS = Object.keys(PERMISSIONS).filter(
  (p) => p !== 'admin.permissions',
) as Exclude<Permission, 'admin.permissions'>[];

export const can = (permissions: string[], permission: Permission) =>
  permissions.includes('*') || permissions.includes(permission);

/** Nav / proxy / page gate. `admin.permissions` is username-only. */
export const canAccess = (
  session: { username: string | null; permissions: string[] },
  permission: Permission,
) => (permission === 'admin.permissions' ? isSuperAdmin(session.username) : can(session.permissions, permission));
