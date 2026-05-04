import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { getCurrentUser } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { routes } from '@/constants/routes';
import { LiveMonitor } from '@/components/exams/LiveMonitor';

export const metadata: Metadata = { title: 'Live monitor — HorusEye' };

interface Params { params: Promise<{ id: string }> }

export default async function ExamLivePage({ params }: Params) {
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

  // Pick the first session for this exam (single-session demo). Multi-cam UI lands later.
  const { data: sessionRows } = await supabase
    .from('exam_sessions')
    .select('id, status, exam_rooms(name)')
    .eq('exam_id', id)
    .order('created_at')
    .limit(1);

  // Supabase typing returns exam_rooms as array; collapse to single object.
  const firstRow = sessionRows?.[0];
  const session = firstRow
    ? {
        id:     firstRow.id,
        status: firstRow.status,
        exam_rooms: Array.isArray(firstRow.exam_rooms) ? firstRow.exam_rooms[0] ?? null : firstRow.exam_rooms,
      }
    : null;

  const wsBase = process.env.NEXT_PUBLIC_AI_SERVICE_WS_URL ?? '';

  return (
    <div className="space-y-4 h-[calc(100vh-7rem)] flex flex-col">
      <div>
        <Link href={routes.examDetail(id)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft size={12} /> Back to exam
        </Link>
        <h1 className="text-2xl font-bold mt-2">Live monitor — {exam.name}</h1>
        <p className="text-sm text-muted-foreground">
          AI proctoring stream. Detections and incidents flow over a WebSocket from the on-prem AI service (PRD-013 §3.2).
        </p>
      </div>
      <LiveMonitor
        examId={id}
        session={session}
        wsBase={wsBase}
      />
    </div>
  );
}
