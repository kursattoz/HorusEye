// BL-191 (Sprint 7) — Read-only post-exam incident review queue.
// Decision UI lands in Sprint 12; this page just shows the list.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { routes } from '@/constants/routes';
import { IncidentReviewQueue } from '@/components/exams/IncidentReviewQueue';

export const metadata: Metadata = { title: 'Incident review — HorusEye' };

interface Params { params: Promise<{ id: string }> }

export default async function ExamIncidentsPage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const supabase = await createClient();
  const { data: exam } = await supabase
    .from('exams')
    .select('id, name, course_code, scheduled_date, status')
    .eq('id', id)
    .maybeSingle();
  if (!exam) notFound();

  const { data: sessions } = await supabase
    .from('exam_sessions')
    .select('id, room_id, status')
    .eq('exam_id', id);

  const sessionIds = (sessions ?? []).map(s => s.id);

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/exams/${id}`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={14} /> Back to exam
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{exam.name}</h1>
        <p className="text-sm text-muted-foreground">
          {exam.course_code} · {sessionIds.length} session{sessionIds.length === 1 ? '' : 's'}
          {' · '}Read-only review (Sprint 7)
        </p>
      </div>

      <IncidentReviewQueue sessionIds={sessionIds} />
    </div>
  );
}
