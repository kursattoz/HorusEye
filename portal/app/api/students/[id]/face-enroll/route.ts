// BL-218 (Sprint 10) — face enrollment proxy.
// Yoklama wizard / admin UI POSTs an image; we forward to the AI
// service /embed endpoint, receive a 512-dim embedding, and write it
// to public.students. Hard-blocks unless face_consent_at IS NOT NULL.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

const EMBEDDING_DIM = 512;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const aiUrl = process.env.AI_SERVICE_URL || '';
  const apiKey = process.env.AI_SERVICE_API_KEY || '';
  if (!aiUrl || !apiKey) {
    return NextResponse.json(
      { error: 'AI service not configured (AI_SERVICE_URL/AI_SERVICE_API_KEY)' },
      { status: 503 },
    );
  }

  // 1. Pull student record + verify KVKK consent stamped
  const { data: student, error: stuErr } = await auth.supabase
    .from('students')
    .select('id, student_id, full_name, face_consent_at')
    .eq('id', id)
    .maybeSingle();
  if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500 });
  if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  if (!student.face_consent_at) {
    return NextResponse.json(
      { error: 'KVKK face-data consent not granted' },
      { status: 403 },
    );
  }

  // 2. Pull image from incoming multipart
  const incoming = await request.formData();
  const image = incoming.get('image');
  const bbox = incoming.get('bbox');
  if (!(image instanceof File)) {
    return NextResponse.json({ error: 'image file is required' }, { status: 400 });
  }

  // 3. Forward to AI service /embed
  const forwardForm = new FormData();
  forwardForm.append('image', image, image.name || 'face.jpg');
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
      { error: aiBody.detail ?? `AI service error ${aiResponse.status}` },
      { status: aiResponse.status === 404 ? 422 : 502 },
    );
  }
  const aiPayload = await aiResponse.json() as { embedding: number[]; dim: number };
  const embedding = Array.isArray(aiPayload.embedding) ? aiPayload.embedding : null;
  if (!embedding || embedding.length !== EMBEDDING_DIM) {
    return NextResponse.json(
      { error: `Unexpected embedding length: ${embedding?.length ?? 'null'}` },
      { status: 502 },
    );
  }

  // 4. Persist
  const { error: updErr } = await auth.supabase
    .from('students')
    .update({
      face_embedding:            embedding,
      face_embedding_updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'student',
    resource_id:   id,
    action:        `Face embedding enrolled (dim=${EMBEDDING_DIM})`,
    metadata:      { student_id: student.student_id, dim: EMBEDDING_DIM },
  });

  return NextResponse.json({ ok: true, dim: EMBEDDING_DIM });
}
