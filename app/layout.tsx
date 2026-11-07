import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import { isExpired, readSession, SESSION_COOKIE } from '@/lib/auth';
import { AppShell } from './components/shell/AppShell';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin', 'vietnamese'],
});

export const metadata: Metadata = {
  title: {
    default: 'Jennie Work',
    template: '%s · Jennie Work',
  },
  description: 'Jennie Work — Bộ công cụ hỗ trợ công việc',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);

  return (
    <html lang="vi" className={jakarta.variable}>
      <body>
        {session && !isExpired(session) ? <AppShell session={session}>{children}</AppShell> : children}
      </body>
    </html>
  );
}
