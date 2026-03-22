alter table public.backlog_items
  add column if not exists blocked_by uuid references public.backlog_items(id) on delete set null;

create index if not exists idx_backlog_items_blocked_by on public.backlog_items(blocked_by);
