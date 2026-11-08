'use client';

import { useActionState, useState } from 'react';
import { CircleAlert, Eye, EyeOff, LoaderCircle, Lock, LogIn, Sparkles, User } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { login } from '@/lib/auth-actions';

const INPUT_CLASS =
  'h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 pl-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15';
const ICON_CLASS =
  'pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors peer-focus:text-brand-600';

export function LoginForm() {
  const [error, action, pending] = useActionState(login, null);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form
      action={action}
      className="relative w-full max-w-sm space-y-5 rounded-3xl border border-white/80 bg-white/90 p-8 shadow-xl shadow-brand-900/5 backdrop-blur-sm sm:p-10"
    >
      <div className="space-y-4 pb-2">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-brand-500 to-accent-500 text-white shadow-lg shadow-accent-500/30 lg:hidden">
          <Sparkles className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Chào mừng trở lại 👋</h1>
          <p className="text-sm text-slate-500">Đăng nhập vào Jennie Work để tiếp tục</p>
        </div>
      </div>

      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        <span>Tài khoản</span>
        <div className="relative">
          <input
            name="username"
            autoComplete="username"
            placeholder="Nhập tài khoản"
            required
            autoFocus
            className={`peer pr-3 ${INPUT_CLASS}`}
          />
          <User className={ICON_CLASS} aria-hidden="true" />
        </div>
      </label>

      <label className="block space-y-1.5 text-sm font-medium text-slate-700">
        <span>Mật khẩu</span>
        <div className="relative">
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            required
            className={`peer pr-11 ${INPUT_CLASS}`}
          />
          <Lock className={ICON_CLASS} aria-hidden="true" />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="absolute top-1/2 right-1.5 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </label>

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Đang đăng nhập…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Đăng nhập
          </>
        )}
      </Button>
    </form>
  );
}
