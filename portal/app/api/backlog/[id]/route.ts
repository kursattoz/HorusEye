import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { createNotification, notifyAdmins } from '@/lib/notifications';
import { sendMail } from '@/lib/mailer';
import { reviewRequestTemplate } from '@/lib/mailer/templates';

interface Params { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get current state for activity tracking
  const { data: prev } = await supabase
    .from('backlog_items')
    .select('status, assigned_to, title, reviewer_id, seq_id')
    .eq('id', id)
    .single();

  const body = await request.json();
  const allowed: Record<string, unknown> = {};

  if (body.title !== undefined) allowed.title = body.title;
  if (body.description !== undefined) allowed.description = body.description || null;
  if (body.sprint_id !== undefined) allowed.sprint_id = body.sprint_id || null;
  if (body.prd_id !== undefined) allowed.prd_id = body.prd_id || null;
  if (body.prd_section !== undefined) allowed.prd_section = body.prd_section || null;
  if (body.epic !== undefined) allowed.epic = body.epic || null;
  if (body.dev_role !== undefined) allowed.dev_role = body.dev_role || null;
  if (body.assigned_to !== undefined) allowed.assigned_to = body.assigned_to || null;
  if (body.reviewer_id !== undefined) allowed.reviewer_id = body.reviewer_id || null;
  if (body.deliverable_id !== undefined) allowed.deliverable_id = body.deliverable_id || null;
  if (body.file_id !== undefined) allowed.file_id = body.file_id || null;
  if (body.priority !== undefined) allowed.priority = body.priority;
  if (body.sort_order !== undefined) allowed.sort_order = body.sort_order;
  if (body.estimated_hours !== undefined) allowed.estimated_hours = body.estimated_hours;
  if (body.actual_hours !== undefined) allowed.actual_hours = body.actual_hours;
  if (body.blocked_by !== undefined) allowed.blocked_by = body.blocked_by || null;

  if (body.status !== undefined) {
    // Review enforcement: cannot skip review → done if reviewer is assigned
    if (body.status === 'done' && prev?.reviewer_id && prev?.status !== 'review') {
      return NextResponse.json({
        error: `BL-${prev.seq_id} has a reviewer assigned. Move to "Review" first, then the reviewer will approve it to Done.`,
      }, { status: 422 });
    }

    // Blocker enforcement: cannot advance past 'todo' if blocker not done
    const advancingStatuses = ['in_progress', 'review', 'done'];
    if (advancingStatuses.includes(body.status)) {
      const { data: currentItem } = await supabase
        .from('backlog_items')
        .select('blocked_by, seq_id')
        .eq('id', id)
        .single();

      if (currentItem?.blocked_by) {
        const { data: blockerItem } = await supabase
          .from('backlog_items')
          .select('id, title, status, assigned_to, seq_id, priority, prd_id')
          .eq('id', currentItem.blocked_by)
          .single();

        if (blockerItem && blockerItem.status !== 'done') {
          // Get assignee name
          let assigneeName: string | null = null;
          if (blockerItem.assigned_to) {
            const { data: assigneeProfile } = await supabase
              .from('user_profiles')
              .select('full_name')
              .eq('id', blockerItem.assigned_to)
              .maybeSingle();
            assigneeName = assigneeProfile?.full_name ?? null;
          }

          // Notify blocker's assignee
          if (blockerItem.assigned_to && blockerItem.assigned_to !== user.id) {
            createNotification({
              user_id: blockerItem.assigned_to,
              category: 'system',
              title: `BL-${blockerItem.seq_id} is blocking BL-${currentItem.seq_id}`,
              description: `"${blockerItem.title}" must be completed before "${prev?.title}" can proceed. Please prioritize.`,
              link: `/sprints`,
            });
          }

          return NextResponse.json({
            error: `Blocked by BL-${blockerItem.seq_id}: "${blockerItem.title}" (${blockerItem.status.replace('_', ' ')}). Complete it first.`,
            blocker: {
              seq_id: blockerItem.seq_id,
              title: blockerItem.title,
              status: blockerItem.status,
              priority: blockerItem.priority,
              prd_id: blockerItem.prd_id,
              assignee_name: assigneeName,
              assigned_to: blockerItem.assigned_to,
            },
          }, { status: 409 });
        }
      }
    }

    allowed.status = body.status;
    if (body.status === 'done') {
      allowed.completed_at = new Date().toISOString();
    } else {
      allowed.completed_at = null;
    }
    if (body.status === 'in_progress' && prev?.status !== 'in_progress') {
      allowed.started_at = new Date().toISOString();
    }
  }

