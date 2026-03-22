import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { ProjectAnalytics } from '@/components/sprints/ProjectAnalytics';

export const metadata: Metadata = { title: 'Project Analytics — HorusEye' };

export default async function ProjectAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  return <ProjectAnalytics />;
}
