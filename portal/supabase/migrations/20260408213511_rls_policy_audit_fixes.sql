-- Fix 1: Enable RLS on feedback_otps (was completely unprotected)
alter table public.feedback_otps enable row level security;

-- OTPs are only used via service role (API routes) — no direct client access needed
create policy "Service role only on feedback_otps"
  on public.feedback_otps
  for all
  to service_role
  using (true)
  with check (true);

-- Fix 2: Add policies for file_access_requests (RLS enabled but 0 policies = total lockout)
-- Admins can read all requests; authenticated users can insert and read their own
create policy "Admins can read all file access requests"
  on public.file_access_requests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "Authenticated users can insert file access requests"
  on public.file_access_requests
  for insert
  to authenticated
  with check (true);

create policy "Admins can update file access requests"
  on public.file_access_requests
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );
