create table if not exists public.backlog_reviews (
  id              uuid primary key default gen_random_uuid(),
  backlog_item_id uuid not null references public.backlog_items(id) on delete cascade,
  reviewer_id     uuid not null references public.user_profiles(id),
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'changes_requested')),
  comment         text,
  has_screenshot  boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create index if not exists idx_backlog_reviews_item on public.backlog_reviews(backlog_item_id);
create index if not exists idx_backlog_reviews_reviewer on public.backlog_reviews(reviewer_id);

alter table public.backlog_reviews enable row level security;

create policy "Authenticated users can read backlog reviews"
  on public.backlog_reviews for select to authenticated using (true);
create policy "Authenticated users can insert backlog reviews"
  on public.backlog_reviews for insert to authenticated with check (true);
create policy "Authenticated users can update backlog reviews"
  on public.backlog_reviews for update to authenticated using (true) with check (true);
