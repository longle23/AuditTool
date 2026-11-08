'use client';

import { useState } from 'react';
import { Check, Clock, Copy, Share2 } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { createShareLink } from '@/lib/auth-actions';

// Mirrors MAX_SHARE_MINUTES in lib/auth.ts, which is not imported here to keep its secret out of the client bundle.
const MAX_MINUTES = 4 * 60;
const STEP_MINUTES = 5;
const PRESETS = [15, 30, 60, 120, 240];

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} phút`;
  return rest ? `${hours} giờ ${rest} phút` : `${hours} giờ`;
}

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
        .then(() => setStatus(`Đã sao chép link, dùng được ${formatDuration(minutes)}`))
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
        <div className="absolute right-0 z-20 mt-2 w-80 space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span id="share-duration-label" className="text-sm font-medium text-slate-700">
                Thời gian sử dụng
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDuration(minutes)}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5" role="group" aria-labelledby="share-duration-label">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMinutes(preset)}
                  aria-pressed={minutes === preset}
                  className={`h-8 cursor-pointer rounded-lg border text-xs font-medium transition-colors ${
                    minutes === preset
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {preset < 60 ? `${preset}p` : `${preset / 60}h`}
                </button>
              ))}
            </div>

            <div>
              <input
                type="range"
                min={STEP_MINUTES}
                max={MAX_MINUTES}
                step={STEP_MINUTES}
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
                aria-labelledby="share-duration-label"
                aria-valuetext={formatDuration(minutes)}
                className="w-full cursor-pointer accent-brand-600"
              />
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>{STEP_MINUTES} phút</span>
                <span>Tối đa {MAX_MINUTES / 60} giờ</span>
              </div>
            </div>
          </div>

          <Button className="w-full" onClick={create} disabled={pending}>
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
