import { Activity, Combine, type LucideIcon } from 'lucide-react';
import type { Permission } from '@/lib/permissions';

export interface NavItem {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  /** Checked by the proxy (direct URL access) and the sidebar. */
  permission: Permission;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar menu. Add new tools here (with a permission key from `lib/permissions.ts`); the breadcrumb is derived from this list too. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Xử lý dữ liệu',
    items: [
      {
        href: '/tools/monthly-merge',
        label: 'Gộp file theo tháng',
        description: 'Gộp các file giao dịch trong tháng thành một sheet duy nhất',
        icon: Combine,
        permission: 'tools.monthly-merge',
      },
    ],
  },
  {
    label: 'Quản trị',
    items: [
      {
        href: '/admin/activity',
        label: 'Lịch sử sử dụng',
        description: 'Lượt đăng nhập và lượt sử dụng các chức năng',
        icon: Activity,
        permission: 'admin.activity',
      },
    ],
  },
];

export const stripBasePath = (pathname: string, basePath: string) =>
  basePath && pathname.startsWith(basePath) ? pathname.slice(basePath.length) || '/' : pathname;

export function findNavItem(pathname: string): { group: NavGroup; item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return { group, item };
    }
  }
  return null;
}
