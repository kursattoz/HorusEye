// BL-209 (Sprint 9) — admin-tunable scoring knobs.
// GET returns every threshold key + value so the panel can show all
// rules at once. PUT upserts a single key (rule.knob = value) and
// stamps updated_by from the authenticated user.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

const KEY_PATTERN = /^[a-z_]+\.[a-z_]+$/;

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from('ai_thresholds')
    .select('key, value, updated_at, updated_by')
    .order('key');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ thresholds: data ?? [] });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (auth.role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
  }

  const body = await request.json();
  const key = String(body.key ?? '').trim();
  const value = Number(body.value);

  if (!key || !KEY_PATTERN.test(key)) {
    return NextResponse.json(
      { error: 'key must match rule_name.knob_name (e.g. phone_in_hand.sustained_seconds)' },
      { status: 400 },
    );
  }
  if (!Number.isFinite(value)) {
    return NextResponse.json({ error: 'value must be a finite number' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('ai_thresholds')
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: auth.userId },
      { onConflict: 'key' },
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'ai_threshold',
    resource_id:   key,
    action:        `AI threshold updated: ${key} = ${value}`,
    metadata:      { key, value },
  });

  return NextResponse.json({ threshold: data });
}
