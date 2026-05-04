import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ClipboardList, Plus } from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { routes } from '@/constants/routes';

export const metadata: Metadata = { title: 'Exams — HorusEye' };

export default async function ExamsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Exams</h1>
          <p className="text-sm text-muted-foreground">
            Manage exams, sessions, rooms, and cameras for AI-assisted proctoring (PRD-013).
          </p>
        </div>
        <Button asChild disabled>
          <Link href={routes.examNew}>
            <Plus size={16} />
            New exam
          </Link>
        </Button>
      </div>

      <div className="rounded-lg border border-dashed p-12 text-center">
        <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40" />
        <h2 className="mt-4 text-lg font-semibold">No exams yet</h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          The exam creation wizard (BL-144) is in progress. Database schema is
          in place; CRUD API and the 5-step wizard land in this sprint.
        </p>
      </div>
    </div>
  );
}
