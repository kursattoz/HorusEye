import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params { params: Promise<{ id: string; itemId: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const allowed: Record<string, unknown> = {};
  if (body.label !== undefined) allowed.label = body.label;
  if (body.is_checked !== undefined) {
    allowed.is_checked = body.is_checked;
    allowed.checked_by = body.is_checked ? user.id : null;
  }
  if (body.sort_order !== undefined) allowed.sort_order = body.sort_order;

  const { data, error } = await supabase
    .from('checklist_items')
    .update(allowed)
    .eq('id', itemId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ item: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { itemId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('checklist_items')
    .delete()
    .eq('id', itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
