// PRD-019 §4.3 — Camera health event ingestion + read.
// POST: phone (camera owner) reports an event; we update last_seen_at and
//       fan out a notification to the session's chief_proctor + proctors when
//       the event is operationally significant.
// GET: proctors read the recent event log for a camera.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { verifyPairToken } from '@/lib/auth/pair-token';
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

const EVENT_TYPES = [
  'connected', 'disconnected', 'reconnected',
  'low_battery', 'critical_battery', 'charging',
  'app_backgrounded', 'app_foregrounded',
  'overheat', 'orientation_changed', 'preview_offscreen',
  'permission_revoked',
  // BL-253 reconnect telemetry — kept out of ALERT_EVENTS because they
  // don't warrant a proctor notification on their own.
  'reconnect_scheduled', 'reconnect_gave_up', 'reconnect_manual',
] as const;
type CameraHealthEventType = typeof EVENT_TYPES[number];

const ALERT_EVENTS = new Set<CameraHealthEventType>([
  'disconnected', 'low_battery', 'critical_battery',
  'app_backgrounded', 'permission_revoked',
]);

const CRITICAL_EVENTS = new Set<CameraHealthEventType>([
  'critical_battery', 'permission_revoked', 'disconnected',
]);

export async function POST(request: NextRequest, { params }: Params) {
  const { id: cameraId } = await params;

  // Authentication: Supabase session OR Bearer pair-token. Phones running
  // the public /cam-pair page hold a 5-min token; logged-in proctor PCs
  // hold a Supabase session. Either path establishes ownership.
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? null;
  const tokenResult = bearer ? verifyPairToken(bearer) : null;
  let actor: { userId: string; role: 'admin' | 'supervisor' | 'assistant' | null; supabase: Awaited<ReturnType<typeof createClient>> };

  if (tokenResult?.ok) {
    if (tokenResult.payload.camera_id !== cameraId) {
      return NextResponse.json({ error: 'pair token camera_id mismatch' }, { status: 403 });
    }
    actor = {
      userId: tokenResult.payload.owner_user_id,
      role:   null,
      supabase: await createClient({ serviceRole: true }),
    };
  } else {
    const auth = await requireAuth();
    if (!auth.ok) return auth.response;
    actor = { userId: auth.userId, role: auth.role, supabase: auth.supabase };
  }

  const body = await request.json().catch(() => ({}));
  const event_type = String(body.event_type ?? '') as CameraHealthEventType;
  const session_id = body.session_id ? String(body.session_id) : null;
  const metadata = (body.metadata ?? null) as Record<string, unknown> | null;

  if (!(EVENT_TYPES as readonly string[]).includes(event_type)) {
    return NextResponse.json({ error: `event_type must be one of: ${EVENT_TYPES.join(', ')}` }, { status: 400 });
  }

  // Ownership check — only the camera's owner (or admin) can post events.
  const { data: camera, error: cameraErr } = await actor.supabase
    .from('cameras')
    .select('id, label, owner_user_id')
    .eq('id', cameraId)
    .maybeSingle();
  if (cameraErr) return NextResponse.json({ error: cameraErr.message }, { status: 500 });
  if (!camera) return NextResponse.json({ error: 'camera not found' }, { status: 404 });

  if (camera.owner_user_id && camera.owner_user_id !== actor.userId && actor.role !== 'admin') {
    return NextResponse.json({ error: 'Only the camera owner can post health events' }, { status: 403 });
  }

  const { data: event, error: insertErr } = await actor.supabase
    .from('camera_health_events')
    .insert({ camera_id: cameraId, session_id, event_type, metadata })
    .select('id, camera_id, session_id, event_type, metadata, created_at')
    .single();
  if (insertErr || !event) {
    return NextResponse.json({ error: insertErr?.message ?? 'failed to record event' }, { status: 500 });
  }

  // Update last_seen_at on every event (any signal counts as "alive").
  await actor.supabase
    .from('cameras')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', cameraId);

  // Fan out notifications for alert-worthy events.
  if (ALERT_EVENTS.has(event_type) && session_id) {
    const { data: proctors } = await actor.supabase
      .from('session_proctors')
      .select('user_id, role')
      .eq('session_id', session_id);

    if (proctors && proctors.length > 0) {
      const link = `/exams/sessions/${session_id}/live`;
      const title = labelFor(event_type, camera.label);
      const description = describeFor(event_type, metadata);
      await Promise.all(
        proctors.map(p =>
          createNotification({
            user_id:     p.user_id,
            category:    'system',
            title,
            description,
            link,
            metadata:    { camera_id: cameraId, event_type, severity: CRITICAL_EVENTS.has(event_type) ? 'critical' : 'warn' },
          }),
        ),
      );
    }

    await log({
      event_type:    'system.warning',
      severity:      CRITICAL_EVENTS.has(event_type) ? 'critical' : 'warn',
      user_id:       actor.userId,
      resource_type: 'camera',
      resource_id:   cameraId,
      action:        `Camera health alert: ${event_type} (${camera.label})`,
      metadata:      { session_id, event_type, ...metadata },
    });
  }

  return NextResponse.json({ event }, { status: 201 });
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id: cameraId } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 200);

  const { data, error } = await auth.supabase
    .from('camera_health_events')
    .select('id, camera_id, session_id, event_type, metadata, created_at')
    .eq('camera_id', cameraId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ events: data ?? [] });
}

function labelFor(type: CameraHealthEventType, cameraLabel: string): string {
  switch (type) {
    case 'disconnected':       return `${cameraLabel} bağlantısı koptu`;
    case 'low_battery':        return `${cameraLabel} pili düşük`;
    case 'critical_battery':   return `${cameraLabel} pili kritik`;
    case 'app_backgrounded':   return `${cameraLabel} arkaplana atıldı`;
    case 'permission_revoked': return `${cameraLabel} kamera izni kaldırıldı`;
    default:                   return `${cameraLabel}: ${type}`;
  }
}

function describeFor(type: CameraHealthEventType, metadata: Record<string, unknown> | null): string {
  if (type === 'low_battery' || type === 'critical_battery') {
    const lvl = metadata && typeof metadata.level === 'number' ? Math.round(metadata.level * 100) : null;
    return lvl !== null ? `Pil seviyesi %${lvl}. Telefonu lütfen şarja takın.` : 'Pil seviyesi düştü.';
  }
  if (type === 'app_backgrounded') {
    return 'Tarayıcı sekmesi arkaplana atıldı; canlı yayın kesilmiş olabilir.';
  }
  if (type === 'permission_revoked') {
    return 'Kamera erişimi reddedildi. Telefonun ayarlarından izin yeniden verilmeli.';
  }
  if (type === 'disconnected') {
    return 'Telefon en az 15 saniyedir frame göndermiyor.';
  }
  return '';
}
