export interface FilePeriod {
  startDay: number;
  endDay: number;
  month: number;
  year?: number;
}

const PERIOD_RE = /(?:^|[^\d])(\d{1,2})(?:\s*[-–_]\s*(\d{1,2}))?\s*[./_-]\s*(\d{1,2})(?:\s*[./_-]\s*(\d{4}|\d{2}))?(?!\d)/;

/** Parses names like `01-10.07`, `21-30.07.2026`, `31.07` into a day range within a month. */
export function parsePeriod(fileName: string): FilePeriod | null {
  const base = fileName.replace(/\.[^.]+$/, '');
  const m = PERIOD_RE.exec(base);
  if (!m) return null;

  const startDay = Number(m[1]);
  const endDay = m[2] ? Number(m[2]) : startDay;
  const month = Number(m[3]);
  let year = m[4] ? Number(m[4]) : undefined;
  if (year !== undefined && year < 100) year += 2000;

  if (month < 1 || month > 12) return null;
  if (startDay < 1 || endDay > 31 || startDay > endDay) return null;
  return { startDay, endDay, month, year };
}

export function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function formatPeriod(p: FilePeriod): string {
  const mm = String(p.month).padStart(2, '0');
  const d = (n: number) => String(n).padStart(2, '0');
  return p.startDay === p.endDay ? `${d(p.startDay)}/${mm}` : `${d(p.startDay)}–${d(p.endDay)}/${mm}`;
}

export function comparePeriods(a: FilePeriod | null, b: FilePeriod | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return (
    (a.year ?? 0) - (b.year ?? 0) || a.month - b.month || a.startDay - b.startDay || a.endDay - b.endDay
  );
}

/** Groups consecutive day numbers into readable ranges, e.g. [1,2,3,7] → "01–03, 07". */
export function formatDayRanges(days: number[]): string {
  const sorted = [...days].sort((a, b) => a - b);
  const parts: string[] = [];
  const d = (n: number) => String(n).padStart(2, '0');
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? d(start) : `${d(start)}–${d(sorted[i])}`);
  }
  return parts.join(', ');
}
