import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications';
import { sendMail } from '@/lib/mailer';
import { reviewResultTemplate } from '@/lib/mailer/templates';
import { log } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://horuseye.app';

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('backlog_reviews')
    .select('*, reviewer:user_profiles!reviewer_id(full_name, avatar_url)')
    .eq('backlog_item_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reviews: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  const { data: review, error } = await supabase
    .from('backlog_reviews')
    .insert({
      backlog_item_id: id,
      reviewer_id: user.id,
      status: body.status ?? 'approved',
      comment: body.comment?.trim() || null,
      has_screenshot: body.has_screenshot ?? false,
    })
    .select('*, reviewer:user_profiles!reviewer_id(full_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get the item info + assignee for notification
  const { data: item } = await supabase
    .from('backlog_items')
    .select('title, assigned_to, seq_id')
    .eq('id', id)
    .single();

  // If approved, auto-advance item from 'review' → 'done'
  if (body.status === 'approved') {
    await supabase
      .from('backlog_items')
      .update({ status: 'done', completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'review');
  }

  // If changes_requested, move back to in_progress
  if (body.status === 'changes_requested') {
    await supabase
      .from('backlog_items')
      .update({ status: 'in_progress' })
      .eq('id', id)
      .eq('status', 'review');
  }

  // Notify assignee (in-app + email)
  if (item?.assigned_to && item.assigned_to !== user.id) {
    const reviewerName = ((review.reviewer as unknown) as { full_name: string } | null)?.full_name ?? 'A reviewer';

    // In-app notification
    createNotification({
      user_id: item.assigned_to,
      category: 'feedback',
      title: body.status === 'approved'
        ? `BL-${item.seq_id} approved!`
        : `BL-${item.seq_id} needs changes`,
      description: body.status === 'approved'
        ? `${reviewerName} approved "${item.title}".`
        : `${reviewerName} requested changes on "${item.title}": ${body.comment?.slice(0, 100) ?? ''}`,
      link: '/sprints',
    });

    // Email notification
    const { data: assignee } = await supabase
      .from('user_profiles')
      .select('full_name, email, notification_preferences')
      .eq('id', item.assigned_to)
      .maybeSingle();

    if (assignee?.email) {
      const prefs = assignee.notification_preferences as { email_on_feedback?: boolean } | null;
      if (prefs?.email_on_feedback !== false) {
        const { subject: emailSubject, html: emailHtml } = reviewResultTemplate({
          assigneeName: assignee.full_name ?? assignee.email,
          reviewerName,
          taskId: `BL-${item.seq_id}`,
          taskTitle: item.title,
          approved: body.status === 'approved',
          comment: body.comment || undefined,
          appUrl: APP_URL,
        });
        sendMail({ to: assignee.email, subject: emailSubject, html: emailHtml });
      }
    }
  }

  // Log review submission
  const reviewerName = ((review.reviewer as unknown) as { full_name: string } | null)?.full_name ?? 'Unknown';
  log({
    event_type: body.status === 'approved' ? 'checklist.check' : 'checklist.update',
    severity: 'info',
    user_id: user.id,
    resource_type: 'backlog_review',
    resource_id: review.id,
    action: `Review submitted: BL-${item?.seq_id} ${body.status} by ${reviewerName}`,
    metadata: {
      backlog_item_id: id,
      review_status: body.status,
      has_comment: !!body.comment,
      comment_length: body.comment?.length ?? 0,
      has_screenshot: body.has_screenshot ?? false,
      email_sent: !!(item?.assigned_to && item.assigned_to !== user.id),
      notification_sent: !!(item?.assigned_to && item.assigned_to !== user.id),
    },
  });

  // Record in backlog_activity
  await supabase.from('backlog_activity').insert({
    backlog_item_id: id,
    user_id: user.id,
    from_status: 'review',
    to_status: body.status === 'approved' ? 'done' : 'in_progress',
    action: `review_${body.status}`,
  });

  return NextResponse.json({ review }, { status: 201 });
}
