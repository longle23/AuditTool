'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, Sparkles } from 'lucide-react';
import { NAV_GROUPS, stripBasePath } from '@/app/config/navigation';
import { can } from '@/lib/permissions';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  basePath: string;
  permissions: string[];
}

export function Sidebar({ collapsed, onToggle, basePath, permissions }: SidebarProps) {
  const pathname = stripBasePath(usePathname(), basePath);
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can(permissions, i.permission)) })).filter(
    (g) => g.items.length > 0,
  );

  return (
    <aside
      className={`relative flex shrink-0 flex-col overflow-hidden bg-linear-to-b from-brand-900 via-[#2e1238] to-[#44153e] text-slate-300 transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      <div className="pointer-events-none absolute -top-24 -left-16 h-56 w-56 rounded-full bg-brand-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-20 h-56 w-56 rounded-full bg-accent-500/30 blur-3xl" />

      <div className="relative flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-accent-500 text-white shadow-lg shadow-accent-500/30">
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-bold tracking-tight text-white">
              Jennie{' '}
              <span className="bg-linear-to-r from-brand-100 to-accent-400 bg-clip-text text-transparent">Work</span>
            </p>
            <p className="truncate text-[11px] text-slate-400">Công cụ hỗ trợ công việc</p>
          </div>
        )}
      </div>

      <nav className="relative flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {groups.map((group) => (
          <div key={group.label}>
            {collapsed ? (
              <div className="mx-2 mb-2 border-t border-white/10" />
            ) : (
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={basePath + item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm transition-colors ${
                        active
                          ? 'bg-accent-500/15 font-medium text-white ring-1 ring-accent-400/20'
                          : 'hover:bg-white/5 hover:text-white'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      {active && (
                        <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-linear-to-b from-brand-500 to-accent-400" />
                      )}
                      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-accent-400' : ''}`} aria-hidden="true" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="relative border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onToggle}
          className={`flex h-9 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white ${
            collapsed ? 'justify-center' : ''
          }`}
          title={collapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
        >
          {collapsed ? <ChevronsRight className="h-[18px] w-[18px]" /> : <ChevronsLeft className="h-[18px] w-[18px]" />}
          {!collapsed && <span>Thu gọn</span>}
        </button>
      </div>
    </aside>
  );
}
