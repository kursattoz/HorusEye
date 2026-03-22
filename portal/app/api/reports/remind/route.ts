import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendMail } from '@/lib/mailer';
import { deadlineReminderTemplate } from '@/lib/mailer/templates';
import { createNotification } from '@/lib/notifications';
import { log } from '@/lib/logger';
import type { NotificationPreferences } from '@/app/api/settings/notifications/route';

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://horuseye.app';

// All possible reminder thresholds (positive = before, 0 = day of, negative = overdue)
const ALL_THRESHOLDS = [7, 3, 1, 0, -1, -2, -3, -5, -7];

const DEFAULT_PREFS: NotificationPreferences = {
  email_reminders: true,
  reminder_days_before: [3, 1, 0],
  email_on_assign: true,
  email_on_feedback: true,
};

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  notification_preferences: NotificationPreferences | null;
}

function getPrefs(member: TeamMember): NotificationPreferences {
  return { ...DEFAULT_PREFS, ...(member.notification_preferences ?? {}) };
}

export async function POST(request: NextRequest) {
  // Auth: cron secret or admin
  const cronSecret = request.headers.get('x-cron-secret');
  const isCronCall = CRON_SECRET && cronSecret === CRON_SECRET;

  if (!isCronCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const supabase = await createClient({ serviceRole: true });

  // Fetch incomplete deliverables with their checklists
  const { data: deliverables, error } = await supabase
    .from('report_deliverables')
    .select('*, checklist_items(id, is_checked)')
    .neq('status', 'completed');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deliverables?.length) return NextResponse.json({ reminded: 0 });

  // Fetch all team members with notification preferences
  const { data: teamMembers } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, notification_preferences')
    .eq('is_active', true);

  const team = (teamMembers ?? []) as TeamMember[];

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  let remindedCount = 0;

  for (const d of deliverables) {
    const deadline = new Date(d.deadline);
    deadline.setHours(0, 0, 0, 0);
    const diffMs = deadline.getTime() - now.getTime();
    const daysLeft = Math.round(diffMs / (1000 * 60 * 60 * 24));

    // Only process on valid threshold days
    if (!ALL_THRESHOLDS.includes(daysLeft)) continue;

    const items = d.checklist_items ?? [];
    const totalCount = items.length;
    const checkedCount = items.filter((i: { is_checked: boolean }) => i.is_checked).length;

    const formattedDeadline = deadline.toLocaleDateString('tr-TR', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // Determine who to email
    let recipientId = d.assigned_to;
    let isFallback = false;
    let assigneeName: string | undefined;

    // If overdue and assigned person hasn't completed, escalate to random team member
    if (daysLeft < 0 && d.assigned_to && checkedCount < totalCount) {
      const assignee = team.find(m => m.id === d.assigned_to);
      assigneeName = assignee?.full_name ?? 'Unknown';
      const others = team.filter(m => m.id !== d.assigned_to);
      if (others.length > 0) {
        const picked = others[Math.floor(Math.random() * others.length)]!;
        recipientId = picked.id;
        isFallback = true;
      }
    }

    if (!recipientId) {
      // No one assigned — pick random team member
      if (team.length > 0) {
        const picked = team[Math.floor(Math.random() * team.length)]!;
        recipientId = picked.id;
        isFallback = true;
      } else {
        continue;
      }
    }

    const recipient = team.find(m => m.id === recipientId);
    if (!recipient?.email) continue;

    // Check user's notification preferences
    const prefs = getPrefs(recipient);

    // Always send in-app notification
    const notifTitle = daysLeft < 0
      ? `OVERDUE: ${d.title}`
      : daysLeft === 0
        ? `Due TODAY: ${d.title}`
        : `Reminder: ${d.title} — ${daysLeft} day${daysLeft > 1 ? 's' : ''} left`;

    createNotification({
      user_id: recipientId,
      category: 'system',
      title: notifTitle,
      description: `Checklist: ${checkedCount}/${totalCount} completed.${isFallback ? ` Originally assigned to ${assigneeName}.` : ''}`,
      link: `/reports/${d.id}`,
    });

    // Check if user wants email reminders
    if (!prefs.email_reminders) continue;

    // For pre-deadline reminders, check if this threshold day is in user's preferences
    if (daysLeft >= 0 && !prefs.reminder_days_before.includes(daysLeft)) continue;

    const templateData = {
      recipientName: recipient.full_name ?? recipient.email,
      deliverableTitle: d.title,
      deliverableNumber: d.deliverable_number,
      deadline: formattedDeadline,
      daysLeft,
      checkedCount,
      totalCount,
      isFallback,
      assigneeName,
      appUrl: APP_URL,
      reportLink: `/reports/${d.id}`,
    };

    const { subject, html } = deadlineReminderTemplate(templateData);
    sendMail({ to: recipient.email, subject, html });

    log({
      event_type: 'system.warning',
      severity: daysLeft < 0 ? 'warn' : 'info',
      action: `Deadline reminder sent for "${d.title}" to ${recipient.full_name}${isFallback ? ' (fallback)' : ''}`,
      metadata: { deliverable_id: d.id, days_left: daysLeft, is_fallback: isFallback },
    });

    remindedCount++;
  }

  return NextResponse.json({ reminded: remindedCount });
}
