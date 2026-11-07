import { Clock } from 'lucide-react';

export function ExpiredScreen() {
  return (
    <main className="flex h-full items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-100 text-accent-600">
          <Clock className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold text-slate-900">Phiên sử dụng đã hết hạn</h1>
      </div>
    </main>
  );
}
