// PRD-013 §6.7 — Manage session students (batch add / remove)
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

interface StudentEntry {
  student_id:  string;
  seat_number?: string | null;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: sessionId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const entries: StudentEntry[] = Array.isArray(body.students) ? body.students : [];
  if (entries.length === 0) {
    return NextResponse.json({ error: 'students array is required' }, { status: 400 });
  }

  const rows = entries
    .filter(e => typeof e.student_id === 'string' && e.student_id.length > 0)
    .map(e => ({
      session_id:  sessionId,
      student_id:  e.student_id,
      seat_number: e.seat_number ?? null,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid student_ids provided' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('session_students')
    .upsert(rows, { onConflict: 'session_id,student_id' })
    .select('id, session_id, student_id, seat_number');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_session',
    resource_id:   sessionId,
    action:        `${rows.length} student(s) assigned to session`,
  });

  return NextResponse.json({ students: data ?? [] }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: sessionId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const studentId = url.searchParams.get('student_id');
  if (!studentId) {
    return NextResponse.json({ error: 'student_id query param is required' }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from('session_students')
    .delete()
    .eq('session_id', sessionId)
    .eq('student_id', studentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_session',
    resource_id:   sessionId,
    action:        'Student removed from session',
    metadata:      { student: studentId },
  });

  return NextResponse.json({ ok: true });
}
