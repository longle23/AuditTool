/**
 * Permission keys stored in the NocoDB `roles.permissions` JSON array; `*` grants everything.
 * Add a `tools.<name>` key for every new tool and reference it from `app/config/navigation.ts`.
 */
export const PERMISSIONS = {
  'tools.monthly-merge': 'Gộp file theo tháng',
  'share.create': 'Tạo link chia sẻ',
  'admin.activity': 'Xem lịch sử đăng nhập và sử dụng',
} as const;
export type Permission = keyof typeof PERMISSIONS;

/** Share-link guests may use every tool but nothing else. */
export const GUEST_PERMISSIONS = Object.keys(PERMISSIONS).filter((p) => p.startsWith('tools.'));

export const can = (permissions: string[], permission: Permission) =>
  permissions.includes('*') || permissions.includes(permission);
