// PRD-013 §6.6 — Manage session proctors (batch add / remove)
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

interface ProctorEntry {
  user_id: string;
  role?:   'proctor' | 'chief_proctor';
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: sessionId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const entries: ProctorEntry[] = Array.isArray(body.proctors) ? body.proctors : [];
  if (entries.length === 0) {
    return NextResponse.json({ error: 'proctors array is required' }, { status: 400 });
  }

  const rows = entries
    .filter(e => typeof e.user_id === 'string' && e.user_id.length > 0)
    .map(e => ({
      session_id: sessionId,
      user_id:    e.user_id,
      role:       e.role === 'chief_proctor' ? 'chief_proctor' : 'proctor',
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid user_ids provided' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('session_proctors')
    .upsert(rows, { onConflict: 'session_id,user_id' })
    .select('id, session_id, user_id, role');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_session',
    resource_id:   sessionId,
    action:        `${rows.length} proctor(s) assigned`,
  });

  return NextResponse.json({ proctors: data ?? [] }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: sessionId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id');
  if (!userId) {
    return NextResponse.json({ error: 'user_id query param is required' }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from('session_proctors')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_session',
    resource_id:   sessionId,
    action:        'Proctor unassigned',
    metadata:      { unassigned_user: userId },
  });

  return NextResponse.json({ ok: true });
}
