
create table if not exists public.file_access_requests (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  file_id    uuid not null references public.files(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists file_access_requests_email_created_at_idx
  on public.file_access_requests (email, created_at);

alter table public.file_access_requests enable row level security;
-- No public policies — access only via service role
