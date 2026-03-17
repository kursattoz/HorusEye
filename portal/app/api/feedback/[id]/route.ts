import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  // Only update own feedback
  const { data, error } = await supabase.from('feedbacks')
    .update({ content: body.content })
    .eq('id', id)
    .eq('author_id', user.id)
    .select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await log({ event_type: 'feedback.update', severity: 'info', user_id: user.id, action: `Updated feedback ${id}` });
  return NextResponse.json({ feedback: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await supabase.from('feedbacks').update({ is_hidden: true }).eq('id', id);
  await log({ event_type: 'feedback.delete', severity: 'warn', user_id: user.id, action: `Hid feedback ${id}` });
  return NextResponse.json({ ok: true });
}
