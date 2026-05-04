// PRD-013 §6.4 — Camera CRUD: list (per room) + create.
// stream_url is encrypted at rest (AES-256-GCM, SMTP_ENCRYPTION_KEY)
// and never round-tripped in API responses — UI shows redacted form.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { encrypt } from '@/lib/mailer/crypto';
import { log } from '@/lib/logger';

const ROLE_VALUES        = ['front_wide', 'front_close', 'rear_wide', 'side_left', 'side_right'] as const;
const CAMERA_TYPE_VALUES = ['ip_camera', 'phone', 'usb_webcam'] as const;

// Redact credentials in a stream_url for safe display.
// rtsp://user:pass@host:port/path → rtsp://***@host:port/path
function redactStreamUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = '***';
      u.password = '';
    }
    return u.toString();
  } catch {
    return '***';
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const roomId = url.searchParams.get('room_id');

  let q = auth.supabase
    .from('cameras')
    .select('id, room_id, label, stream_url, camera_type, role, position_x, position_y, quality_score, is_active, created_at')
    .order('created_at');
  if (roomId) q = q.eq('room_id', roomId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Never leak the encrypted/decrypted stream_url to clients
  const cameras = (data ?? []).map(c => ({ ...c, stream_url: redactStreamUrl(c.stream_url) }));
  return NextResponse.json({ cameras });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const room_id    = String(body.room_id ?? '').trim();
  const label      = String(body.label   ?? '').trim();
  const stream_url = String(body.stream_url ?? '').trim();
  const camera_type = String(body.camera_type ?? 'ip_camera');
  const role        = String(body.role ?? '');

  if (!room_id)    return NextResponse.json({ error: 'room_id is required' }, { status: 400 });
  if (!label)      return NextResponse.json({ error: 'label is required' }, { status: 400 });
  if (!stream_url) return NextResponse.json({ error: 'stream_url is required' }, { status: 400 });
  if (!(ROLE_VALUES as readonly string[]).includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${ROLE_VALUES.join(', ')}` }, { status: 400 });
  }
  if (!(CAMERA_TYPE_VALUES as readonly string[]).includes(camera_type)) {
    return NextResponse.json({ error: `camera_type must be one of: ${CAMERA_TYPE_VALUES.join(', ')}` }, { status: 400 });
  }

  const encryptedUrl = encrypt(stream_url);

  const { data, error } = await auth.supabase
    .from('cameras')
    .insert({
      room_id,
      label,
      stream_url: encryptedUrl,
      camera_type,
      role,
      position_x:    body.position_x ?? null,
      position_y:    body.position_y ?? null,
      quality_score: body.quality_score ?? 1.0,
    })
    .select('id, room_id, label, stream_url, camera_type, role, position_x, position_y, quality_score, is_active, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'camera',
    resource_id:   data.id,
    action:        `Camera registered: ${data.label} (${data.role})`,
  });

  return NextResponse.json(
    { camera: { ...data, stream_url: redactStreamUrl(data.stream_url) } },
    { status: 201 },
  );
}
