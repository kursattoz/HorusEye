import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { StudentsTable } from '@/components/students/StudentsTable';

export const metadata: Metadata = { title: 'Students — HorusEye' };

export default async function StudentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Students</h1>
        <p className="text-sm text-muted-foreground">
          Pool of students across all exams. Add manually or bulk-import via CSV
          (columns: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">student_id, full_name, email, department</code>).
        </p>
      </div>

      <StudentsTable />
    </div>
  );
}
