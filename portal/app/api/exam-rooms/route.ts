// PRD-013 §6.3 — Exam rooms list + create
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const includeInactive = url.searchParams.get('include_inactive') === 'true';

  let q = auth.supabase
    .from('exam_rooms')
    .select('id, name, capacity, location, is_active, created_at, updated_at')
    .order('name');
  if (!includeInactive) q = q.eq('is_active', true);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rooms: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const name = String(body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const capacity = body.capacity != null ? Number(body.capacity) : null;
  if (capacity !== null && (!Number.isFinite(capacity) || capacity < 0)) {
    return NextResponse.json({ error: 'capacity must be a non-negative number' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('exam_rooms')
    .insert({
      name,
      capacity,
      location: body.location ?? null,
      layout:   body.layout   ?? {},
    })
    .select('id, name, capacity, location, is_active, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'exam_room',
    resource_id:   data.id,
    action:        `Exam room created: ${data.name}`,
  });

  return NextResponse.json({ room: data }, { status: 201 });
}
