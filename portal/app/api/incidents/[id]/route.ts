// PRD-013 §7 — Single incident: get + review/decision update
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

const DECISIONS = ['clean', 'suspicious', 'violation'] as const;

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from('incidents')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ incident: data });
}

// PUT — proctor review / decision (acknowledge, dismiss, escalate, post-exam decide)
export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.is_reviewed !== undefined) {
    updates.is_reviewed = Boolean(body.is_reviewed);
    if (updates.is_reviewed) {
      updates.reviewed_by = auth.userId;
      if (body.review_note !== undefined) updates.review_note = body.review_note;
    }
  }

  if (body.proctor_decision !== undefined) {
    if (!(DECISIONS as readonly string[]).includes(body.proctor_decision)) {
      return NextResponse.json({ error: `proctor_decision must be one of: ${DECISIONS.join(', ')}` }, { status: 400 });
    }
    updates.proctor_decision = body.proctor_decision;
    updates.decided_by       = auth.userId;
    updates.decided_at       = new Date().toISOString();
    if (body.decision_note !== undefined) updates.decision_note = body.decision_note;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('incidents')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       auth.userId,
    resource_type: 'incident',
    resource_id:   id,
    action:        `Incident reviewed/decided`,
    metadata:      { fields: Object.keys(updates), decision: data.proctor_decision },
  });

  return NextResponse.json({ incident: data });
}
