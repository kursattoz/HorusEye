import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { routes } from '@/constants/routes';
import { AttendanceBoard } from '@/components/exams/AttendanceBoard';

export const metadata: Metadata = { title: 'Attendance — HorusEye' };

interface Params { params: Promise<{ id: string }> }

export default async function ExamAttendancePage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const supabase = await createClient();
  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, course_code, scheduled_date, scheduled_start, status')
    .eq('id', id)
    .maybeSingle();
  if (!exam) notFound();

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={routes.examDetail(id)}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ChevronLeft size={12} /> Back to exam
        </Link>
        <h1 className="text-2xl font-bold mt-2">Attendance — {exam.name}</h1>
        <p className="text-sm text-muted-foreground">
          Verify each enrolled student before the exam starts. Point the
          camera at the student, click <em>Verify</em>, and the system
          matches against the enrolled face embedding (Plan §D).
        </p>
      </div>

      <AttendanceBoard examId={id} examName={exam.name} />
    </div>
  );
}
