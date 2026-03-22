
-- Helper function: check if the current auth user is admin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Generic trigger function to keep updated_at in sync
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- user_profiles: extends auth.users with app-specific data
create table if not exists public.user_profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 varchar not null,
  full_name             varchar,
  role                  varchar not null default 'assistant'
                        check (role in ('admin', 'supervisor', 'assistant')),
  team_id               varchar default 'horuseye-team',
  is_active             boolean default true,
  avatar_url            text,
  last_login            timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  deleted_at            timestamptz
);

-- Auto-update updated_at
create trigger update_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.update_updated_at_column();

-- RLS
alter table public.user_profiles enable row level security;

create policy "admin_full_access"
  on public.user_profiles for all
  using (is_admin())
  with check (is_admin());

create policy "user_own_profile"
  on public.user_profiles for select
  using (id = auth.uid());
