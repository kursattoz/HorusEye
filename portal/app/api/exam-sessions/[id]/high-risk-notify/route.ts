// BL-229 — Manual trigger for pre-session high-risk notification.
// Calls the same helper used by the auto-fire on status='active'.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyHighRiskForSession } from '@/lib/sessions/high-risk-notifier';

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id: sessionId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await notifyHighRiskForSession(sessionId, user.id);
  return NextResponse.json({ ok: true, ...result });
}
