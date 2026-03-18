
-- smtp_settings: singleton row (id=1 always), admin-only
create table if not exists public.smtp_settings (
  id           int primary key default 1 check (id = 1),
  host         text not null default '',
  port         int  not null default 587,
  secure       bool not null default false,
  username     text not null default '',
  password_enc text not null default '',
  from_name    text not null default '',
  from_email   text not null default '',
  admin_email  text not null default '',
  updated_at   timestamptz,
  updated_by   uuid references public.user_profiles(id) on delete set null
);

-- Seed the singleton row
insert into public.smtp_settings (id) values (1) on conflict do nothing;

-- RLS
alter table public.smtp_settings enable row level security;

create policy "admin_read_smtp"
  on public.smtp_settings for select
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "admin_write_smtp"
  on public.smtp_settings for update
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );
