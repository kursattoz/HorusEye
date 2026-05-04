import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, Radio } from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { routes } from '@/constants/routes';
import { ExamDetail } from '@/components/exams/ExamDetail';

export const metadata: Metadata = { title: 'Exam — HorusEye' };

interface Params { params: Promise<{ id: string }> }

export default async function ExamDetailPage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  // Fetch exam server-side for fast first paint + 404 handling
  const supabase = await createClient();
  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, course_code, description, scheduled_date, scheduled_start, scheduled_end, duration_minutes, status, settings, created_at, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (!exam) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={routes.exams} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft size={12} /> Back to exams
        </Link>
        <div className="flex items-start justify-between mt-2 gap-3">
          <div>
            <h1 className="text-2xl font-bold">{exam.name}</h1>
            <p className="text-sm text-muted-foreground">
              {exam.course_code ? `${exam.course_code} · ` : ''}
              {exam.scheduled_date} · {exam.scheduled_start.slice(0,5)}–{exam.scheduled_end.slice(0,5)} · {exam.duration_minutes} min
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={routes.examLive(id)}>
              <Radio size={16} /> Live monitor
            </Link>
          </Button>
        </div>
      </div>

      <ExamDetail examId={id} />
    </div>
  );
}