  const { data, error } = await supabase
    .from('backlog_items')
    .update(allowed)
    .eq('id', id)
    .select('*, assignee:user_profiles!assigned_to(full_name, avatar_url, dev_role), blocker:backlog_items!blocked_by(id, title, status, seq_id)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Notify file uploader if item has a file_id
  if (data.file_id) {
    const { data: file } = await supabase
      .from('files')
      .select('display_name, uploaded_by')
      .eq('id', data.file_id)
      .maybeSingle();

    if (file?.uploaded_by) {
      createNotification({
        user_id: file.uploaded_by,
        category: 'files',
        title: `File updated: ${file.display_name}`,
        description: `Backlog item "${data.title}" has been updated.`,
        link: '/files',
      });
    }
  }

  // Notify reviewer when item moves to 'review'
  if (body.status === 'review' && prev?.status !== 'review') {
    const { data: fullItem } = await supabase
      .from('backlog_items')
      .select('reviewer_id, seq_id, title')
      .eq('id', id)
      .single();

    if (fullItem?.reviewer_id) {
      // Get reviewer + assignee names for notification
      const [{ data: reviewer }, { data: assignerProfile }] = await Promise.all([
        supabase.from('user_profiles').select('full_name, email, notification_preferences').eq('id', fullItem.reviewer_id).maybeSingle(),
        supabase.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle(),
      ]);

      const assignerName = assignerProfile?.full_name ?? 'A team member';

      if (reviewer) {
        // In-app notification
        createNotification({
          user_id: fullItem.reviewer_id,
          category: 'feedback',
          title: `Review requested: BL-${fullItem.seq_id}`,
          description: `${assignerName} submitted "${fullItem.title}" for your review.`,
          link: '/sprints',
        });

        // Email notification
        const emailSent = !!(reviewer.email);
        if (reviewer.email) {
          const prefs = reviewer.notification_preferences as { email_on_feedback?: boolean } | null;
          if (prefs?.email_on_feedback !== false) {
            const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://horuseye.app';
            const { subject: emailSubject, html: emailHtml } = reviewRequestTemplate({
              reviewerName: reviewer.full_name ?? reviewer.email,
              requesterName: assignerName,
              taskId: `BL-${fullItem.seq_id}`,
              taskTitle: fullItem.title,
              appUrl: APP_URL,
            });
            sendMail({ to: reviewer.email, subject: emailSubject, html: emailHtml });
          }
        }

        // Log review request
        log({
          event_type: 'checklist.update',
          severity: 'info',
          user_id: user.id,
          resource_type: 'backlog_item',
          resource_id: id,
          action: `Review requested: BL-${fullItem.seq_id} → ${reviewer.full_name ?? 'unknown'}`,
          metadata: {
            reviewer_id: fullItem.reviewer_id,
            reviewer_name: reviewer.full_name,
            reviewer_email: reviewer.email,
            email_sent: emailSent,
            notification_sent: true,
          },
        });

        // Record in backlog_activity
        await supabase.from('backlog_activity').insert({
          backlog_item_id: id,
          user_id: user.id,
          from_status: prev?.status ?? null,
          to_status: 'review',
          action: 'review_requested',
        });
      }
    }
  }

  // Notify dependents when this item is completed — unblock them
  if (body.status === 'done') {
    const { data: dependents } = await supabase
      .from('backlog_items')
      .select('id, title, assigned_to, seq_id')
      .eq('blocked_by', id);

    for (const dep of dependents ?? []) {
      if (dep.assigned_to) {
        createNotification({
          user_id: dep.assigned_to,
          category: 'system',
          title: `BL-${dep.seq_id} unblocked!`,
          description: `"${data.title}" is done. You can now work on "${dep.title}".`,
          link: `/sprints`,
        });
      }
    }
  }

  // Record activity for status changes and hour logging
  if (body.status !== undefined && body.status !== prev?.status) {
    await supabase.from('backlog_activity').insert({
      backlog_item_id: id,
      user_id: user.id,
      from_status: prev?.status ?? null,
      to_status: body.status,
      action: `status_change`,
    });
  }

  if (body.actual_hours !== undefined) {
    await supabase.from('backlog_activity').insert({
      backlog_item_id: id,
      user_id: user.id,
      action: 'hours_logged',
      hours_logged: body.actual_hours,
    });
  }

  if (body.assigned_to !== undefined && body.assigned_to !== prev?.assigned_to) {
    await supabase.from('backlog_activity').insert({
      backlog_item_id: id,
      user_id: user.id,
      action: 'reassigned',
      from_status: prev?.assigned_to,
      to_status: body.assigned_to,
    });
  }

  // Auto-sync deliverable checklist when backlog item is done
  if (body.status === 'done' && data.deliverable_id) {
    // Check if all backlog items for this deliverable are done
    const { data: siblingItems } = await supabase
      .from('backlog_items')
      .select('id, status')
      .eq('deliverable_id', data.deliverable_id);

    const allDone = siblingItems?.every((i: { status: string }) => i.status === 'done');
    if (allDone) {
      await supabase
        .from('report_deliverables')
        .update({ status: 'completed' })
        .eq('id', data.deliverable_id);
    } else {
      await supabase
        .from('report_deliverables')
        .update({ status: 'in_progress' })
        .eq('id', data.deliverable_id);
    }
  }

  // Log
  const changedFields = Object.keys(allowed);
  if (changedFields.length > 0) {
    const actionParts: string[] = [];
    if (body.status !== undefined) actionParts.push(`status → ${body.status}`);
    if (body.assigned_to !== undefined) actionParts.push(`assigned → ${data.assignee?.full_name ?? 'unassigned'}`);
    if (body.sprint_id !== undefined) actionParts.push(body.sprint_id ? 'moved to sprint' : 'moved to backlog');
    if (body.priority !== undefined) actionParts.push(`priority → ${body.priority}`);
    if (body.actual_hours !== undefined) actionParts.push(`logged ${body.actual_hours}h`);
    if (body.epic !== undefined) actionParts.push(`epic → ${body.epic ?? 'none'}`);

    log({
      event_type: body.status === 'done' ? 'checklist.check' : 'checklist.update',
      severity: 'info',
      user_id: user.id,
      resource_type: 'backlog_item',
      resource_id: id,
      action: `${data.title}: ${actionParts.join(', ') || 'updated'}`,
      metadata: { changed_fields: changedFields, prd_id: data.prd_id, sprint_id: data.sprint_id },
    });
  }

  return NextResponse.json({ item: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: item } = await supabase
    .from('backlog_items')
    .select('title, file_id')
    .eq('id', id)
    .maybeSingle();

  let fileDisplayName: string | null = null;
  if (item?.file_id) {
    const { data: file } = await supabase
      .from('files')
      .select('display_name')
      .eq('id', item.file_id)
      .maybeSingle();
    fileDisplayName = file?.display_name ?? null;
  }

  const { error } = await supabase.from('backlog_items').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  log({
    event_type: 'checklist.delete',
    severity: 'warn',
    user_id: user.id,
    resource_type: 'backlog_item',
    resource_id: id,
    action: `Removed backlog item: ${item?.title ?? id}`,
  });

  if (fileDisplayName) {
    notifyAdmins({
      category: 'files',
      title: `Backlog item deleted with associated file: ${fileDisplayName}`,
      description: `The backlog item "${item?.title ?? id}" was deleted, which was associated with the file "${fileDisplayName}".`,
    });
  }

  return NextResponse.json({ ok: true });
}
