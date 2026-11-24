import type { Metadata } from 'next';
import { CheckingPayoutTool } from './CheckingPayoutTool';

export const metadata: Metadata = {
  title: 'Checking Payout',
};

export default function CheckingPayoutPage() {
  return <CheckingPayoutTool />;
}
