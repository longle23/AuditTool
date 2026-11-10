'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight, LockKeyhole, LogOut } from 'lucide-react';
import { findNavItem, stripBasePath } from '@/app/config/navigation';
import { Button } from '@/app/components/ui/Button';
import { logout } from '@/lib/auth-actions';
import { ShareLinkButton } from './ShareLinkButton';

interface TopbarProps {
  basePath: string;
  /** Null for share-link guests, who have no account to log out of. */
  username: string | null;
  canShare: boolean;
}

export function Topbar({ basePath, username, canShare }: TopbarProps) {
  const match = findNavItem(stripBasePath(usePathname(), basePath));

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/80 px-6 backdrop-blur lg:px-8">
      <nav className="flex items-center gap-1.5 text-sm">
        <span className="text-slate-500">{match?.group.label ?? 'Trang chủ'}</span>
        {match && (
          <>
            <ChevronRight className="h-4 w-4 text-slate-300" />
            <span className="font-medium text-slate-900">{match.item.label}</span>
          </>
        )}
      </nav>
      <div className="flex items-center gap-2">
        <div
          className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 sm:flex"
          title="Dữ liệu được xử lý ngay trên trình duyệt, không tải lên máy chủ"
        >
          <LockKeyhole className="h-3.5 w-3.5" />
          Xử lý cục bộ
        </div>
        {canShare && <ShareLinkButton />}
        {username !== null && (
          <>
            <span className="hidden max-w-40 truncate px-1 text-sm font-medium text-slate-700 md:inline" title={username}>
              {username}
            </span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm" className="whitespace-nowrap" title="Đăng xuất">
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                Đăng xuất
              </Button>
            </form>
          </>
        )}
      </div>
    </header>
  );
}
