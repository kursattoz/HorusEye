import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { SprintBoard } from '@/components/sprints/SprintBoard';

export const metadata: Metadata = { title: 'Sprints — HorusEye' };

export default async function SprintsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sprint Board</h1>
        <p className="text-sm text-muted-foreground">Manage sprints, backlog items, and track development progress across PRDs.</p>
      </div>
      <SprintBoard />
    </div>
  );
}
