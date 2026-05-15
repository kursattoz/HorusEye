// Plan §D — proctor-driven face-match check-in.
// POST receives (student_id, frame) → AI service /embed → pgvector RPC
// → classify by similarity → upsert attendance_records.
//
// "Verification" semantics: the proctor pre-selects which student they're
// about to verify. Top-match must equal the requested student. If a
// different person matches we mark the row 'failed' (mismatch).
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';
import {
  ATTENDANCE_LOW_CONFIDENCE_THRESHOLD,
  ATTENDANCE_VERIFY_THRESHOLD,
  classifyAttendanceSimilarity,
  type AttendanceStatus,
} from '@/types/attendance';

interface Params { params: Promise<{ id: string }> }

const ATTENDANCE_BUCKET = 'attendance-evidence';
const EMBEDDING_DIM     = 512;

export async function POST(request: NextRequest, { params }: Params) {
  const { id: examId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const aiUrl  = process.env.AI_SERVICE_URL || '';
  const apiKey = process.env.AI_SERVICE_API_KEY || '';
  if (!aiUrl || !apiKey) {
    return NextResponse.json(
      { error: 'AI service not configured (AI_SERVICE_URL/AI_SERVICE_API_KEY)' },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const studentId = form.get('student_id');
  const image     = form.get('image');
  const bbox      = form.get('bbox');
  if (typeof studentId !== 'string' || studentId.length === 0) {
    return NextResponse.json({ error: 'student_id field required' }, { status: 400 });
  }
  if (!(image instanceof File)) {
    return NextResponse.json({ error: 'image file required' }, { status: 400 });
  }

  // 1. Resolve session_id from exam (first session — same convention as
  //    the list endpoint and /exams/[id]/live).
  const { data: sessionRow } = await auth.supabase
    .from('exam_sessions')
    .select('id')
    .eq('exam_id', examId)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (!sessionRow) return NextResponse.json({ error: 'No session for this exam' }, { status: 404 });
  const sessionId = sessionRow.id as string;

  // 2. Confirm the student is actually enrolled in this session — prevents
  //    drive-by check-ins for students from other exams.
  const { data: enrollment } = await auth.supabase
    .from('session_students')
    .select('student_id')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle();
  if (!enrollment) {
    return NextResponse.json({ error: 'Student is not enrolled in this session' }, { status: 422 });
  }

  // 3. Forward frame to AI service /embed.
  const forwardForm = new FormData();
  forwardForm.append('image', image, image.name || 'attendance.jpg');
  if (typeof bbox === 'string' && bbox.length > 0) {
    forwardForm.append('bbox', bbox);
  }
  let aiResponse: Response;
  try {
    aiResponse = await fetch(`${aiUrl.replace(/\/$/, '')}/embed`, {
      method:  'POST',
      headers: { 'X-AI-Service-Key': apiKey },
      body:    forwardForm,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `AI service unreachable: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
  if (!aiResponse.ok) {
    const aiBody = await aiResponse.json().catch(() => ({}));
    return NextResponse.json(
      { error: aiBody.detail ?? `AI service /embed error ${aiResponse.status}` },
      { status: aiResponse.status === 404 ? 422 : 502 },
    );
  }
  const aiPayload = await aiResponse.json() as { embedding: number[] };
  const embedding = Array.isArray(aiPayload.embedding) ? aiPayload.embedding : null;
  if (!embedding || embedding.length !== EMBEDDING_DIM) {
    return NextResponse.json(
      { error: `Unexpected embedding length: ${embedding?.length ?? 'null'}` },
      { status: 502 },
    );
  }

  // 4. ANN search via BL-220 RPC. Use the low-confidence threshold as
  //    the floor so we still get back near-misses for proper
  //    classification rather than a silent "no match".
  const { data: matches, error: rpcErr } = await auth.supabase.rpc(
    'match_face_embedding',
    {
      query_embedding: embedding,
      match_threshold: ATTENDANCE_LOW_CONFIDENCE_THRESHOLD,
      match_count:     1,
    },
  );
  if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

  const topMatch = Array.isArray(matches) && matches.length > 0
    ? matches[0] as { id: string; similarity: number }
    : null;

  // 5. Classify outcome.
  let status:     AttendanceStatus;
  let similarity: number | null;
  if (!topMatch) {
    // No student over the low-confidence floor — total miss.
    status     = 'failed';
    similarity = null;
  } else if (topMatch.id !== studentId) {
    // Best match is someone else — wrong person in front of the camera.
    status     = 'failed';
    similarity = topMatch.similarity;
  } else {
    similarity = topMatch.similarity;
    status     = classifyAttendanceSimilarity(similarity);
  }

  // 6. Upload snapshot (best-effort — atomicity §B1 patterns don't apply
  //    here since the attendance_record itself is the source of truth and
  //    a missing snapshot is recoverable via re-capture).
  const admin = (await import('@/lib/supabase/server')).createClient;
  const adminClient = await admin({ serviceRole: true });
  const ext = (image.name?.split('.').pop() || 'jpg').toLowerCase();
  const safeExt = /^[a-z0-9]{1,8}$/.test(ext) ? ext : 'jpg';
  const evidencePath = `${sessionId}/${studentId}/${Date.now()}.${safeExt}`;
  const { error: upErr } = await adminClient.storage
    .from(ATTENDANCE_BUCKET)
    .upload(evidencePath, image, { contentType: image.type || 'image/jpeg', upsert: false });
  const storedPath = upErr ? null : evidencePath;

  // 7. Upsert the attendance_record. Increment attempts atomically by
  //    reading the existing row, since Supabase JS lacks a fluent
  //    increment helper. The unique(session_id, student_id) index
  //    serializes concurrent check-ins for the same student.
  const { data: existing } = await auth.supabase
    .from('attendance_records')
    .select('id, attempts, first_check_at')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle();

  const now = new Date().toISOString();
  const baseRow = {
    session_id:     sessionId,
    student_id:     studentId,
    status,
    similarity,
    evidence_path:  storedPath,
    first_check_at: existing?.first_check_at ?? now,
    verified_at:    status === 'verified' ? now : null,
    attempts:       (existing?.attempts ?? 0) + 1,
  };

  const { data: upserted, error: upsertErr } = await auth.supabase
    .from('attendance_records')
    .upsert(baseRow, { onConflict: 'session_id,student_id' })
    .select('*, students!inner(id, student_id, full_name)')
    .single();
  if (upsertErr) {
    // Rollback uploaded snapshot to keep Storage and DB consistent — same
    // contract as the incident_writer atomicity fix (Plan §B1).
    if (storedPath) {
      await adminClient.storage.from(ATTENDANCE_BUCKET).remove([storedPath]).catch(() => {});
    }
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'attendance_record',
    resource_id:   upserted.id,
    action:        `Attendance check-in: ${status} (sim=${similarity?.toFixed(3) ?? 'null'})`,
    metadata: {
      session_id:   sessionId,
      student_id:   studentId,
      status,
      similarity,
      matched_id:   topMatch?.id ?? null,
      thresholds:   { verify: ATTENDANCE_VERIFY_THRESHOLD, low: ATTENDANCE_LOW_CONFIDENCE_THRESHOLD },
    },
  });

  return NextResponse.json({ record: upserted, similarity, status });
}
