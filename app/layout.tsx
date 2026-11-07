import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { headers } from 'next/headers';
import { basePathFor, isExpired, readSession, SESSION_HEADER } from '@/lib/auth';
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
  const token = (await headers()).get(SESSION_HEADER);
  const session = await readSession(token ?? undefined);

  return (
    <html lang="vi" className={jakarta.variable}>
      <body>
        {session && !isExpired(session) ? (
          <AppShell session={session} basePath={basePathFor(session, token)}>
            {children}
          </AppShell>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
