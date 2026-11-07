import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { AppShell } from './components/shell/AppShell';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'vietnamese'],
});

export const metadata: Metadata = {
  title: {
    default: 'Audit Tool',
    template: '%s · Audit Tool',
  },
  description: 'Bộ công cụ hỗ trợ kiểm toán',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={inter.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
