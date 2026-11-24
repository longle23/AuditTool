'use server';

import { headers } from 'next/headers';
import { isExpired, readSession, SESSION_HEADER } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { writeLog } from '@/lib/usage-log';

export interface CheckingLogInput {
  ok: boolean;
  outputName: string;
  period: string;
  durationMs: number;
  matched?: number;
  boMissing?: number;
  skMissing?: number;
  amountMismatch?: number;
  bankCount?: number;
  sizeBytes?: number;
  error?: string;
}

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : null);

export async function logChecking(input: CheckingLogInput) {
  const session = await readSession((await headers()).get(SESSION_HEADER) ?? undefined);
  if (!session || isExpired(session) || !can(session.permissions, 'tools.checking-payout')) return;

  await writeLog('checking_payout_logs', {
    status: input.ok ? 'success' : 'failed',
    username: session.username,
    role: session.role,
    period: str(input.period, 40),
    output_name: str(input.outputName, 255),
    duration_ms: num(input.durationMs),
    matched: num(input.matched),
    bo_missing: num(input.boMissing),
    sk_missing: num(input.skMissing),
    amount_mismatch: num(input.amountMismatch),
    bank_count: num(input.bankCount),
    size_bytes: num(input.sizeBytes),
    error: str(input.error, 1000),
  });
}
