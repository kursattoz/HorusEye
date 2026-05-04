// PRD-013 §6.5 — Exam session create (one per exam-room pair)
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

const STATUS_VALUES = ['scheduled', 'active', 'paused', 'ended'] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const examId = url.searchParams.get('exam_id');

  let q = auth.supabase
    .from('exam_sessions')
    .select('id, exam_id, room_id, started_at, ended_at, status, settings, created_at, updated_at')
    .order('created_at');
  if (examId) q = q.eq('exam_id', examId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const exam_id = String(body.exam_id ?? '').trim();
  const room_id = String(body.room_id ?? '').trim();
  if (!exam_id) return NextResponse.json({ error: 'exam_id is required' }, { status: 400 });
  if (!room_id) return NextResponse.json({ error: 'room_id is required' }, { status: 400 });

  const status = (STATUS_VALUES as readonly string[]).includes(body.status) ? body.status : 'scheduled';

  const { data, error } = await auth.supabase
    .from('exam_sessions')
    .insert({ exam_id, room_id, status, settings: body.settings ?? {} })
    .select('id, exam_id, room_id, started_at, ended_at, status, settings, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_session',
    resource_id:   data.id,
    action:        `Exam session created (exam ${exam_id} → room ${room_id})`,
  });

  return NextResponse.json({ session: data }, { status: 201 });
}
