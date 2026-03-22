import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications';
import { sendMail } from '@/lib/mailer';
import { unblockRequestTemplate } from '@/lib/mailer/templates';
import { log } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://horuseye.app';

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get the blocked item and its blocker
  const { data: item } = await supabase
    .from('backlog_items')
    .select('id, title, seq_id, blocked_by, assigned_to')
    .eq('id', id)
    .single();

  if (!item?.blocked_by) {
    return NextResponse.json({ error: 'Item has no blocker' }, { status: 400 });
  }

  const { data: blockerItem } = await supabase
    .from('backlog_items')
    .select('id, title, seq_id, status, assigned_to')
    .eq('id', item.blocked_by)
    .single();

  if (!blockerItem) {
    return NextResponse.json({ error: 'Blocker not found' }, { status: 404 });
  }

  if (blockerItem.status === 'done') {
    return NextResponse.json({ error: 'Blocker is already done' }, { status: 400 });
  }

  // Get requester name
  const { data: requester } = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const requesterName = requester?.full_name ?? 'A team member';

  // Send notification to blocker's assignee
  if (blockerItem.assigned_to) {
    createNotification({
      user_id: blockerItem.assigned_to,
      category: 'system',
      title: `Unblock request: BL-${blockerItem.seq_id}`,
      description: `${requesterName} is waiting on "BL-${blockerItem.seq_id}: ${blockerItem.title}" to start "BL-${item.seq_id}: ${item.title}". Please prioritize.`,
      link: '/sprints',
    });

    // Send email too
    const { data: assignee } = await supabase
      .from('user_profiles')
      .select('full_name, email, notification_preferences')
      .eq('id', blockerItem.assigned_to)
      .single();

    if (assignee?.email) {
      const prefs = assignee.notification_preferences as { email_on_assign?: boolean } | null;
      if (prefs?.email_on_assign !== false) {
        const { subject, html } = unblockRequestTemplate({
          blockerAssigneeName: assignee.full_name ?? assignee.email,
          requesterName,
          blockerTaskId: `BL-${blockerItem.seq_id}`,
          blockerTaskTitle: blockerItem.title,
          blockedTaskId: `BL-${item.seq_id}`,
          blockedTaskTitle: item.title,
          appUrl: APP_URL,
        });
        sendMail({ to: assignee.email, subject, html });
      }
    }
  }

  log({
    event_type: 'checklist.update',
    severity: 'info',
    user_id: user.id,
    resource_type: 'backlog_item',
    resource_id: id,
    action: `Unblock requested: BL-${item.seq_id} waiting on BL-${blockerItem.seq_id}`,
    metadata: { blocker_id: blockerItem.id, blocker_assignee: blockerItem.assigned_to },
  });

  return NextResponse.json({ ok: true });
}
