'use client';

import { useActionState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { login } from '@/lib/auth-actions';

const INPUT_CLASS =
  'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20';

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);

  return (
    <form action={action} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-accent-500 text-white">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Jennie Work</h1>
          <p className="text-xs text-slate-500">Đăng nhập để tiếp tục</p>
        </div>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        <span>Tài khoản</span>
        <input name="username" autoComplete="username" required autoFocus className={INPUT_CLASS} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        <span>Mật khẩu</span>
        <input name="password" type="password" autoComplete="current-password" required className={INPUT_CLASS} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </Button>
    </form>
  );
}
