
-- OTP verification tokens for public feedback submissions
create table if not exists public.feedback_otps (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  code_hash   text not null,              -- SHA-256 of the 6-digit code
  verified_at timestamptz,               -- set when user correctly enters the code
  expires_at  timestamptz not null default (now() + interval '10 minutes'),
  created_at  timestamptz not null default now()
);

-- No RLS needed — only accessed via service role in API routes
-- Clean up expired/old rows periodically (or via a cron if needed)
create index if not exists feedback_otps_email_idx on public.feedback_otps (email);
create index if not exists feedback_otps_expires_idx on public.feedback_otps (expires_at);
