// Plan §D — proctor manual override (approve/fail) for attendance
// records that landed in 'low_confidence' or 'failed' state.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string; recordId: string }> }

interface OverrideBody {
  decision: 'approve' | 'reject';
  reason:   string;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: examId, recordId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let body: OverrideBody;
  try {
    body = await request.json() as OverrideBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return NextResponse.json({ error: 'decision must be approve|reject' }, { status: 400 });
  }
  const reason = (body.reason || '').trim();
  if (reason.length < 3) {
    return NextResponse.json({ error: 'reason required (min 3 chars)' }, { status: 400 });
  }

  // Resolve session_id from the exam and verify the record belongs to it.
  const { data: sessionRow } = await auth.supabase
    .from('exam_sessions')
    .select('id')
    .eq('exam_id', examId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!sessionRow) return NextResponse.json({ error: 'No session for this exam' }, { status: 404 });

  const { data: record } = await auth.supabase
    .from('attendance_records')
    .select('id, session_id, status')
    .eq('id', recordId)
    .maybeSingle();
  if (!record || record.session_id !== sessionRow.id) {
    return NextResponse.json({ error: 'Attendance record not found for this exam' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const newStatus = body.decision === 'approve' ? 'manual_override' : 'failed';
  const { data: updated, error } = await auth.supabase
    .from('attendance_records')
    .update({
      status:                 newStatus,
      verified_at:            body.decision === 'approve' ? now : null,
      manual_override_by:     auth.userId,
      manual_override_reason: `${body.decision}: ${reason}`,
    })
    .eq('id', recordId)
    .select('*, students!inner(id, student_id, full_name)')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'attendance_record',
    resource_id:   recordId,
    action:        `Attendance manual ${body.decision}`,
    metadata: {
      previous_status: record.status,
      new_status:      newStatus,
      reason,
    },
  });

  return NextResponse.json({ record: updated });
}
