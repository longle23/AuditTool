'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@/lib/auth';
import { ExpiredScreen } from './ExpiredScreen';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

const COLLAPSED_KEY = 'jennie-work:sidebar-collapsed';

export function AppShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1');
  }, []);

  // Tools run in the browser without server round-trips, so the guest deadline must be enforced here too.
  useEffect(() => {
    if (session.role !== 'guest') return;
    const timer = setTimeout(() => setExpired(true), session.exp - Date.now());
    return () => clearTimeout(timer);
  }, [session]);

  const toggle = () => {
    setCollapsed((value) => {
      localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
      return !value;
    });
  };

  if (expired) return <ExpiredScreen />;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar isAdmin={session.role === 'admin'} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl px-6 py-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
