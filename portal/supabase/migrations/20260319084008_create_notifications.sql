create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.user_profiles(id) on delete cascade,
  category    varchar not null check (category in ('files', 'feedback', 'team', 'system')),
  title       text not null,
  description text,
  is_read     boolean not null default false,
  link        text,           -- optional link to navigate to
  metadata    jsonb default '{}',
  created_at  timestamptz not null default now()
);

create index idx_notifications_user on public.notifications (user_id, created_at desc);
create index idx_notifications_unread on public.notifications (user_id) where is_read = false;

alter table public.notifications enable row level security;

-- Users can only see their own notifications
create policy "Users can read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy "Users can update own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Service role inserts (from API routes)
create policy "Service can insert notifications"
  on public.notifications for insert
  with check (true);
