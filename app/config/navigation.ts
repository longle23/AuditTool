import { Combine, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  description?: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Sidebar menu. Add new tools here; the breadcrumb is derived from this list too. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Xử lý dữ liệu',
    items: [
      {
        href: '/tools/monthly-merge',
        label: 'Gộp file theo tháng',
        description: 'Gộp các file giao dịch trong tháng thành một sheet duy nhất',
        icon: Combine,
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
