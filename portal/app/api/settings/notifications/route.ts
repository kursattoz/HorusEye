import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export interface NotificationPreferences {
  email_reminders: boolean;
  reminder_days_before: number[];
  email_on_assign: boolean;
  email_on_feedback: boolean;
}

const DEFAULTS: NotificationPreferences = {
  email_reminders: true,
  reminder_days_before: [3, 1, 0],
  email_on_assign: true,
  email_on_feedback: true,
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('notification_preferences')
    .eq('id', user.id)
    .single();

  const prefs = { ...DEFAULTS, ...(profile?.notification_preferences as Partial<NotificationPreferences> ?? {}) };
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Validate and sanitize
  const prefs: NotificationPreferences = {
    email_reminders: typeof body.email_reminders === 'boolean' ? body.email_reminders : DEFAULTS.email_reminders,
    reminder_days_before: Array.isArray(body.reminder_days_before)
      ? body.reminder_days_before.filter((n: unknown) => typeof n === 'number' && [7, 3, 1, 0].includes(n as number))
      : DEFAULTS.reminder_days_before,
    email_on_assign: typeof body.email_on_assign === 'boolean' ? body.email_on_assign : DEFAULTS.email_on_assign,
    email_on_feedback: typeof body.email_on_feedback === 'boolean' ? body.email_on_feedback : DEFAULTS.email_on_feedback,
  };

  const { error } = await supabase
    .from('user_profiles')
    .update({ notification_preferences: prefs })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ preferences: prefs });
}
