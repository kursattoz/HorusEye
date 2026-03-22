import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('deliverable_id', id)
    .order('sort_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.label?.trim()) {
    return NextResponse.json({ error: 'Label is required' }, { status: 400 });
  }

  // Get the max sort_order for this deliverable
  const { data: existing } = await supabase
    .from('checklist_items')
    .select('sort_order')
    .eq('deliverable_id', id)
    .order('sort_order', { ascending: false })
    .limit(1);

  const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from('checklist_items')
    .insert({
      deliverable_id: id,
      label: body.label.trim(),
      ...(body.description?.trim() ? { description: body.description.trim() } : {}),
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  log({
    event_type: 'checklist.create',
    severity: 'info',
    user_id: user.id,
    resource_type: 'checklist_item',
    resource_id: data.id,
    action: `Added checklist item: ${body.label.trim()}`,
    metadata: { deliverable_id: id },
  });

  return NextResponse.json({ item: data }, { status: 201 });
}
