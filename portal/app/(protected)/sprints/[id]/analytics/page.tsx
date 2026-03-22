import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { SprintAnalytics } from '@/components/sprints/SprintAnalytics';

export const metadata: Metadata = { title: 'Sprint Analytics — HorusEye' };

export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const { id } = await params;
  return <SprintAnalytics sprintId={id} />;
}
