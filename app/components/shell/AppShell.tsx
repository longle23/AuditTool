'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const COLLAPSED_KEY = 'jennie-work:sidebar-collapsed';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
  }, []);

  const toggle = () => {
    setCollapsed((value) => {
      localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
      return !value;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 py-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
