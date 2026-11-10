import { headers } from 'next/headers';
import { insertRow, type Row } from './nocodb';

export type AuthAction = 'login' | 'login_failed' | 'logout' | 'share_link';

/**
 * Server-only. Appends a row (plus ip/user_agent) to a NocoDB log table: `auth_logs`, `merge_logs`,
 * or a new `<tool>_logs` table. Never throws: a logging failure must not block login or tools.
 */
export async function writeLog(table: string, row: Row) {
  try {
    const h = await headers();
    await insertRow(table, {
      ...row,
      ip: h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip'),
      user_agent: h.get('user-agent'),
    });
  } catch (error) {
    console.error(`Ghi log vào "${table}" thất bại:`, error);
  }
}
