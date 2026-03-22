
-- report_deliverables: deadline-based deliverables for the team
create table if not exists public.report_deliverables (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  description         text,
  deadline            date not null,
  deliverable_number  text not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'in_progress', 'completed')),
  assigned_to         uuid references public.user_profiles(id),
  file_id             uuid references public.files(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Auto-update updated_at
create trigger update_report_deliverables_updated_at
  before update on public.report_deliverables
  for each row execute function public.update_updated_at_column();

-- RLS
alter table public.report_deliverables enable row level security;

create policy "Authenticated users can read deliverables"
  on public.report_deliverables for select to authenticated
  using (true);

create policy "Authenticated users can insert deliverables"
  on public.report_deliverables for insert to authenticated
  with check (true);

create policy "Authenticated users can update deliverables"
  on public.report_deliverables for update to authenticated
  using (true) with check (true);

create policy "Authenticated users can delete deliverables"
  on public.report_deliverables for delete to authenticated
  using (true);

-- checklist_items: sub-tasks within each deliverable
create table if not exists public.checklist_items (
  id              uuid primary key default gen_random_uuid(),
  deliverable_id  uuid not null references public.report_deliverables(id) on delete cascade,
  label           text not null,
  is_checked      boolean default false,
  checked_by      uuid references public.user_profiles(id),
  sort_order      integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- Auto-update updated_at
create trigger update_checklist_items_updated_at
  before update on public.checklist_items
  for each row execute function public.update_updated_at_column();

-- RLS
alter table public.checklist_items enable row level security;

create policy "Authenticated users can read checklist items"
  on public.checklist_items for select to authenticated
  using (true);

create policy "Authenticated users can insert checklist items"
  on public.checklist_items for insert to authenticated
  with check (true);

create policy "Authenticated users can update checklist items"
  on public.checklist_items for update to authenticated
  using (true) with check (true);

create policy "Authenticated users can delete checklist items"
  on public.checklist_items for delete to authenticated
  using (true);
