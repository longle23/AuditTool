'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileStack,
  Loader2,
  Merge,
  RotateCcw,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { Card } from '@/app/components/ui/Card';
import { PageHeader } from '@/app/components/ui/PageHeader';
import { buildPlan, formatDate, type SourceFile } from '@/lib/monthly-merge/analysis';
import type { MergeProgress, MergeResult } from '@/lib/monthly-merge/merge';
import { parsePeriod } from '@/lib/monthly-merge/period';
import type { WorkerResponse } from '@/lib/monthly-merge/worker-protocol';
import { AuditChecks } from './AuditChecks';
import { CoverageBar } from './CoverageBar';
import { FileTable, formatBytes } from './FileTable';
import { useMergeWorker } from './useMergeWorker';

type Job =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number; progress: MergeProgress | null }
  | { status: 'done'; url: string; fileName: string; size: number; result: MergeResult; durationMs: number }
  | { status: 'error'; message: string };

const XLSX_ACCEPT = { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] };

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} giây` : `${Math.floor(s / 60)} phút ${String(s % 60).padStart(2, '0')} giây`;
}

function formatDayRange(first: number, last: number): string {
  const a = formatDate(first).slice(0, 5);
  const b = formatDate(last).slice(0, 5);
  return a === b ? a : `${a}–${b}`;
}

function triggerDownload(url: string, fileName: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function MonthlyMergeTool() {
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [job, setJob] = useState<Job>({ status: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const outputNameRef = useRef('');

  const plan = useMemo(() => buildPlan(files), [files]);
  const running = job.status === 'running';

  const handleMessage = useCallback((message: WorkerResponse) => {
    switch (message.type) {
      case 'inspected':
        setFiles((prev) =>
          prev.map((f) => (f.id === message.id ? { ...f, inspect: { status: 'ok', inspection: message.inspection } } : f)),
        );
        break;
      case 'inspect-error':
        setFiles((prev) =>
          prev.map((f) => (f.id === message.id ? { ...f, inspect: { status: 'error', message: message.message } } : f)),
        );
        break;
      case 'progress':
        setJob((prev) => (prev.status === 'running' ? { ...prev, progress: message.progress } : prev));
        break;
      case 'merged': {
        const url = URL.createObjectURL(message.blob);
        const fileName = outputNameRef.current;
        setJob((prev) => ({
          status: 'done',
          url,
          fileName,
          size: message.blob.size,
          result: message.result,
          durationMs: prev.status === 'running' ? Date.now() - prev.startedAt : 0,
        }));
        triggerDownload(url, fileName);
        break;
      }
      case 'merge-error':
        setJob({ status: 'error', message: message.message });
        break;
    }
  }, []);

  const worker = useMergeWorker(handleMessage);

  const clearResult = useCallback(() => {
    setJob((prev) => {
      if (prev.status === 'done') URL.revokeObjectURL(prev.url);
      return { status: 'idle' };
    });
  }, []);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const onDrop = useCallback(
    (dropped: File[]) => {
      // Excel's "~$name.xlsx" owner files appear next to any workbook that is open.
      const accepted = dropped.filter((f) => !f.name.startsWith('~$'));
      if (accepted.length === 0) return;
      clearResult();
      const added: SourceFile[] = accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        period: parsePeriod(file.name),
        inspect: { status: 'checking' },
      }));
      setFiles((prev) => [...prev.filter((p) => !accepted.some((a) => a.name === p.file.name)), ...added]);
      for (const f of added) worker.post({ type: 'inspect', id: f.id, file: f.file });
    },
    [clearResult, worker],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: XLSX_ACCEPT,
    multiple: true,
    disabled: running,
  });

  const removeFile = (id: string) => {
    clearResult();
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const clearAll = () => {
    clearResult();
    setFiles([]);
  };

  const startMerge = () => {
    if (!plan.canMerge) return;
    clearResult();
    outputNameRef.current = plan.outputName;
    setNow(Date.now());
    setJob({ status: 'running', startedAt: Date.now(), progress: null });
    worker.post({
      type: 'merge',
      sheetName: plan.sheetName,
      files: plan.files.map((f) => ({ name: f.file.name, file: f.file })),
    });
  };

  const cancelMerge = () => {
    worker.reset();
    setJob({ status: 'idle' });
  };

  const monthLabel = plan.month ? `Tháng ${String(plan.month).padStart(2, '0')}/${plan.year}` : '—';
  const errorCount =
    plan.issues.filter((i) => i.level === 'error').length +
    [...plan.fileIssues.values()].flat().filter((i) => i.level === 'error').length;

  return (
    <>
      <PageHeader
        title="Gộp file theo tháng"
        description="Gộp các file giao dịch theo kỳ (01-10, 11-20, 21-30, 31) thành một sheet duy nhất, sắp xếp từ đầu đến cuối tháng."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card
          title="Tệp nguồn"
          description="Tên file theo dạng 01-10.07, 11-20.07, 21-30.07, 31.07 — hệ thống tự sắp xếp theo ngày."
          bodyClassName=""
          actions={
            files.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} disabled={running}>
                Xóa tất cả
              </Button>
            )
          }
        >
          <div className="p-5">
            <div
              {...getRootProps()}
              className={`flex cursor-pointer items-center justify-center gap-4 rounded-md border border-dashed px-6 text-center transition-colors ${
                files.length ? 'py-5' : 'py-12'
              } ${
                isDragActive
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'
              } ${running ? 'pointer-events-none opacity-50' : ''}`}
            >
              <input {...getInputProps()} />
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-xs ring-1 ring-slate-200">
                <UploadCloud className="h-5 w-5 text-brand-600" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-900">
                  {isDragActive ? 'Thả file vào đây' : 'Kéo thả file Excel hoặc bấm để chọn'}
                </p>
                <p className="text-xs text-slate-500">Chỉ nhận .xlsx · có thể chọn nhiều file cùng lúc</p>
              </div>
            </div>
            {fileRejections.length > 0 && (
              <p className="mt-2 text-xs text-red-600">
                Bỏ qua {fileRejections.length} file không phải .xlsx:{' '}
                {fileRejections.map((r) => r.file.name).join(', ')}
              </p>
            )}
          </div>

          {files.length > 0 ? (
            <div className="border-t border-slate-200">
              <FileTable files={plan.files} fileIssues={plan.fileIssues} disabled={running} onRemove={removeFile} />
            </div>
          ) : (
            <div className="flex items-center gap-2 border-t border-slate-200 px-5 py-4 text-xs text-slate-500">
              <FileStack className="h-4 w-4" />
              Chưa có file nào được chọn.
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Tóm tắt">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Kỳ dữ liệu</dt>
                <dd className="font-medium text-slate-900">{monthLabel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Số file</dt>
                <dd className="font-medium tabular-nums text-slate-900">{files.length}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Tổng số dòng</dt>
                <dd className="font-medium tabular-nums text-slate-900">
                  {plan.checking ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : plan.totalRows !== null && files.length ? (
                    plan.totalRows.toLocaleString('vi-VN')
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>

            {plan.month && files.length > 0 && (
              <div className="mt-5">
                <CoverageBar coverage={plan.coverage} month={plan.month} />
              </div>
            )}

            {plan.issues.length > 0 && (
              <ul className="mt-5 space-y-2">
                {plan.issues.map((issue, i) => (
                  <li
                    key={i}
                    className={`flex gap-2 rounded-md px-3 py-2 text-xs ${
                      issue.level === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {issue.level === 'error' ? (
                      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
                    )}
                    {issue.message}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 border-t border-slate-100 pt-5">
              {running ? (
                <RunningPanel job={job} now={now} onCancel={cancelMerge} />
              ) : (
                <>
                  <Button size="lg" className="w-full" onClick={startMerge} disabled={!plan.canMerge}>
                    <Merge className="h-4 w-4" />
                    Gộp và tải xuống
                  </Button>
                  {files.length > 0 && !plan.checking && errorCount > 0 && (
                    <p className="mt-2 text-center text-xs text-red-600">Cần xử lý {errorCount} lỗi trước khi gộp.</p>
                  )}
                  {files.length > 0 && plan.canMerge && (
                    <p className="mt-2 truncate text-center text-xs text-slate-500" title={plan.outputName}>
                      Kết quả: {plan.outputName}
                    </p>
                  )}
                </>
              )}
            </div>
          </Card>

          {job.status === 'done' && (
            <ResultPanel job={job} onDownload={() => triggerDownload(job.url, job.fileName)} onReset={clearAll} />
          )}

          {job.status === 'error' && (
            <Card>
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">Gộp file thất bại</p>
                  <p className="mt-1 break-words text-xs text-slate-600">{job.message}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {job.status === 'done' && <AuditChecks result={job.result} outputName={job.fileName} />}
    </>
  );
}

const PHASE_LABEL: Record<MergeProgress['phase'], string> = {
  reading: 'Đang đọc',
  writing: 'Đang ghi',
  finalizing: 'Đang hoàn tất file Excel',
};

function RunningPanel({ job, now, onCancel }: { job: Job; now: number; onCancel: () => void }) {
  if (job.status !== 'running') return null;
  const p = job.progress;
  const percent = Math.round((p?.fraction ?? 0) * 100);
  const label = !p
    ? 'Đang chuẩn bị…'
    : p.phase === 'finalizing'
      ? PHASE_LABEL.finalizing
      : `${PHASE_LABEL[p.phase]} ${p.fileName} (${p.fileIndex + 1}/${p.fileCount})`;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
        <span className="flex min-w-0 items-center gap-1.5 text-slate-700">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-brand-600" />
          <span className="truncate">{label}</span>
        </span>
        <span className="font-medium tabular-nums text-slate-900">{percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-linear-to-r from-brand-600 to-accent-500 transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-slate-500">
        <span>{(p?.rows ?? 0).toLocaleString('vi-VN')} dòng</span>
        <span>{formatDuration(now - job.startedAt)}</span>
      </div>
      <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={onCancel}>
        Hủy
      </Button>
    </div>
  );
}

function ResultPanel({
  job,
  onDownload,
  onReset,
}: {
  job: Extract<Job, { status: 'done' }>;
  onDownload: () => void;
  onReset: () => void;
}) {
  const { result } = job;
  const reversed = result.files.some((f) => f.reversed);
  const reordered = result.files.filter((f) => f.columnsReordered);
  const duplicateCount = result.duplicates.reduce((s, d) => s + d.duplicateValues, 0);

  return (
    <Card>
      <div className="flex items-start gap-3">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">Đã gộp xong</p>
          <p className="truncate text-xs text-slate-500" title={job.fileName}>
            {job.fileName}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          ['Dòng', result.rows.toLocaleString('vi-VN')],
          ['Dung lượng', formatBytes(job.size)],
          ['Thời gian', formatDuration(job.durationMs)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md bg-slate-50 px-2 py-2">
            <dt className="text-[11px] text-slate-500">{label}</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-4 divide-y divide-slate-100 text-xs">
        {result.files.map((f) => (
          <li key={f.name} className="flex justify-between gap-3 py-1.5">
            <span className="min-w-0 truncate text-slate-700" title={f.name}>
              {f.name}
            </span>
            <span className="shrink-0 tabular-nums text-slate-500">
              {f.firstTime !== null && f.lastTime !== null && `${formatDayRange(f.firstTime, f.lastTime)} · `}
              {f.rows.toLocaleString('vi-VN')}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1.5 text-xs">
        {result.controlTotals && (
          <p className={`flex items-center gap-1.5 ${result.controlTotals.reconciled ? 'text-emerald-700' : 'text-red-700'}`}>
            {result.controlTotals.reconciled ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            Tổng kiểm soát {result.controlTotals.reconciled ? 'khớp với file nguồn' : 'lệch so với file nguồn'}
          </p>
        )}
        {result.duplicates.length > 0 && (
          <p className={`flex items-center gap-1.5 ${duplicateCount ? 'text-amber-700' : 'text-emerald-700'}`}>
            {duplicateCount ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {duplicateCount ? `${duplicateCount.toLocaleString('vi-VN')} mã giao dịch bị trùng` : 'Không có mã giao dịch trùng'}
          </p>
        )}
      </div>

      <ul className="mt-3 space-y-1 text-xs text-slate-500">
        {reversed && result.timeColumn && <li>• Sắp xếp tăng dần theo cột “{result.timeColumn}”.</li>}
        {result.renumberedColumn && <li>• Cột “{result.renumberedColumn}” được đánh số lại liên tục.</li>}
        {reordered.length > 0 && <li>• Đã căn lại thứ tự cột cho {reordered.map((f) => f.name).join(', ')}.</li>}
      </ul>

      <div className="mt-4 flex gap-2">
        <Button className="flex-1" onClick={onDownload}>
          <Download className="h-4 w-4" />
          Tải xuống
        </Button>
        <Button variant="secondary" onClick={onReset} title="Làm phiên mới">
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
    </Card>
  );
}
