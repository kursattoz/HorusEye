// PRD-013 §6.3 — Exam room single get/update/delete
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from('exam_rooms')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ room: data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined)      updates.name = String(body.name).trim();
  if (body.capacity !== undefined)  updates.capacity = body.capacity;
  if (body.location !== undefined)  updates.location = body.location;
  if (body.layout !== undefined)    updates.layout = body.layout;
  if (body.is_active !== undefined) updates.is_active = Boolean(body.is_active);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('exam_rooms')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_room',
    resource_id:   id,
    action:        `Exam room updated: ${data.name}`,
    metadata:      { fields: Object.keys(updates) },
  });

  return NextResponse.json({ room: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // Soft-deactivate instead of hard delete (preserves historical session data)
  const { data, error } = await auth.supabase
    .from('exam_rooms')
    .update({ is_active: false })
    .eq('id', id)
    .select('name')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_room',
    resource_id:   id,
    action:        `Exam room deactivated: ${data.name}`,
  });

  return NextResponse.json({ ok: true });
}
