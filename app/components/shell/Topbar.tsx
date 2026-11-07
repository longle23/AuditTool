'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight, LockKeyhole } from 'lucide-react';
import { findNavItem } from '@/app/config/navigation';

export function Topbar() {
  const pathname = usePathname();
  const match = findNavItem(pathname);

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
      <div
        className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 sm:flex"
        title="Dữ liệu được xử lý ngay trên trình duyệt, không tải lên máy chủ"
      >
        <LockKeyhole className="h-3.5 w-3.5" />
        Xử lý cục bộ
      </div>
    </header>
  );
}
