import type { Metadata } from 'next';
import { AccountTab } from '@/components/settings/AccountTab';

export const metadata: Metadata = { title: 'Account — HorusEye' };

export default function AccountPage() {
  return <AccountTab />;
}
