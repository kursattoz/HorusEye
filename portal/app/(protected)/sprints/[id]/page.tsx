import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { SprintDetail } from '@/components/sprints/SprintDetail';

export const metadata: Metadata = { title: 'Sprint Detail — HorusEye' };

export default async function SprintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const { id } = await params;
  return <SprintDetail sprintId={id} />;
}
