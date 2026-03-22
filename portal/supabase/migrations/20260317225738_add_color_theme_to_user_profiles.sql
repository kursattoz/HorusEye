
-- Add color_theme preference to user_profiles
alter table public.user_profiles
  add column if not exists color_theme varchar not null default 'red'
  check (color_theme in ('red', 'pink', 'orange', 'blue'));
