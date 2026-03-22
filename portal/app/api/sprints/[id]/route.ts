import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: sprint, error } = await supabase
    .from('sprints')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // Fetch items with assignee info
  const { data: items } = await supabase
    .from('backlog_items')
    .select('*, assignee:user_profiles!assigned_to(full_name, avatar_url, dev_role), backlog_attachments(id, file_name, file_url, file_type), blocker:backlog_items!blocked_by(id, title, status)')
    .eq('sprint_id', id)
    .order('sort_order', { ascending: true });

  return NextResponse.json({ sprint, items: items ?? [] });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Date overlap check when dates are being changed
  if (body.start_date !== undefined || body.end_date !== undefined) {
    // Get current sprint dates to merge with updates
    const { data: current } = await supabase.from('sprints').select('start_date, end_date').eq('id', id).single();
    const newStart = body.start_date ?? current?.start_date;
    const newEnd = body.end_date ?? current?.end_date;

    if (newEnd && newStart && newEnd < newStart) {
      return NextResponse.json({ error: 'End date cannot be before start date' }, { status: 400 });
    }

    if (newStart && newEnd) {
      const { data: overlapping } = await supabase
        .from('sprints')
        .select('id, name')
        .neq('id', id)
        .or(`and(start_date.lte.${newEnd},end_date.gte.${newStart})`);

      if (overlapping && overlapping.length > 0) {
        return NextResponse.json({
          error: `Sprint dates overlap with: ${overlapping.map(s => s.name).join(', ')}`,
        }, { status: 409 });
      }
    }
  }

  const allowed: Record<string, unknown> = {};
  if (body.name !== undefined) allowed.name = body.name;
  if (body.goal !== undefined) allowed.goal = body.goal;
  if (body.start_date !== undefined) allowed.start_date = body.start_date;
  if (body.end_date !== undefined) allowed.end_date = body.end_date;
  if (body.status !== undefined) allowed.status = body.status;

  const { data, error } = await supabase
    .from('sprints')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // If sprint is completed, move unfinished items to next sprint or unassign
  if (body.status === 'completed') {
    await supabase
      .from('backlog_items')
      .update({ sprint_id: null })
      .eq('sprint_id', id)
      .neq('status', 'done');
  }

  return NextResponse.json({ sprint: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Unassign items from this sprint first
  await supabase
    .from('backlog_items')
    .update({ sprint_id: null })
    .eq('sprint_id', id);

  const { error } = await supabase.from('sprints').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
