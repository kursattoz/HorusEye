import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { DevRolesTab } from '@/components/settings/DevRolesTab';

export const metadata: Metadata = { title: 'Dev Roles — HorusEye' };

export default async function DevRolesPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (user.role !== 'admin') redirect(routes.dashboard);
  return <DevRolesTab />;
}
