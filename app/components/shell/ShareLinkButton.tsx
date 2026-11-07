'use client';

import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { createShareLink } from '@/lib/auth-actions';

export function ShareLinkButton() {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(60);
  const [link, setLink] = useState('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setPending(true);
    setStatus('');
    try {
      const url = window.location.origin + (await createShareLink(minutes));
      setLink(url);
      await navigator.clipboard
        .writeText(url)
        .then(() => setStatus(`Đã sao chép link, dùng được ${minutes} phút`))
        .catch(() => setStatus('Không sao chép tự động được, hãy sao chép link ở trên'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Không tạo được link');
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setStatus('Đã sao chép link');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setStatus('Không sao chép được, hãy sao chép thủ công');
    }
  };

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
        Chia sẻ
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <label className="block space-y-1.5 text-sm font-medium text-slate-700">
            <span>Thời gian sử dụng (phút)</span>
            <input
              type="number"
              min={1}
              value={minutes}
              onChange={(event) => setMinutes(Number(event.target.value))}
              className="h-9 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </label>
          <Button className="w-full" onClick={create} disabled={pending || !(minutes >= 1)}>
            {pending ? 'Đang tạo…' : 'Tạo & sao chép link'}
          </Button>
          {link && (
            <div className="flex gap-2">
              <input
                readOnly
                value={link}
                onFocus={(event) => event.target.select()}
                aria-label="Link chia sẻ"
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-600"
              />
              <Button variant="secondary" className="shrink-0 px-3" onClick={copy} aria-label="Sao chép link">
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" aria-hidden="true" />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          )}
          {status && (
            <p role="status" className="text-xs text-slate-500">
              {status}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
