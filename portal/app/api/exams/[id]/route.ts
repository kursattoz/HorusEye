// PRD-013 §6.2 — Exam single get/update/delete
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

const STATUS_VALUES = ['draft', 'scheduled', 'active', 'completed', 'cancelled'] as const;

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data: exam, error } = await auth.supabase
    .from('exams')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!exam)  return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Hydrate sessions with their room + counts
  const { data: sessions } = await auth.supabase
    .from('exam_sessions')
    .select('id, exam_id, room_id, started_at, ended_at, status, settings, created_at, updated_at, exam_rooms(id, name, capacity, location)')
    .eq('exam_id', id)
    .order('created_at');

  return NextResponse.json({ exam, sessions: sessions ?? [] });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined)             updates.name = String(body.name).trim();
  if (body.course_code !== undefined)      updates.course_code = body.course_code ?? null;
  if (body.description !== undefined)      updates.description = body.description ?? null;
  if (body.scheduled_date !== undefined)   updates.scheduled_date = body.scheduled_date;
  if (body.scheduled_start !== undefined)  updates.scheduled_start = body.scheduled_start;
  if (body.scheduled_end !== undefined)    updates.scheduled_end = body.scheduled_end;
  if (body.duration_minutes !== undefined) updates.duration_minutes = Number(body.duration_minutes);
  if (body.settings !== undefined)         updates.settings = body.settings;

  if (body.status !== undefined) {
    if (!(STATUS_VALUES as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: `Invalid status. Allowed: ${STATUS_VALUES.join(', ')}` }, { status: 400 });
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('exams')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam',
    resource_id:   id,
    action:        `Exam updated: ${data.name}`,
    metadata:      { fields: Object.keys(updates) },
  });

  return NextResponse.json({ exam: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // Hard-delete; sessions/proctors/students cascade via FK ON DELETE CASCADE
  const { data, error } = await auth.supabase
    .from('exams')
    .delete()
    .eq('id', id)
    .select('name')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam',
    resource_id:   id,
    action:        `Exam deleted: ${data.name}`,
  });

  return NextResponse.json({ ok: true });
}
