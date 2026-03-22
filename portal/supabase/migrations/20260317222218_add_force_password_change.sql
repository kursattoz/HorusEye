
-- Add force_password_change flag for newly created user accounts
alter table public.user_profiles
  add column if not exists force_password_change boolean not null default false;
