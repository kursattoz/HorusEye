// PRD-019 §4.2 — Manage cameras attached to an exam session.
// Fixed cameras may only attach to sessions in their home room (409 otherwise);
// fixed cameras can also be in at most one active session at a time (409).
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { id: sessionId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from('session_cameras')
    .select(`
      id, session_id, camera_id, added_at, added_by,
      camera:cameras (
        id, room_id, label, camera_type, role,
        is_fixed, owner_user_id, device_id, last_seen_at, is_active,
        demo_video_url
      )
    `)
    .eq('session_id', sessionId)
    .order('added_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ session_cameras: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id: sessionId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const camera_id = String(body.camera_id ?? '').trim();
  if (!camera_id) {
    return NextResponse.json({ error: 'camera_id is required' }, { status: 400 });
  }

  const { data: session, error: sessionErr } = await auth.supabase
    .from('exam_sessions')
    .select('id, room_id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionErr) return NextResponse.json({ error: sessionErr.message }, { status: 500 });
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 });

  const { data: camera, error: cameraErr } = await auth.supabase
    .from('cameras')
    .select('id, room_id, label, is_fixed, owner_user_id, camera_type')
    .eq('id', camera_id)
    .maybeSingle();
  if (cameraErr) return NextResponse.json({ error: cameraErr.message }, { status: 500 });
  if (!camera) return NextResponse.json({ error: 'camera not found' }, { status: 404 });

  // Fixed camera ↔ home room check (PRD-019 §4.2 / §5)
  if (camera.is_fixed && camera.room_id !== session.room_id) {
    return NextResponse.json({
      error: 'Fixed camera belongs to a different room',
      camera_room_id: camera.room_id,
      session_room_id: session.room_id,
      camera_label: camera.label,
    }, { status: 409 });
  }

  // Fixed camera in another active session?
  if (camera.is_fixed) {
    const { data: clash } = await auth.supabase
      .from('session_cameras')
      .select('session_id, exam_sessions!inner(id, status)')
      .eq('camera_id', camera_id)
      .neq('session_id', sessionId)
      .eq('exam_sessions.status', 'active');
    if (clash && clash.length > 0) {
      return NextResponse.json({
        error: 'Fixed camera already in another active session',
        conflicting_session_id: clash[0]?.session_id,
      }, { status: 409 });
    }
  }

  // Ownership: personal cam can only be attached by its owner; system cams (NULL owner) are open.
  if (camera.owner_user_id && camera.owner_user_id !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Cannot attach another user\'s personal camera' }, { status: 403 });
  }

  const { data, error } = await auth.supabase
    .from('session_cameras')
    .insert({ session_id: sessionId, camera_id, added_by: auth.userId })
    .select('id, session_id, camera_id, added_at, added_by')
    .single();

  if (error) {
    // 23505 = unique_violation: same (session, camera) attached twice — idempotent success
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'camera already attached to this session' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_session',
    resource_id:   sessionId,
    action:        `Camera attached: ${camera.label} (${camera.camera_type})`,
    metadata:      { camera_id },
  });

  return NextResponse.json({ session_camera: data }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id: sessionId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const cameraId = url.searchParams.get('camera_id');
  if (!cameraId) {
    return NextResponse.json({ error: 'camera_id query param is required' }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from('session_cameras')
    .delete()
    .eq('session_id', sessionId)
    .eq('camera_id', cameraId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_session',
    resource_id:   sessionId,
    action:        'Camera detached',
    metadata:      { camera_id: cameraId },
  });

  return NextResponse.json({ ok: true });
}
