import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { createNotification } from '@/lib/notifications';

interface Params { params: Promise<{ id: string; itemId: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const { id, itemId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const allowed: Record<string, unknown> = {};
  if (body.label !== undefined) allowed.label = body.label;
  if (body.description !== undefined) allowed.description = body.description || null;
  if (body.is_checked !== undefined) {
    allowed.is_checked = body.is_checked;
    allowed.checked_by = body.is_checked ? user.id : null;
    allowed.checked_at = body.is_checked ? new Date().toISOString() : null;
  }
  if (body.sort_order !== undefined) allowed.sort_order = body.sort_order;

  const { data, error } = await supabase
    .from('checklist_items')
    .update(allowed)
    .eq('id', itemId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // If an item was just checked, see if all items on the deliverable are now complete
  if (body.is_checked === true) {
    const { data: allItems } = await supabase
      .from('checklist_items')
      .select('is_checked')
      .eq('deliverable_id', id);

    const allDone = allItems && allItems.length > 0 && allItems.every(i => i.is_checked);

    if (allDone) {
      const { data: deliverable } = await supabase
        .from('report_deliverables')
        .select('assigned_to, title')
        .eq('id', id)
        .maybeSingle();

      if (deliverable?.assigned_to) {
        await createNotification({
          user_id: deliverable.assigned_to,
          category: 'system',
          title: 'Checklist completed',
          description: `All checklist items for "${deliverable.title ?? 'a deliverable'}" have been checked off.`,
          link: `/reports/${id}`,
        });
      }
    }
  }

  // Log the action
  if (body.is_checked !== undefined) {
    log({
      event_type: body.is_checked ? 'checklist.check' : 'checklist.uncheck',
      severity: 'info',
      user_id: user.id,
      resource_type: 'checklist_item',
      resource_id: itemId,
      action: body.is_checked
        ? `Marked as done: ${data.label}`
        : `Reopened: ${data.label}`,
      metadata: { deliverable_id: id },
    });
  } else if (body.label !== undefined || body.description !== undefined) {
    log({
      event_type: 'checklist.update',
      severity: 'info',
      user_id: user.id,
      resource_type: 'checklist_item',
      resource_id: itemId,
      action: `Edited checklist item: ${data.label}`,
      metadata: { deliverable_id: id, changed_fields: Object.keys(allowed) },
    });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, itemId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch label before deleting for the log
  const { data: item } = await supabase
    .from('checklist_items')
    .select('label')
    .eq('id', itemId)
    .maybeSingle();

  const { error } = await supabase
    .from('checklist_items')
    .delete()
    .eq('id', itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  log({
    event_type: 'checklist.delete',
    severity: 'warn',
    user_id: user.id,
    resource_type: 'checklist_item',
    resource_id: itemId,
    action: `Removed checklist item: ${item?.label ?? itemId}`,
    metadata: { deliverable_id: id },
  });

  return NextResponse.json({ ok: true });
}
