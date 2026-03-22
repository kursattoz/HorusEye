create table if not exists public.backlog_attachments (
  id              uuid primary key default gen_random_uuid(),
  backlog_item_id uuid not null references public.backlog_items(id) on delete cascade,
  file_name       text not null,
  file_url        text not null,
  file_type       text not null,
  file_size_bytes integer,
  uploaded_by     uuid references public.user_profiles(id),
  created_at      timestamptz default now()
);

create index if not exists idx_backlog_attachments_item on public.backlog_attachments(backlog_item_id);

alter table public.backlog_attachments enable row level security;

create policy "Authenticated users can read backlog attachments"
  on public.backlog_attachments for select to authenticated using (true);
create policy "Authenticated users can insert backlog attachments"
  on public.backlog_attachments for insert to authenticated with check (true);
create policy "Authenticated users can delete backlog attachments"
  on public.backlog_attachments for delete to authenticated using (true);
