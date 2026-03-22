import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const allowed: Record<string, unknown> = {};
  if (body.title !== undefined) allowed.title = body.title;
  if (body.description !== undefined) allowed.description = body.description || null;
  if (body.start_time !== undefined) allowed.start_time = body.start_time;
  if (body.end_time !== undefined) allowed.end_time = body.end_time || null;
  if (body.all_day !== undefined) allowed.all_day = body.all_day;
  if (body.event_type !== undefined) allowed.event_type = body.event_type;
  if (body.color !== undefined) allowed.color = body.color;
  if (body.location !== undefined) allowed.location = body.location || null;
  if (body.reminder_minutes !== undefined) allowed.reminder_minutes = body.reminder_minutes;
  if (body.recurrence !== undefined) allowed.recurrence = body.recurrence || null;

  const { data, error } = await supabase
    .from('calendar_events')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ event: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase.from('calendar_events').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
