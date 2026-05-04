import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { ExamRoomsAdmin } from '@/components/exams/ExamRoomsAdmin';

export const metadata: Metadata = { title: 'Exam Rooms — HorusEye' };

export default async function ExamRoomsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Exam rooms</h1>
        <p className="text-sm text-muted-foreground">
          Register physical rooms used during exam sessions. Rooms are picked when creating an exam (PRD-013 §6.3).
        </p>
      </div>
      <ExamRoomsAdmin />
    </div>
  );
}
