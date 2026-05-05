// BL-222 (Sprint 10) — KVKK face-data consent endpoint.
// Stamps students.face_consent_at on grant, NULL on revoke. Every
// transition audit-logged. The face-enroll endpoint (BL-218) checks
// face_consent_at IS NOT NULL before calling the embedder.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const consent = Boolean(body.consent);
  // Front-end must echo back the exact text the student saw — keeps an
  // audit-trail of WHICH version of the KVKK notice the consent applied to.
  const noticeVersion = String(body.notice_version ?? '').trim() || 'v1';

  const updates = consent
    ? { face_consent_at: new Date().toISOString() }
    : { face_consent_at: null, face_embedding: null, face_embedding_updated_at: null };

  const { data, error } = await auth.supabase
    .from('students')
    .update(updates)
    .eq('id', id)
    .select('id, student_id, full_name, face_consent_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'student',
    resource_id:   id,
    action:        consent
      ? `KVKK face-data consent granted (notice ${noticeVersion})`
      : 'KVKK face-data consent revoked + embedding wiped',
    metadata:      { consent, notice_version: noticeVersion, student_id: data.student_id },
  });

  return NextResponse.json({ student: data });
}
