import type { Metadata } from 'next';
import { redirect }       from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes }         from '@/constants/routes';
import { UsersTab }       from '@/components/settings/UsersTab';

export const metadata: Metadata = { title: 'Users — HorusEye' };

export default async function UsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (user.role !== 'admin') redirect(routes.settings);
  return <UsersTab />;
}
