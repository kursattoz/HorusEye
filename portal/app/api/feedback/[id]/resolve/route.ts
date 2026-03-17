import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase.from('feedbacks')
    .update({ resolved: true, resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await log({ event_type: 'feedback.update', severity: 'info', user_id: user.id, action: `Resolved feedback ${id}` });
  return NextResponse.json({ feedback: data });
}
