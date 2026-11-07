import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
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
  description: 'Jennie Work — bộ công cụ hỗ trợ kiểm toán',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className={jakarta.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
