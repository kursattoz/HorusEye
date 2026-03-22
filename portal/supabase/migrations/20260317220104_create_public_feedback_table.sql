
-- public_feedback: feedback from unauthenticated (public) users via OTP verification
create table if not exists public.public_feedback (
  id          uuid primary key default gen_random_uuid(),
  file_id     uuid not null references public.files(id) on delete cascade,
  author_name text not null check (char_length(author_name) >= 2 and char_length(author_name) <= 100),
  content     text not null check (char_length(content) >= 10 and char_length(content) <= 1000),
  ip_hash     text,
  created_at  timestamptz default now()
);

-- RLS
alter table public.public_feedback enable row level security;

create policy "public_feedback_insert"
  on public.public_feedback for insert
  with check (true);

create policy "public_feedback_select"
  on public.public_feedback for select
  using (auth.role() = 'authenticated');
