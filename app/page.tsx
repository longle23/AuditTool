import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { basePathFor, readSession, SESSION_HEADER } from '@/lib/auth';
import { NAV_GROUPS } from './config/navigation';

export default async function Home() {
  const token = (await headers()).get(SESSION_HEADER);
  redirect(basePathFor(await readSession(token ?? undefined), token) + NAV_GROUPS[0].items[0].href);
}
