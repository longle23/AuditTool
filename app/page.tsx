import { redirect } from 'next/navigation';
import { NAV_GROUPS } from './config/navigation';

export default function Home() {
  redirect(NAV_GROUPS[0].items[0].href);
}
