import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { ExamCreateForm } from '@/components/exams/ExamCreateForm';

export const metadata: Metadata = { title: 'New Exam — HorusEye' };

export default async function NewExamPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link href={routes.exams} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft size={12} /> Back to exams
        </Link>
        <h1 className="text-2xl font-bold mt-2">New exam</h1>
        <p className="text-sm text-muted-foreground">
          Create an exam, then add sessions (one per room) — proctors and students are assigned per session.
        </p>
      </div>
      <ExamCreateForm />
    </div>
  );
}
