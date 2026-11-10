'use server';

import { headers } from 'next/headers';
import { isExpired, readSession, SESSION_HEADER } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { writeLog } from '@/lib/usage-log';

export interface MergeLogInput {
  ok: boolean;
  period: string;
  outputName: string;
  fileCount: number;
  totalRows?: number;
  sizeBytes?: number;
  durationMs: number;
  controlTotalsOk?: boolean | null;
  duplicateCount?: number;
  files: { name: string; rows?: number }[];
  error?: string;
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : null);

/** Called by the browser after each merge; only the summary is sent, never the file contents. */
export async function logMerge(input: MergeLogInput) {
  const session = await readSession((await headers()).get(SESSION_HEADER) ?? undefined);
  if (!session || isExpired(session) || !can(session.permissions, 'tools.monthly-merge')) return;

  // Trust boundary: the browser controls this payload, so keep only known fields with bounded sizes.
  await writeLog('merge_logs', {
    status: input.ok ? 'success' : 'failed',
    username: session.username,
    role: session.role,
    period: str(input.period, 20),
    output_name: str(input.outputName, 255),
    file_count: num(input.fileCount),
    total_rows: num(input.totalRows),
    size_bytes: num(input.sizeBytes),
    duration_ms: num(input.durationMs),
    control_totals_ok: typeof input.controlTotalsOk === 'boolean' ? input.controlTotalsOk : null,
    duplicate_count: num(input.duplicateCount),
    files: Array.isArray(input.files)
      ? input.files.slice(0, 100).map((f) => ({ name: str(f?.name, 255), rows: num(f?.rows) }))
      : [],
    error: str(input.error, 1000),
  });
}
