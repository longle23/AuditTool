'use client';

import { useCallback, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  RotateCcw,
  Scale,
  UploadCloud,
} from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { Card } from '@/app/components/ui/Card';
import { PageHeader } from '@/app/components/ui/PageHeader';
import type { CheckingProgress, CheckingResult } from '@/lib/checking-payout/types';
import type { WorkerResponse } from '@/lib/checking-payout/worker-protocol';
import { logChecking } from './actions';
import { useCheckingWorker } from './useCheckingWorker';

type Job =
  | { status: 'idle' }
  | { status: 'running'; startedAt: number; progress: CheckingProgress | null }
  | { status: 'done'; url: string; fileName: string; size: number; result: CheckingResult; durationMs: number }
  | { status: 'error'; message: string };

const XLSX_ACCEPT = { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] };

function triggerDownload(url: string, fileName: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function outputName(input: string): string {
  const base = input.replace(/\.xlsx$/i, '');
  return `${base}_ketqua.xlsx`;
}

export function CheckingPayoutTool() {
  const [file, setFile] = useState<File | null>(null);
  const [sheets, setSheets] = useState<{ role: string; name: string }[]>([]);
  const [job, setJob] = useState<Job>({ status: 'idle' });
  const outputNameRef = useRef('');
  const startedAtRef = useRef(0);

  const handleMessage = useCallback((message: WorkerResponse) => {
    switch (message.type) {
      case 'inspected':
        setSheets(message.sheets);
        break;
      case 'inspect-error':
        setSheets([]);
        setJob({ status: 'error', message: message.message });
        break;
      case 'progress':
        setJob((prev) => (prev.status === 'running' ? { ...prev, progress: message.progress } : prev));
        break;
      case 'done': {
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
        const { summary } = message.result;
        void logChecking({
          ok: true,
          outputName: fileName,
          period: summary.periodLabel,
          durationMs: Date.now() - startedAtRef.current,
          matched: summary.matched,
          boMissing: summary.boMissingOnSk,
          skMissing: summary.skMissingOnBo,
          amountMismatch: summary.amountMismatch,
          bankCount: summary.banks.length,
          sizeBytes: message.blob.size,
        });
        break;
      }
      case 'error':
        setJob({ status: 'error', message: message.message });
        void logChecking({
          ok: false,
          outputName: outputNameRef.current,
          period: '',
          durationMs: Date.now() - startedAtRef.current,
          error: message.message,
        });
        break;
    }
  }, []);

  const { post, reset } = useCheckingWorker(handleMessage);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const next = accepted[0];
      if (!next) return;
      reset();
      setJob({ status: 'idle' });
      setFile(next);
      setSheets([]);
      post({ type: 'inspect', file: next });
    },
    [post, reset],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: XLSX_ACCEPT,
    multiple: false,
    disabled: job.status === 'running',
  });

  const run = () => {
    if (!file) return;
    outputNameRef.current = outputName(file.name);
    startedAtRef.current = Date.now();
    setJob({ status: 'running', startedAt: startedAtRef.current, progress: null });
    post({ type: 'run', file });
  };

  const clear = () => {
    reset();
    setFile(null);
    setSheets([]);
    setJob({ status: 'idle' });
  };

  const running = job.status === 'running';

  return (
    <div>
      <PageHeader
        title="Checking Payout"
        description="Đối chiếu CHI HỘ trên BO với ghi nợ sao kê theo mã GD (2 chiều BO ↔ Sao kê)."
      />

      <div className="space-y-4">
        <Card title="File dữ liệu" description="1 workbook gồm sheet BO + sao kê từng ngân hàng (+ VietQR nếu có).">
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-10 text-center transition-colors ${
              isDragActive ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-400'
            }`}
          >
            <input {...getInputProps()} />
            <UploadCloud className="mb-2 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-700">Kéo thả hoặc chọn file .xlsx</p>
            <p className="mt-1 text-xs text-slate-500">Sheet được nhận diện theo tên (BO, Sao ke TPB/BIDV/…)</p>
          </div>

          {file && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={clear} disabled={running}>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Đổi file
                </Button>
                <Button size="sm" onClick={run} disabled={running || sheets.length === 0}>
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
                  Chạy đối soát
                </Button>
              </div>
            </div>
          )}

          {sheets.length > 0 && (
            <ul className="mt-3 grid gap-1 sm:grid-cols-2">
              {sheets.map((s) => (
                <li key={s.name} className="rounded-md bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                  <span className="font-medium text-slate-800">{s.role}</span>
                  <span className="text-slate-400"> — </span>
                  {s.name}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {job.status === 'running' && (
          <Card>
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
              <div>
                <p className="text-sm font-medium text-slate-800">{job.progress?.message ?? 'Đang xử lý…'}</p>
                <div className="mt-2 h-1.5 w-64 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-brand-600 transition-all"
                    style={{ width: `${Math.round((job.progress?.fraction ?? 0) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>
        )}

        {job.status === 'error' && (
          <Card>
            <div className="flex items-start gap-3 text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-sm">{job.message}</p>
            </div>
          </Card>
        )}

        {job.status === 'done' && (
          <Card title="Kết quả" description={`Kỳ ${job.result.summary.periodLabel || '—'}`}>
            <div className="mb-4 flex flex-wrap gap-3">
              <Stat label="Khớp" value={job.result.summary.matched} />
              <Stat label="BO thiếu trên SK" value={job.result.summary.boMissingOnSk} />
              <Stat label="SK thiếu trên BO" value={job.result.summary.skMissingOnBo} />
              <Stat label="Lệch tiền" value={job.result.summary.amountMismatch} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Ngân hàng</th>
                    <th className="py-2 pr-3 font-medium">BO</th>
                    <th className="py-2 pr-3 font-medium">SK ghi nợ</th>
                    <th className="py-2 pr-3 font-medium">Khớp</th>
                    <th className="py-2 font-medium">Lệch / bất thường</th>
                  </tr>
                </thead>
                <tbody>
                  {job.result.summary.banks.map((b) => (
                    <tr key={b.bank} className="border-b border-slate-100">
                      <td className="py-2 pr-3 font-medium text-slate-800">{b.bank}</td>
                      <td className="py-2 pr-3">{b.boRows}</td>
                      <td className="py-2 pr-3">{b.skDebitRows}</td>
                      <td className="py-2 pr-3 text-emerald-700">{b.matched}</td>
                      <td className="py-2 text-amber-700">{b.mismatches}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => triggerDownload(job.url, job.fileName)}
              >
                <Download className="h-3.5 w-3.5" />
                Tải lại {job.fileName}
              </Button>
              <span className="text-xs text-slate-500">
                {(job.size / 1024 / 1024).toFixed(2)} MB · {(job.durationMs / 1000).toFixed(1)}s
              </span>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value.toLocaleString('vi-VN')}</p>
    </div>
  );
}
