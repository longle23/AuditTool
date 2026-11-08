import type { Metadata } from 'next';
import { FileSpreadsheet, Sparkles } from 'lucide-react';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = { title: 'Đăng nhập' };

const FEATURES = [
  { icon: FileSpreadsheet, title: 'Xử lý file Excel', text: 'Gộp và kiểm tra dữ liệu hằng tháng chỉ trong vài giây.' },
];

export default function LoginPage() {
  return (
    <main className="flex min-h-full">
      <section className="relative hidden flex-1 flex-col justify-between overflow-hidden bg-linear-to-br from-brand-900 via-[#2e1238] to-[#44153e] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -bottom-32 h-96 w-96 rounded-full bg-accent-500/30 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-linear-to-br from-brand-500 to-accent-500 shadow-lg shadow-accent-500/30">
            <Sparkles className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
          </div>
          <p className="text-lg font-bold tracking-tight">
            Jennie <span className="bg-linear-to-r from-brand-100 to-accent-400 bg-clip-text text-transparent">Work</span>
          </p>
        </div>

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl leading-tight font-bold tracking-tight">
              Làm việc nhanh hơn,{' '}
              <span className="bg-linear-to-r from-brand-100 to-accent-400 bg-clip-text text-transparent">nhẹ nhàng hơn.</span>
            </h2>
            <p className="text-slate-300">Bộ công cụ tự động hóa những việc lặp đi lặp lại mỗi ngày.</p>
          </div>
          <ul className="space-y-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-500/15 text-accent-400 ring-1 ring-accent-400/20">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="text-sm text-slate-400">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">© {new Date().getFullYear()} Jennie Work</p>
      </section>

      <section className="relative flex flex-1 items-center justify-center overflow-hidden p-6">
        <div className="pointer-events-none absolute -top-40 -right-40 h-96 w-96 rounded-full bg-brand-100 blur-3xl lg:hidden" />
        <div className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-accent-100 blur-3xl lg:hidden" />
        <LoginForm />
      </section>
    </main>
  );
}
