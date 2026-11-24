import type { PeriodDay } from './types';

/** Excel serial date → YYYY-MM-DD (UTC date parts; Excel stores local calendar days). */
export function excelSerialToYmd(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const ms = Math.round((serial - 25569) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function ymdToLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function labelToYmd(label: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(label.trim());
  if (!m) return null;
  return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
}

/** Parse common VN/bank timestamps to YYYY-MM-DD. */
export function parseToYmd(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return excelSerialToYmd(value);

  const s = String(value).trim();
  if (!s) return null;

  // Excel serial stored as string
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20_000 && n < 100_000) return excelSerialToYmd(n);
  }

  let m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[6]}-${pad(+m[5])}-${pad(+m[4])}`;

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;

  m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // BIDV yymmdd in description
  m = /\b(\d{2})(\d{2})(\d{2})\b/.exec(s);
  if (m) {
    const yy = +m[1];
    const year = yy >= 70 ? 1900 + yy : 2000 + yy;
    return `${year}-${m[2]}-${m[3]}`;
  }

  return null;
}

export function formatYmdNote(ymd: string): string {
  return `GD ngày ${ymdToLabel(ymd)}`;
}

export function buildPeriod(days: Iterable<string>): PeriodDay[] {
  const uniq = [...new Set([...days].filter(Boolean))].sort();
  return uniq.map((ymd) => ({ ymd, label: ymdToLabel(ymd) }));
}

export function periodLabel(days: PeriodDay[]): string {
  if (days.length === 0) return '';
  if (days.length === 1) return days[0].label;
  return `${days[0].label}–${days[days.length - 1].label}`;
}

export function isInPeriod(ymd: string | null, period: Set<string>): boolean {
  return !!ymd && period.has(ymd);
}

/** MSB: midnight on first period day → treat as previous day. */
export function adjustMsbDate(ymd: string | null, timeText: string, periodSorted: string[]): string | null {
  if (!ymd || periodSorted.length === 0) return ymd;
  const first = periodSorted[0];
  if (ymd !== first) return ymd;
  const t = String(timeText);
  if (/00:00/.test(t) || /T00:00/.test(t)) {
    return addDays(ymd, -1);
  }
  return ymd;
}

export function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** Extract BIDV transaction date hint from diễn giải (yymmdd after mã). */
export function extractBidvDescDate(desc: string): string | null {
  const m = /_(\d{10})_(\d{6})_/.exec(desc);
  if (!m) return null;
  const yy = +m[2].slice(0, 2);
  const mm = m[2].slice(2, 4);
  const dd = m[2].slice(4, 6);
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  return `${year}-${mm}-${dd}`;
}
