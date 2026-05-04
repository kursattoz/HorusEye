// PRD-019 §4.1 — POST /api/cameras/pair-token
// Creates a phone-camera record (is_fixed=false, room_id=null) + 5-min JWT.
// Phone redeems the token at /api/cameras/pair/redeem; PC polls for connect.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { signPairToken } from '@/lib/auth/pair-token';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const session_id  = body.session_id ? String(body.session_id) : null;
  const label       = String(body.label ?? '').trim() || `Phone — ${auth.userId.slice(0, 8)}`;
  const for_user_id = body.for_user_id ? String(body.for_user_id) : auth.userId;

  // Only admins can create a pair-token on behalf of another user.
  if (for_user_id !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Cannot create pair-token for another user' }, { status: 403 });
  }

  // If session_id is provided, verify it exists (helps catch typos early).
  if (session_id) {
    const { data: ses } = await auth.supabase
      .from('exam_sessions')
      .select('id')
      .eq('id', session_id)
      .maybeSingle();
    if (!ses) {
      return NextResponse.json({ error: 'session_id not found' }, { status: 404 });
    }
  }

  const { data: camera, error } = await auth.supabase
    .from('cameras')
    .insert({
      room_id: null,
      label,
      stream_url: `phone-pair://${for_user_id}`,
      camera_type: 'phone',
      role: 'front_wide',
      is_fixed: false,
      owner_user_id: for_user_id,
      is_active: true,
    })
    .select('id, label, owner_user_id')
    .single();

  if (error || !camera) {
    return NextResponse.json({ error: error?.message ?? 'failed to create camera' }, { status: 500 });
  }

  let token: string;
  try {
    token = signPairToken({
      camera_id: camera.id,
      session_id,
      owner_user_id: for_user_id,
    });
  } catch (e) {
    // Roll back the camera record if token signing fails (e.g. PAIR_TOKEN_SECRET missing).
    await auth.supabase.from('cameras').delete().eq('id', camera.id);
    return NextResponse.json({ error: e instanceof Error ? e.message : 'token sign failed' }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const pair_url = `${appUrl.replace(/\/+$/, '')}/cam-pair?token=${encodeURIComponent(token)}`;

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'camera',
    resource_id:   camera.id,
    action:        `Pair token created (camera=${camera.label}, owner=${for_user_id}${session_id ? `, session=${session_id}` : ''})`,
  });

  return NextResponse.json({
    camera_id: camera.id,
    token,
    pair_url,
    expires_in: 300,
  }, { status: 201 });
}
