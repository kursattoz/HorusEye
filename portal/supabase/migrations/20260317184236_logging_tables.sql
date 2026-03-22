
-- audit_logs: append-only log of all user actions
create table if not exists public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  event_type    varchar not null,
  severity      varchar not null default 'info'
                check (severity in ('debug', 'info', 'warn', 'error', 'critical')),
  user_id       uuid references public.user_profiles(id),
  session_id    varchar,
  resource_type varchar,
  resource_id   uuid,
  action        varchar not null,
  metadata      jsonb default '{}',
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz default now()
);

create index idx_audit_logs_created    on public.audit_logs (created_at desc);
create index idx_audit_logs_event_type on public.audit_logs (event_type);
create index idx_audit_logs_user       on public.audit_logs (user_id);

-- RLS
alter table public.audit_logs enable row level security;

create policy "admin_only_audit"
  on public.audit_logs for select
  using (is_admin());

create policy "audit_logs_insert"
  on public.audit_logs for insert
  with check (true);

-- error_logs: captures error/critical severity events
create table if not exists public.error_logs (
  id              uuid primary key default gen_random_uuid(),
  severity        varchar not null
                  check (severity in ('error', 'critical')),
  error_code      varchar,
  error_message   text not null,
  stack_trace     text,
  user_id         uuid references public.user_profiles(id),
  request_path    text,
  request_method  varchar,
  metadata        jsonb default '{}',
  sentry_event_id varchar,
  created_at      timestamptz default now()
);

create index idx_error_logs_created  on public.error_logs (created_at desc);
create index idx_error_logs_severity on public.error_logs (severity);

-- RLS
alter table public.error_logs enable row level security;

create policy "admin_only_errors"
  on public.error_logs for select
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'admin'
    )
  );

create policy "error_logs_insert"
  on public.error_logs for insert
  with check (true);
