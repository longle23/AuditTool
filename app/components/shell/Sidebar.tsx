'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, ShieldCheck } from 'lucide-react';
import { NAV_GROUPS } from '@/app/config/navigation';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`flex shrink-0 flex-col bg-navy-900 text-slate-300 transition-[width] duration-200 ${
        collapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gold-500 text-navy-900">
          <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={2.25} />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-white">Audit Tool</p>
            <p className="truncate text-[11px] text-slate-400">Công cụ hỗ trợ kiểm toán</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group) => (
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
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={`group relative flex h-9 items-center gap-3 rounded-md px-2.5 text-sm transition-colors ${
                        active ? 'bg-white/10 font-medium text-white' : 'hover:bg-white/5 hover:text-white'
                      } ${collapsed ? 'justify-center' : ''}`}
                    >
                      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-gold-500" />}
                      <Icon className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-gold-500' : ''}`} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={onToggle}
          className={`flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white ${
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
