
-- feedbacks: file-level and inline feedback from supervisors/admins
create table if not exists public.feedbacks (
  id            uuid primary key default gen_random_uuid(),
  file_id       uuid not null references public.files(id) on delete cascade,
  author_id     uuid not null references public.user_profiles(id),
  feedback_type varchar not null
                check (feedback_type in ('general', 'inline')),
  content       text not null check (char_length(content) <= 2000),
  line_ref      varchar,
  resolved      boolean default false,
  resolved_by   uuid references public.user_profiles(id),
  resolved_at   timestamptz,
  is_hidden     boolean default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index idx_feedbacks_file on public.feedbacks (file_id);

-- Auto-update updated_at
create trigger update_feedbacks_updated_at
  before update on public.feedbacks
  for each row execute function public.update_updated_at_column();

-- RLS
alter table public.feedbacks enable row level security;

create policy "anyone_can_read_visible_feedback"
  on public.feedbacks for select
  using (is_hidden = false);

create policy "auth_users_can_insert_feedback"
  on public.feedbacks for insert
  with check (
    auth.uid() is not null
    and exists (
      select 1 from user_profiles
      where id = auth.uid() and role in ('admin', 'supervisor')
    )
  );

create policy "authors_can_update_own_feedback"
  on public.feedbacks for update
  using (author_id = auth.uid());

create policy "admin_full_access_feedbacks"
  on public.feedbacks for all
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );
