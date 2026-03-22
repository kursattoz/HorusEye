import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const sprintId = searchParams.get('sprint_id');
  const status = searchParams.get('status');
  const prdId = searchParams.get('prd_id');
  const unassigned = searchParams.get('unassigned'); // items not in any sprint

  let query = supabase
    .from('backlog_items')
    .select('*, assignee:user_profiles!assigned_to(full_name, avatar_url, dev_role), backlog_attachments(id, file_name, file_url, file_type), blocker:backlog_items!blocked_by(id, title, status)')
    .order('priority', { ascending: true })
    .order('sort_order', { ascending: true });

  if (sprintId) query = query.eq('sprint_id', sprintId);
  if (unassigned === 'true') query = query.is('sprint_id', null);
  if (status) query = query.eq('status', status);
  if (prdId) query = query.eq('prd_id', prdId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  // Auto-assign based on dev_role if no assignee specified
  let assignedTo = body.assigned_to ?? null;
  if (!assignedTo && body.dev_role) {
    const { data: roleUser } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('dev_role', body.dev_role)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (roleUser) assignedTo = roleUser.id;
  }

  const { data, error } = await supabase
    .from('backlog_items')
    .insert({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      sprint_id: body.sprint_id || null,
      prd_id: body.prd_id || null,
      prd_section: body.prd_section || null,
      epic: body.epic || null,
      dev_role: body.dev_role || null,
      assigned_to: assignedTo,
      reviewer_id: body.reviewer_id || null,
      deliverable_id: body.deliverable_id || null,
      file_id: body.file_id || null,
      status: body.status ?? 'backlog',
      priority: body.priority ?? 'medium',
      estimated_hours: body.estimated_hours || null,
      created_by: user.id,
    })
    .select('*, assignee:user_profiles!assigned_to(full_name, avatar_url, dev_role)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  log({
    event_type: 'checklist.create',
    severity: 'info',
    user_id: user.id,
    resource_type: 'backlog_item',
    resource_id: data.id,
    action: `Added backlog item: ${body.title.trim()}`,
    metadata: { prd_id: body.prd_id, dev_role: body.dev_role },
  });

  return NextResponse.json({ item: data }, { status: 201 });
}
