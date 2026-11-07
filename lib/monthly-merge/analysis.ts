import { compareHeaders, describeHeaderMismatch, type WorkbookInspection } from './merge';
import { comparePeriods, daysInMonth, formatDayRanges, formatPeriod, type FilePeriod } from './period';
import { EXCEL_MAX_ROWS } from '../xlsx/sheet-writer';

export type InspectState =
  | { status: 'checking' }
  | { status: 'ok'; inspection: WorkbookInspection }
  | { status: 'error'; message: string };

export interface SourceFile {
  id: string;
  file: File;
  period: FilePeriod | null;
  inspect: InspectState;
}

export interface Issue {
  level: 'error' | 'warning';
  message: string;
}

export interface MergePlan {
  files: SourceFile[];
  month: number | null;
  year: number;
  /** Number of files covering each day of the month (index 0 is day 1). */
  coverage: number[];
  totalRows: number | null;
  fileIssues: Map<string, Issue[]>;
  issues: Issue[];
  checking: boolean;
  canMerge: boolean;
  outputName: string;
  sheetName: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(time: number): string {
  const d = new Date(time);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function sortFiles(files: SourceFile[]): SourceFile[] {
  return [...files].sort(
    (a, b) => comparePeriods(a.period, b.period) || a.file.name.localeCompare(b.file.name, 'vi', { numeric: true }),
  );
}

export function buildPlan(input: SourceFile[]): MergePlan {
  const files = sortFiles(input);
  const fileIssues = new Map<string, Issue[]>();
  const issues: Issue[] = [];
  const addFileIssue = (file: SourceFile, issue: Issue) => {
    const list = fileIssues.get(file.id) ?? [];
    list.push(issue);
    fileIssues.set(file.id, list);
  };

  const monthCounts = new Map<number, number>();
  for (const f of files) if (f.period) monthCounts.set(f.period.month, (monthCounts.get(f.period.month) ?? 0) + 1);
  const month = [...monthCounts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const firstOk = files.find((f) => f.inspect.status === 'ok');
  const firstInspection = firstOk?.inspect.status === 'ok' ? firstOk.inspect.inspection : null;
  const year =
    files.find((f) => f.period?.year)?.period?.year ??
    (firstInspection?.sampleTime ? new Date(firstInspection.sampleTime).getUTCFullYear() : new Date().getFullYear());

  const coverage = new Array(month ? daysInMonth(month, year) : 31).fill(0);
  let totalRows: number | null = 0;

  for (const f of files) {
    if (!f.period) {
      addFileIssue(f, { level: 'warning', message: 'Không nhận diện được khoảng ngày từ tên file, sẽ xếp cuối danh sách.' });
    } else if (month !== null && f.period.month !== month) {
      addFileIssue(f, { level: 'warning', message: `Thuộc tháng ${pad(f.period.month)}, khác với các file còn lại.` });
    } else {
      for (let d = f.period.startDay; d <= Math.min(f.period.endDay, coverage.length); d++) coverage[d - 1]++;
    }

    if (f.inspect.status === 'error') {
      addFileIssue(f, { level: 'error', message: f.inspect.message });
      totalRows = null;
      continue;
    }
    if (f.inspect.status !== 'ok') {
      totalRows = null;
      continue;
    }

    const inspection = f.inspect.inspection;
    if (totalRows !== null) totalRows = inspection.rowCount === null ? null : totalRows + inspection.rowCount;

    if (firstInspection && f !== firstOk) {
      const cmp = compareHeaders(firstInspection.headers, inspection.headers);
      if (cmp.missing.length || cmp.extra.length) {
        addFileIssue(f, { level: 'error', message: describeHeaderMismatch(cmp) });
      }
    }

    if (f.period && inspection.sampleTime !== null) {
      const d = new Date(inspection.sampleTime);
      const day = d.getUTCDate();
      if (d.getUTCMonth() + 1 !== f.period.month || day < f.period.startDay || day > f.period.endDay) {
        addFileIssue(f, {
          level: 'warning',
          message: `Dữ liệu bên trong có ngày ${formatDate(inspection.sampleTime)}, không khớp kỳ ${formatPeriod(f.period)} trên tên file.`,
        });
      }
    }
  }

  if (files.length > 0 && month !== null) {
    const missing = coverage.flatMap((count, i) => (count === 0 ? [i + 1] : []));
    const overlap = coverage.flatMap((count, i) => (count > 1 ? [i + 1] : []));
    if (missing.length) issues.push({ level: 'warning', message: `Chưa có dữ liệu ngày ${formatDayRanges(missing)}.` });
    if (overlap.length) issues.push({ level: 'warning', message: `Ngày ${formatDayRanges(overlap)} xuất hiện ở nhiều file.` });
  }
  if (totalRows !== null && totalRows + 2 > EXCEL_MAX_ROWS) {
    issues.push({
      level: 'error',
      message: `Tổng ${totalRows.toLocaleString('vi-VN')} dòng vượt giới hạn ${EXCEL_MAX_ROWS.toLocaleString('vi-VN')} dòng của một sheet Excel.`,
    });
  }

  const checking = files.some((f) => f.inspect.status === 'checking');
  const hasErrors = issues.some((i) => i.level === 'error') || [...fileIssues.values()].flat().some((i) => i.level === 'error');
  const label = month ? `T${pad(month)}-${year}` : 'Tong-hop';

  return {
    files,
    month,
    year,
    coverage,
    totalRows,
    fileIssues,
    issues,
    checking,
    canMerge: files.length > 0 && !checking && !hasErrors,
    outputName: month ? `Tong-hop-${label}.xlsx` : `Tong-hop-${new Date().toISOString().slice(0, 10)}.xlsx`,
    sheetName: month ? `Tổng hợp ${label}` : 'Tổng hợp',
  };
}
