import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { NotificationsList } from '@/components/layout/NotificationsList';

export const metadata: Metadata = { title: 'Notifications — HorusEye' };

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  return <NotificationsList />;
}
