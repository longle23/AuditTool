import { AlertTriangle, CheckCircle2, Download, XCircle } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { Card } from '@/app/components/ui/Card';
import type { DuplicateReport } from '@/lib/monthly-merge/audit-checks';
import type { MergeResult } from '@/lib/monthly-merge/merge';

const PREVIEW_LIMIT = 100;

const formatNumber = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadDuplicatesCsv(reports: DuplicateReport[], fileNames: string[], baseName: string) {
  const lines = [['Cột', 'Mã', 'Số lần xuất hiện', 'Dòng trong file gộp', 'File nguồn'].join(',')];
  for (const report of reports) {
    for (const item of report.items) {
      for (const o of item.occurrences) {
        lines.push(
          [report.column, item.value, item.count, o.row, fileNames[o.fileIndex] ?? ''].map(csvCell).join(','),
        );
      }
    }
  }
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName.replace(/\.xlsx$/i, '')}-ma-trung.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AuditChecks({ result, outputName }: { result: MergeResult; outputName: string }) {
  return (
    <div className="mt-6 space-y-6">
      <ControlTotalsCard result={result} />
      <DuplicatesCard result={result} outputName={outputName} />
    </div>
  );
}

function ControlTotalsCard({ result }: { result: MergeResult }) {
  const report = result.controlTotals;
  if (!report) return null;

  const visible = report.columns.flatMap((name, i) =>
    report.files.some((f) => f.totals[i] !== 0) || report.total.totals[i] !== 0 ? [i] : [],
  );
  const hidden = report.columns.length - visible.length;

  return (
    <Card
      title="Tổng kiểm soát"
      description="Tổng các cột số tiền theo từng file nguồn và toàn bộ file gộp, dùng để đối chiếu với báo cáo hệ thống."
      bodyClassName=""
      actions={
        report.reconciled ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Khớp với file nguồn
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
            <XCircle className="h-3.5 w-3.5" /> Lệch so với file nguồn
          </span>
        )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <th className="py-2 pl-5 pr-4 text-left font-medium">File</th>
              <th className="py-2 pr-4 text-right font-medium">Số dòng</th>
              {visible.map((i) => (
                <th key={i} className="py-2 pr-5 text-right font-medium">
                  {report.columns[i]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 tabular-nums">
            {report.files.map((f) => (
              <tr key={f.name}>
                <td className="py-2 pl-5 pr-4 text-slate-700">{f.name}</td>
                <td className="py-2 pr-4 text-right text-slate-700">{formatNumber(f.rows)}</td>
                {visible.map((i) => (
                  <td key={i} className="py-2 pr-5 text-right text-slate-700">
                    {formatNumber(f.totals[i])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="tabular-nums">
            <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <td className="py-2.5 pl-5 pr-4">{report.total.name}</td>
              <td className="py-2.5 pr-4 text-right">{formatNumber(report.total.rows)}</td>
              {visible.map((i) => (
                <td key={i} className="py-2.5 pr-5 text-right">
                  {formatNumber(report.total.totals[i])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {hidden > 0 && (
        <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
          Ẩn {hidden} cột có tổng bằng 0: {report.columns.filter((_, i) => !visible.includes(i)).join(', ')}.
        </p>
      )}
    </Card>
  );
}

function DuplicatesCard({ result, outputName }: { result: MergeResult; outputName: string }) {
  const reports = result.duplicates;
  if (reports.length === 0) return null;

  const fileNames = result.files.map((f) => f.name);
  const total = reports.reduce((s, r) => s + r.duplicateValues, 0);
  const preview = reports
    .flatMap((r) => r.items.map((item) => ({ column: r.column, item, crossFile: new Set(item.occurrences.map((o) => o.fileIndex)).size > 1 })))
    .sort((a, b) => Number(b.crossFile) - Number(a.crossFile) || b.item.count - a.item.count)
    .slice(0, PREVIEW_LIMIT);

  return (
    <Card
      title="Giao dịch trùng mã"
      description={`Kiểm tra trùng trên các cột: ${reports.map((r) => r.column).join(', ')}. Số dòng tính theo file gộp (dòng 1 là tổng SUBTOTAL, dòng 2 là tiêu đề).`}
      bodyClassName=""
      actions={
        total > 0 && (
          <Button variant="secondary" size="sm" onClick={() => downloadDuplicatesCsv(reports, fileNames, outputName)}>
            <Download className="h-3.5 w-3.5" />
            Xuất CSV
          </Button>
        )
      }
    >
      <div className="flex flex-wrap gap-3 px-5 py-4">
        {reports.map((r) => (
          <div
            key={r.column}
            className={`flex min-w-56 flex-1 items-start gap-2.5 rounded-md border px-3.5 py-3 ${
              r.duplicateValues ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60'
            }`}
          >
            {r.duplicateValues ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <div className="text-sm">
              <p className="font-medium text-slate-900">{r.column}</p>
              {r.duplicateValues ? (
                <p className="mt-0.5 text-xs text-slate-600">
                  <span className="font-semibold text-amber-700">{formatNumber(r.duplicateValues)}</span> mã trùng ·{' '}
                  {formatNumber(r.duplicateRows)} dòng liên quan
                  {r.crossFileValues > 0 && (
                    <>
                      {' '}
                      · <span className="font-semibold text-amber-700">{formatNumber(r.crossFileValues)}</span> mã trùng
                      giữa các file
                    </>
                  )}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-emerald-700">Không có mã trùng</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {preview.length > 0 && (
        <>
          <div className="max-h-96 overflow-auto border-t border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <th className="py-2 pl-5 pr-4 font-medium">Cột</th>
                  <th className="py-2 pr-4 font-medium">Mã</th>
                  <th className="whitespace-nowrap py-2 pr-4 text-right font-medium">Số lần</th>
                  <th className="py-2 pr-5 font-medium">Vị trí (dòng · file)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.map(({ column, item, crossFile }) => (
                  <tr key={`${column}:${item.value}`} className="align-top">
                    <td className="whitespace-nowrap py-2 pl-5 pr-4 text-slate-500">{column}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-900">
                      {item.value}
                      {crossFile && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[10px] font-medium text-amber-800">
                          Khác file
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-slate-700">{item.count}</td>
                    <td className="py-2 pr-5 text-xs tabular-nums text-slate-600">
                      {item.occurrences.map((o) => (
                        <div key={o.row} className="whitespace-nowrap">
                          Dòng {o.row.toLocaleString('vi-VN')} · {fileNames[o.fileIndex]}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > preview.length && (
            <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-500">
              Hiển thị {preview.length}/{formatNumber(total)} mã. Bấm “Xuất CSV” để xem toàn bộ.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
