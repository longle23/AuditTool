import type { Metadata } from 'next';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default function LoginPage() {
  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <LoginForm />
    </main>
  );
}
