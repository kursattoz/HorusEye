import type { Metadata } from 'next';
import { AppearanceTab } from '@/components/settings/AppearanceTab';

export const metadata: Metadata = { title: 'Appearance — HorusEye' };

export default function AppearancePage() {
  return <AppearanceTab />;
}
