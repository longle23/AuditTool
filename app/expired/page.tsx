import type { Metadata } from 'next';
import { ExpiredScreen } from '@/app/components/shell/ExpiredScreen';

export const metadata: Metadata = { title: 'Hết hạn' };

export default function ExpiredPage() {
  return <ExpiredScreen />;
}
