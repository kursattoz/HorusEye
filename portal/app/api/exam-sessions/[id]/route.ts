// PRD-013 §6.5 — Exam session update/delete + nested expansion
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';
import { notifyHighRiskForSession } from '@/lib/sessions/high-risk-notifier';

interface Params { params: Promise<{ id: string }> }

const STATUS_VALUES = ['scheduled', 'active', 'paused', 'ended'] as const;

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data: session, error } = await auth.supabase
    .from('exam_sessions')
    .select('*, exam_rooms(id, name, capacity, location, layout)')
    .eq('id', id)
    .maybeSingle();
  if (error)  return NextResponse.json({ error: error.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [{ data: proctors }, { data: students }] = await Promise.all([
    auth.supabase
      .from('session_proctors')
      .select('id, role, user_profiles(id, full_name, email, avatar_url)')
      .eq('session_id', id),
    auth.supabase
      .from('session_students')
      .select('id, seat_number, students(id, student_id, full_name, email, department, risk_score, risk_level, risk_trend, incident_count, risk_updated_at)')
      .eq('session_id', id),
  ]);

  return NextResponse.json({
    session,
    proctors: proctors ?? [],
    students: students ?? [],
  });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  let statusTransitionedToActive = false;
  if (body.status !== undefined) {
    if (!(STATUS_VALUES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: `status must be one of: ${STATUS_VALUES.join(', ')}` }, { status: 400 });
    }
    updates.status = body.status;
    if (body.status === 'active' && !body.started_at) updates.started_at = new Date().toISOString();
    if (body.status === 'ended'  && !body.ended_at)   updates.ended_at   = new Date().toISOString();
    if (body.status === 'active') {
      // Only fire the notifier when this is a transition into active.
      const { data: prev } = await auth.supabase
        .from('exam_sessions')
        .select('status')
        .eq('id', id)
        .maybeSingle();
      if (prev && prev.status !== 'active') statusTransitionedToActive = true;
    }
  }
  if (body.started_at !== undefined) updates.started_at = body.started_at;
  if (body.ended_at !== undefined)   updates.ended_at   = body.ended_at;
  if (body.settings !== undefined)   updates.settings   = body.settings;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('exam_sessions')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_session',
    resource_id:   id,
    action:        `Exam session updated`,
    metadata:      { fields: Object.keys(updates) },
  });

  // BL-229 — fire-and-forget high-risk notification when the session
  // becomes active. Errors are logged inside the helper; never crash the
  // status-update response on a notification failure.
  if (statusTransitionedToActive) {
    void notifyHighRiskForSession(id, auth.userId).catch((e: unknown) => {
      console.error('[high-risk-notify] failed', e);
    });
  }

  return NextResponse.json({ session: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { error } = await auth.supabase
    .from('exam_sessions')
    .delete()
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_session',
    resource_id:   id,
    action:        'Exam session deleted',
  });

  return NextResponse.json({ ok: true });
}
