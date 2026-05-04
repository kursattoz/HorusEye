// PRD-013 §5.2 — Single student get/update/delete
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface Params { params: Promise<{ id: string }> }

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401, supabase, userId: '' };
  return { error: null, status: 200, supabase, userId: user.id };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { error, status, supabase } = await requireAuth();
  if (error) return NextResponse.json({ error }, { status });

  const { data, error: dbError } = await supabase
    .from('students')
    .select('id, student_id, full_name, email, department, metadata, is_active, created_at, updated_at')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data)   return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ student: data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const { error, status, supabase, userId } = await requireAuth();
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.full_name !== undefined)  updates.full_name  = String(body.full_name).trim();
  if (body.email !== undefined) {
    const e = body.email ? String(body.email).trim().toLowerCase() : null;
    if (e && !EMAIL_RE.test(e)) return NextResponse.json({ error: 'Invalid email.' }, { status: 400 });
    updates.email = e;
  }
  if (body.department !== undefined) updates.department = body.department ? String(body.department).trim() : null;
  if (body.is_active !== undefined)  updates.is_active  = Boolean(body.is_active);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from('students')
    .update(updates)
    .eq('id', id)
    .is('deleted_at', null)
    .select('id, student_id, full_name, email, department, is_active, created_at, updated_at')
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  await log({
    event_type: 'system.info',
    severity:   'info',
    user_id:    userId,
    resource_type: 'student',
    resource_id:   id,
    action:        `Student updated: ${data.student_id}`,
    metadata:      { fields: Object.keys(updates) },
  });

  return NextResponse.json({ student: data });
}

// DELETE — soft delete
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { error, status, supabase, userId } = await requireAuth();
  if (error) return NextResponse.json({ error }, { status });

  const { data, error: dbError } = await supabase
    .from('students')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .is('deleted_at', null)
    .select('student_id')
    .maybeSingle();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data)   return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await log({
    event_type: 'system.info',
    severity:   'info',
    user_id:    userId,
    resource_type: 'student',
    resource_id:   id,
    action:        `Student soft-deleted: ${data.student_id}`,
  });

  return NextResponse.json({ ok: true });
}
