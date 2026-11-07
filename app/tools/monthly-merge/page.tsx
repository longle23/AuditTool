import type { Metadata } from 'next';
import { MonthlyMergeTool } from './MonthlyMergeTool';

export const metadata: Metadata = {
  title: 'Gộp file theo tháng',
};

export default function MonthlyMergePage() {
  return <MonthlyMergeTool />;
}
