// BL-232 — Per-student calibration override (admin-only).
// GET returns the override row (or null). PUT upserts severity_bump,
// min_confidence, notes. AI service reads this at incident write time.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: 'Unauthorized' as const, supabase, userId: '' };
  const { data: prof } = await supabase
    .from('user_profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  if (!prof?.is_active || prof.role !== 'admin') {
    return { ok: false, status: 403, error: 'Admin only' as const, supabase, userId: user.id };
  }
  return { ok: true as const, status: 200, supabase, userId: user.id };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await auth.supabase
    .from('student_calibration')
    .select('student_id, severity_bump, min_confidence, notes, updated_by, created_at, updated_at')
    .eq('student_id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calibration: data ?? null });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json();
  const bump = Number(body.severity_bump ?? 0);
  if (!Number.isInteger(bump) || bump < -2 || bump > 2) {
    return NextResponse.json({ error: 'severity_bump must be integer in [-2, 2]' }, { status: 400 });
  }
  const minConf = body.min_confidence === null || body.min_confidence === undefined
    ? null
    : Number(body.min_confidence);
  if (minConf !== null && (Number.isNaN(minConf) || minConf < 0 || minConf > 1)) {
    return NextResponse.json({ error: 'min_confidence must be null or in [0, 1]' }, { status: 400 });
  }
  const notes = body.notes ? String(body.notes).slice(0, 1024) : null;

  const { data, error } = await auth.supabase
    .from('student_calibration')
    .upsert({
      student_id: id,
      severity_bump: bump,
      min_confidence: minConf,
      notes,
      updated_by: auth.userId,
    }, { onConflict: 'student_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type: 'system.info',
    severity:   'info',
    user_id:    auth.userId,
    resource_type: 'student_calibration',
    resource_id:   id,
    action:        `Student calibration updated (bump=${bump}, min_conf=${minConf ?? '—'})`,
    metadata:      { severity_bump: bump, min_confidence: minConf },
  });

  return NextResponse.json({ calibration: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error } = await auth.supabase
    .from('student_calibration')
    .delete()
    .eq('student_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type: 'system.info',
    severity:   'info',
    user_id:    auth.userId,
    resource_type: 'student_calibration',
    resource_id:   id,
    action:        'Student calibration reset',
  });

  return NextResponse.json({ ok: true });
}
