
-- Fix: ensure is_admin() is security definer so RLS policies can use it
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Fix: audit_logs insert policy allows all roles (including anon for public events).
-- The "with check (true)" allows any insert, which is intentional because
-- the service role client is used for writes and RLS is bypassed anyway.
-- For the anon key path, we still allow inserts for page.visit events.
