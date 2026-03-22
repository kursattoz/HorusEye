
-- files: metadata for uploaded documents/images
create table if not exists public.files (
  id              uuid primary key default gen_random_uuid(),
  name            varchar not null,
  display_name    varchar not null,
  file_type       varchar not null
                  check (file_type in ('pdf', 'pptx', 'docx', 'image', 'video', 'other')),
  storage_path    text not null,
  public_url      text,
  file_size_bytes bigint not null,
  is_public       boolean default false,
  uploaded_by     uuid not null references public.user_profiles(id),
  team_id         varchar default 'horuseye-team',
  metadata        jsonb default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  deleted_at      timestamptz
);

create index idx_files_is_public on public.files (is_public) where deleted_at is null;
create index idx_files_team      on public.files (team_id);
create index idx_files_slug      on public.files ((metadata ->> 'slug'));

-- Auto-update updated_at
create trigger update_files_updated_at
  before update on public.files
  for each row execute function public.update_updated_at_column();

-- RLS
alter table public.files enable row level security;

create policy "admin_full_access_files"
  on public.files for all
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "public_files_readable_by_all"
  on public.files for select
  using (is_public = true and deleted_at is null);
