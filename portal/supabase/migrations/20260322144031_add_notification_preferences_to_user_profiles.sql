alter table public.user_profiles
  add column if not exists notification_preferences jsonb
  default '{"email_reminders": true, "reminder_days_before": [3, 1, 0], "email_on_assign": true, "email_on_feedback": true}'::jsonb;
