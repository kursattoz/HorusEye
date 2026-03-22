import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createNotification } from '@/lib/notifications';
import { sendMail } from '@/lib/mailer';
import { calendarEventTemplate } from '@/lib/mailer/templates';
import { log } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://horuseye.app';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  let query = supabase
    .from('calendar_events')
    .select('*, attendees:calendar_event_attendees(user_id, status, user:user_profiles!user_id(full_name, avatar_url)), creator:user_profiles!created_by(full_name)')
    .order('start_time', { ascending: true });

  if (from) query = query.gte('start_time', from);
  if (to) query = query.lte('start_time', to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Also fetch sprint events and deliverable deadlines
  const [{ data: sprints }, { data: deliverables }] = await Promise.all([
    supabase.from('sprints').select('name, start_date, end_date, status').order('start_date'),
    supabase.from('report_deliverables').select('title, deliverable_number, deadline, status').order('deadline'),
  ]);

  return NextResponse.json({
    events: data ?? [],
    sprints: sprints ?? [],
    deliverables: deliverables ?? [],
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.title?.trim() || !body.start_time) {
    return NextResponse.json({ error: 'Title and start_time required' }, { status: 400 });
  }

  const { data: event, error } = await supabase
    .from('calendar_events')
    .insert({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      start_time: body.start_time,
      end_time: body.end_time || null,
      all_day: body.all_day ?? false,
      event_type: body.event_type ?? 'meeting',
      color: body.color ?? '#3b82f6',
      location: body.location?.trim() || null,
      reminder_minutes: body.reminder_minutes ?? null,
      recurrence: body.recurrence || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add attendees
  const attendeeIds: string[] = body.attendees ?? [];
  if (attendeeIds.length > 0) {
    await supabase.from('calendar_event_attendees').insert(
      attendeeIds.map(uid => ({ event_id: event.id, user_id: uid }))
    );
  }

  // Get creator name
  const { data: creator } = await supabase
    .from('user_profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();

  const creatorName = creator?.full_name ?? 'A team member';
  const startDate = new Date(body.start_time);
  const formattedDate = startDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const formattedTime = body.all_day ? 'All day' : startDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

  // Notify attendees (not the creator)
  for (const uid of attendeeIds) {
    if (uid === user.id) continue;

    createNotification({
      user_id: uid,
      category: 'system',
      title: `New event: ${body.title.trim()}`,
      description: `${creatorName} invited you — ${formattedDate} at ${formattedTime}${body.location ? `, ${body.location}` : ''}`,
      link: '/calendar',
    });

    // Email
    const { data: attendee } = await supabase
      .from('user_profiles')
      .select('full_name, email, notification_preferences')
      .eq('id', uid)
      .maybeSingle();

    if (attendee?.email) {
      const prefs = attendee.notification_preferences as { email_on_assign?: boolean } | null;
      if (prefs?.email_on_assign !== false) {
        const { subject, html } = calendarEventTemplate({
          recipientName: attendee.full_name ?? attendee.email,
          creatorName,
          eventTitle: body.title.trim(),
          eventDate: formattedDate,
          eventTime: formattedTime,
          eventType: body.event_type ?? 'meeting',
          location: body.location || undefined,
          description: body.description || undefined,
          reminderMinutes: body.reminder_minutes || undefined,
          appUrl: APP_URL,
        });
        sendMail({ to: attendee.email, subject, html });
      }
    }
  }

  log({
    event_type: 'checklist.create',
    severity: 'info',
    user_id: user.id,
    resource_type: 'calendar_event',
    resource_id: event.id,
    action: `Created event: ${body.title.trim()} on ${formattedDate}`,
    metadata: { attendees: attendeeIds, event_type: body.event_type, reminder_minutes: body.reminder_minutes },
  });

  return NextResponse.json({ event }, { status: 201 });
}
