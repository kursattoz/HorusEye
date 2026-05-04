// PRD-013 §6.4 — Single camera update/delete
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { encrypt } from '@/lib/mailer/crypto';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

const ROLE_VALUES = ['front_wide', 'front_close', 'rear_wide', 'side_left', 'side_right'] as const;

function redact(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.username || u.password) { u.username = '***'; u.password = ''; }
    return u.toString();
  } catch { return '***'; }
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.label !== undefined)         updates.label = String(body.label).trim();
  if (body.role !== undefined) {
    if (!(ROLE_VALUES as readonly string[]).includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    updates.role = body.role;
  }
  if (body.position_x !== undefined)    updates.position_x = body.position_x;
  if (body.position_y !== undefined)    updates.position_y = body.position_y;
  if (body.quality_score !== undefined) updates.quality_score = body.quality_score;
  if (body.is_active !== undefined)     updates.is_active = Boolean(body.is_active);
  if (body.stream_url !== undefined && body.stream_url !== null) {
    updates.stream_url = encrypt(String(body.stream_url));
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('cameras')
    .update(updates)
    .eq('id', id)
    .select('id, room_id, label, stream_url, camera_type, role, position_x, position_y, quality_score, is_active, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'camera',
    resource_id:   id,
    action:        `Camera updated: ${data.label}`,
    metadata:      { fields: Object.keys(updates) },
  });

  return NextResponse.json({ camera: { ...data, stream_url: redact(data.stream_url) } });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from('cameras')
    .update({ is_active: false })
    .eq('id', id)
    .select('label')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'camera',
    resource_id:   id,
    action:        `Camera deactivated: ${data.label}`,
  });

  return NextResponse.json({ ok: true });
}
