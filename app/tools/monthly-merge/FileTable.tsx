import { AlertCircle, AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, X } from 'lucide-react';
import type { Issue, SourceFile } from '@/lib/monthly-merge/analysis';
import { formatPeriod } from '@/lib/monthly-merge/period';

interface FileTableProps {
  files: SourceFile[];
  fileIssues: Map<string, Issue[]>;
  disabled: boolean;
  onRemove: (id: string) => void;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function StatusBadge({ file, issues }: { file: SourceFile; issues: Issue[] }) {
  if (file.inspect.status === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang kiểm tra
      </span>
    );
  }
  if (issues.some((i) => i.level === 'error')) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <AlertCircle className="h-3.5 w-3.5" /> Lỗi
      </span>
    );
  }
  if (issues.length) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5" /> Cần xem
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> Hợp lệ
    </span>
  );
}

export function FileTable({ files, fileIssues, disabled, onRemove }: FileTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
          <th className="w-10 py-2 pl-5 pr-2 font-medium">#</th>
          <th className="py-2 pr-4 font-medium">Tên file</th>
          <th className="py-2 pr-4 font-medium">Kỳ</th>
          <th className="py-2 pr-4 text-right font-medium">Số dòng</th>
          <th className="py-2 pr-4 font-medium">Trạng thái</th>
          <th className="w-12 py-2 pr-3" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {files.map((file, index) => {
          const issues = fileIssues.get(file.id) ?? [];
          const rows = file.inspect.status === 'ok' ? file.inspect.inspection.rowCount : null;
          return (
            <tr key={file.id} className="align-top hover:bg-slate-50/60">
              <td className="py-3 pl-5 pr-2 tabular-nums text-slate-400">{index + 1}</td>
              <td className="py-3 pr-4">
                <div className="flex items-start gap-2.5">
                  <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{file.file.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(file.file.size)}</p>
                    {issues.map((issue, i) => (
                      <p
                        key={i}
                        className={`mt-1 text-xs ${issue.level === 'error' ? 'text-red-600' : 'text-amber-700'}`}
                      >
                        {issue.message}
                      </p>
                    ))}
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap py-3 pr-4 tabular-nums text-slate-700">
                {file.period ? formatPeriod(file.period) : <span className="text-slate-400">—</span>}
              </td>
              <td className="whitespace-nowrap py-3 pr-4 text-right tabular-nums text-slate-700">
                {rows !== null ? rows.toLocaleString('vi-VN') : <span className="text-slate-400">—</span>}
              </td>
              <td className="whitespace-nowrap py-3 pr-4">
                <StatusBadge file={file} issues={issues} />
              </td>
              <td className="py-2.5 pr-3 text-right">
                <button
                  type="button"
                  onClick={() => onRemove(file.id)}
                  disabled={disabled}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:pointer-events-none disabled:opacity-40"
                  title="Bỏ file"
                >
                  <X className="h-4 w-4" />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
