import type { ByteSource } from '../xlsx/byte-source';
import { exportCheckingResult } from './export';
import { parseCheckingWorkbook } from './parse';
import { buildBankPivot, buildLoaiStatus, buildPivot, buildVietQrNcc } from './pivot';
import { reconcileWorkbook } from './reconcile';
import type { CheckingProgress, CheckingResult } from './types';

export async function runCheckingPayout(
  source: ByteSource,
  options: {
    onData: (chunk: Uint8Array, final: boolean) => void;
    onProgress?: (p: CheckingProgress) => void;
  },
): Promise<CheckingResult> {
  const parsed = await parseCheckingWorkbook(source, options.onProgress);
  const { anomalies, summary } = reconcileWorkbook(parsed, options.onProgress);
  const { pivot, balance } = buildPivot(parsed.bo.rows, parsed.statements, parsed.vietQr);
  const bankPivot = buildBankPivot(parsed.bo.rows);
  const loaiStatus = buildLoaiStatus(parsed.bo.rows);
  const vietQrNcc = buildVietQrNcc(parsed.vietQr);

  await exportCheckingResult({
    bo: parsed.bo,
    boPrev: parsed.boPrev,
    statements: parsed.statements,
    vietQr: parsed.vietQr,
    pivot,
    balance,
    bankPivot,
    loaiStatus,
    vietQrNcc,
    anomalies,
    periodLabel: parsed.periodLabel,
    onData: options.onData,
    onProgress: options.onProgress,
  });

  return { summary, anomalies, pivot, balance };
}

export async function inspectCheckingSheets(source: ByteSource): Promise<{ sheets: { role: string; name: string }[]; periodHint: string }> {
  const { listSheets } = await import('../xlsx/sheet-reader');
  const { classifyDetectedSheets } = await import('./parse');
  const { sheets } = await listSheets(source);
  const visible = sheets.filter((s) => !s.hidden && !s.name.startsWith('_')).map((s) => s.name);
  return { sheets: classifyDetectedSheets(visible), periodHint: '' };
}
