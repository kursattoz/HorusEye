-- 1. Reports ↔ Backlog link
alter table public.backlog_items
  add column if not exists deliverable_id uuid references public.report_deliverables(id) on delete set null;

create index if not exists idx_backlog_items_deliverable on public.backlog_items(deliverable_id);

-- 2. Epic/label
alter table public.backlog_items
  add column if not exists epic text;

-- 3. Files link
alter table public.backlog_items
  add column if not exists file_id uuid references public.files(id) on delete set null;

-- 4. Code review tracking
alter table public.backlog_items
  add column if not exists reviewer_id uuid references public.user_profiles(id);

-- 5. Activity log for burndown + performance tracking
create table if not exists public.backlog_activity (
  id              uuid primary key default gen_random_uuid(),
  backlog_item_id uuid not null references public.backlog_items(id) on delete cascade,
  user_id         uuid not null references public.user_profiles(id),
  from_status     text,
  to_status       text,
  action          text not null,
  hours_logged    numeric(5,2),
  created_at      timestamptz default now()
);

create index if not exists idx_backlog_activity_item on public.backlog_activity(backlog_item_id);
create index if not exists idx_backlog_activity_user on public.backlog_activity(user_id);
create index if not exists idx_backlog_activity_date on public.backlog_activity(created_at);

alter table public.backlog_activity enable row level security;

create policy "Authenticated users can read backlog activity"
  on public.backlog_activity for select to authenticated using (true);
create policy "Authenticated users can insert backlog activity"
  on public.backlog_activity for insert to authenticated with check (true);

-- 6. Actual hours on backlog items (for velocity)
alter table public.backlog_items
  add column if not exists actual_hours numeric(5,2) default 0;

-- 7. Started_at for cycle time tracking
alter table public.backlog_items
  add column if not exists started_at timestamptz;
