-- 1. Add dev_role to user_profiles
alter table public.user_profiles
  add column if not exists dev_role text
  check (dev_role in ('product_owner', 'portal_frontend', 'portal_backend', 'ai_backend', 'fullstack', 'project_coordinator'));

-- 2. Sprints table
create table if not exists public.sprints (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  goal        text,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'planning'
              check (status in ('planning', 'active', 'completed')),
  created_by  uuid references public.user_profiles(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create trigger update_sprints_updated_at
  before update on public.sprints
  for each row execute function public.update_updated_at_column();

alter table public.sprints enable row level security;

create policy "Authenticated users can read sprints"
  on public.sprints for select to authenticated using (true);
create policy "Authenticated users can insert sprints"
  on public.sprints for insert to authenticated with check (true);
create policy "Authenticated users can update sprints"
  on public.sprints for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete sprints"
  on public.sprints for delete to authenticated using (true);

-- 3. Backlog items table
create table if not exists public.backlog_items (
  id              uuid primary key default gen_random_uuid(),
  sprint_id       uuid references public.sprints(id) on delete set null,
  title           text not null,
  description     text,
  prd_id          text,
  prd_section     text,
  dev_role        text,
  assigned_to     uuid references public.user_profiles(id),
  status          text not null default 'backlog'
                  check (status in ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority        text not null default 'medium'
                  check (priority in ('critical', 'high', 'medium', 'low')),
  estimated_hours integer,
  sort_order      integer default 0,
  created_by      uuid references public.user_profiles(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  completed_at    timestamptz
);

create trigger update_backlog_items_updated_at
  before update on public.backlog_items
  for each row execute function public.update_updated_at_column();

alter table public.backlog_items enable row level security;

create policy "Authenticated users can read backlog items"
  on public.backlog_items for select to authenticated using (true);
create policy "Authenticated users can insert backlog items"
  on public.backlog_items for insert to authenticated with check (true);
create policy "Authenticated users can update backlog items"
  on public.backlog_items for update to authenticated using (true) with check (true);
create policy "Authenticated users can delete backlog items"
  on public.backlog_items for delete to authenticated using (true);

create index if not exists idx_backlog_items_sprint on public.backlog_items(sprint_id);
create index if not exists idx_backlog_items_assigned on public.backlog_items(assigned_to);
create index if not exists idx_backlog_items_status on public.backlog_items(status);
create index if not exists idx_backlog_items_prd on public.backlog_items(prd_id);
