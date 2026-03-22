import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications';
import { sendMail } from '@/lib/mailer';
import { calendarReminderTemplate } from '@/lib/mailer/templates';

const CRON_SECRET = process.env.CRON_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://horuseye.app';

export async function POST(request: NextRequest) {
  const cronSecret = request.headers.get('x-cron-secret');
  const isCronCall = CRON_SECRET && cronSecret === CRON_SECRET;

  if (!isCronCall) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient({ serviceRole: true });
  const now = new Date();

  // Find events with reminders that should fire now (within 5 min window)
  // Events where start_time - reminder_minutes is within [now-5min, now]
  const { data: events } = await supabase
    .from('calendar_events')
    .select('*, attendees:calendar_event_attendees(user_id, user:user_profiles!user_id(full_name, email))')
    .not('reminder_minutes', 'is', null)
    .gte('start_time', now.toISOString());

  let reminded = 0;

  for (const event of events ?? []) {
    const startTime = new Date(event.start_time);
    const reminderTime = new Date(startTime.getTime() - (event.reminder_minutes ?? 0) * 60 * 1000);
    const windowStart = new Date(now.getTime() - 5 * 60 * 1000);

    // Reminder should fire if reminderTime is within [now-5min, now]
    if (reminderTime >= windowStart && reminderTime <= now) {
      const formattedTime = startTime.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      const formattedDate = startTime.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });

      for (const attendee of event.attendees ?? []) {
        const userData = (attendee.user as unknown) as { full_name: string; email: string } | null;

        createNotification({
          user_id: attendee.user_id,
          category: 'system',
          title: `Reminder: ${event.title}`,
          description: `Starting in ${event.reminder_minutes} minutes — ${formattedDate} at ${formattedTime}`,
          link: '/calendar',
        });

        if (userData?.email) {
          const { subject, html } = calendarReminderTemplate({
            recipientName: userData.full_name ?? userData.email,
            eventTitle: event.title,
            eventDate: formattedDate,
            eventTime: formattedTime,
            minutesBefore: event.reminder_minutes ?? 15,
            location: event.location || undefined,
            appUrl: APP_URL,
          });
          sendMail({ to: userData.email, subject, html });
        }

        reminded++;
      }
    }
  }

  return NextResponse.json({ reminded });
}
