// Plan §D — pre-exam attendance: list endpoint.
// Returns the attendance_records joined with students for the FIRST
// session of the exam (multi-session UI is a follow-up). Rows are
// auto-created in 'pending' status for every session_students entry
// that doesn't have a record yet, so the proctor sees the full roster.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';

interface Params { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: examId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // 1. First session for this exam (matches /exams/[id]/live convention).
  const { data: sessionRow, error: sessErr } = await auth.supabase
    .from('exam_sessions')
    .select('id')
    .eq('exam_id', examId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (sessErr)    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  if (!sessionRow) return NextResponse.json({ error: 'No session for this exam yet' }, { status: 404 });

  const sessionId = sessionRow.id as string;

  // 2. Backfill pending rows for enrolled students that don't have one.
  const { data: enrolled, error: enrolErr } = await auth.supabase
    .from('session_students')
    .select('student_id')
    .eq('session_id', sessionId);
  if (enrolErr) return NextResponse.json({ error: enrolErr.message }, { status: 500 });

  if (enrolled && enrolled.length > 0) {
    const enrolledIds = enrolled.map(r => r.student_id as string);
    const { data: existing } = await auth.supabase
      .from('attendance_records')
      .select('student_id')
      .eq('session_id', sessionId)
      .in('student_id', enrolledIds);
    const existingSet = new Set((existing ?? []).map(r => r.student_id as string));
    const missing     = enrolledIds.filter(sid => !existingSet.has(sid));
    if (missing.length > 0) {
      const rows = missing.map(student_id => ({
        session_id: sessionId,
        student_id,
        status:     'pending' as const,
      }));
      // Best-effort: a race with another proctor opening the page at the
      // same time falls back to the unique(session_id, student_id) index.
      await auth.supabase.from('attendance_records').upsert(rows, {
        onConflict: 'session_id,student_id',
        ignoreDuplicates: true,
      });
    }
  }

  // 3. Read the full list joined with student info.
  const { data, error } = await auth.supabase
    .from('attendance_records')
    .select('*, students!inner(id, student_id, full_name)')
    .eq('session_id', sessionId)
    .order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    session_id: sessionId,
    records:    data ?? [],
  });
}
