import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { basePathFor, readSession, SESSION_HEADER } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { NAV_GROUPS } from './config/navigation';

export default async function Home() {
  const token = (await headers()).get(SESSION_HEADER);
  const session = await readSession(token ?? undefined);
  const first = NAV_GROUPS.flatMap((g) => g.items).find((item) => session && can(session.permissions, item.permission));
  if (!first) {
    return <p className="text-sm text-slate-600">Tài khoản của bạn chưa được cấp quyền dùng chức năng nào. Liên hệ admin.</p>;
  }
  redirect(basePathFor(session, token) + first.href);
}
