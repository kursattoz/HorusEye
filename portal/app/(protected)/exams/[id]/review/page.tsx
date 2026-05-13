// BL-235 — Post-exam review page.
import type { Metadata } from 'next';
import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { ExamReview } from '@/components/exams/ExamReview';
import { createClient } from '@/lib/supabase/server';

interface Params { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: 'Review — HorusEye' };

export default async function ExamReviewPage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const supabase = await createClient();
  const { data: exam } = await supabase
    .from('exams')
    .select('id, title, scheduled_at')
    .eq('id', id)
    .maybeSingle();
  if (!exam) notFound();

  const { data: sessionsData } = await supabase
    .from('exam_sessions')
    .select('id, started_at, ended_at, status, exam_rooms(id, name)')
    .eq('exam_id', id)
    .order('started_at', { ascending: true });

  const sessions = (sessionsData ?? []) as Array<{
    id: string;
    started_at: string | null;
    ended_at: string | null;
    status: string;
    exam_rooms: { id: string; name: string } | null;
  }>;

  return <ExamReview exam={exam} sessions={sessions} />;
}
