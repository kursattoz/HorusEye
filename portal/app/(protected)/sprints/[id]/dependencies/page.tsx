import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { DependencyGraph } from '@/components/sprints/DependencyGraph';

export const metadata: Metadata = { title: 'Dependencies — HorusEye' };

export default async function DependenciesPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  const { id } = await params;
  return <DependencyGraph sprintId={id} />;
}
