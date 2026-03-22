import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('sprints')
    .select('*, backlog_items(id, status, estimated_hours)')
    .order('start_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sprints = (data ?? []).map(s => {
    const items = s.backlog_items ?? [];
    const { backlog_items: _, ...rest } = s;
    return {
      ...rest,
      item_count: items.length,
      done_count: items.filter((i: { status: string }) => i.status === 'done').length,
      estimated_hours: items.reduce((sum: number, i: { estimated_hours: number | null }) => sum + (i.estimated_hours ?? 0), 0),
    };
  });

  return NextResponse.json({ sprints });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.name?.trim() || !body.start_date || !body.end_date) {
    return NextResponse.json({ error: 'Name, start_date and end_date are required' }, { status: 400 });
  }

  if (body.end_date < body.start_date) {
    return NextResponse.json({ error: 'End date cannot be before start date' }, { status: 400 });
  }

  // Check for overlapping sprints
  const { data: overlapping } = await supabase
    .from('sprints')
    .select('id, name, start_date, end_date')
    .or(`and(start_date.lte.${body.end_date},end_date.gte.${body.start_date})`);

  if (overlapping && overlapping.length > 0) {
    const names = overlapping.map(s => s.name).join(', ');
    return NextResponse.json({
      error: `Sprint dates overlap with: ${names}. Adjust dates to avoid conflicts.`,
    }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('sprints')
    .insert({
      name: body.name.trim(),
      goal: body.goal?.trim() || null,
      start_date: body.start_date,
      end_date: body.end_date,
      status: body.status ?? 'planning',
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sprint: data }, { status: 201 });
}
