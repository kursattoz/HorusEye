-- PRD-006: audit_logs + error_logs tables

-- User activity log (append-only — no UPDATE or DELETE)
CREATE TABLE public.audit_logs (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR(50)  NOT NULL,                          -- PRD-000 LogEventType
  severity      VARCHAR(10)  NOT NULL DEFAULT 'info'
                             CHECK (severity IN ('debug','info','warn','error','critical')),
  user_id       UUID         REFERENCES public.user_profiles(id),
  session_id    VARCHAR(100),
  resource_type VARCHAR(50),                                    -- 'file', 'feedback', 'user', 'page'
  resource_id   UUID,
  action        VARCHAR(100) NOT NULL,
  metadata      JSONB        DEFAULT '{}'::jsonb,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- System errors (separate table for fast severity-filtered queries)
CREATE TABLE public.error_logs (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  severity        VARCHAR(10)  NOT NULL
                               CHECK (severity IN ('error','critical')),
  error_code      VARCHAR(50),
  error_message   TEXT         NOT NULL,
  stack_trace     TEXT,
  user_id         UUID         REFERENCES public.user_profiles(id),
  request_path    TEXT,
  request_method  VARCHAR(10),
  metadata        JSONB        DEFAULT '{}'::jsonb,
  sentry_event_id VARCHAR(100),                                 -- cross-reference to Sentry
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

-- Indexes (required for /dev/monitor performance — PRD-007)
CREATE INDEX idx_audit_logs_user       ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX idx_audit_logs_created    ON public.audit_logs(created_at DESC);
CREATE INDEX idx_error_logs_created    ON public.error_logs(created_at DESC);
CREATE INDEX idx_error_logs_severity   ON public.error_logs(severity);

-- RLS: only admin can read; server-side service_role key bypasses RLS for writes
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_only_audit" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_only_errors" ON public.error_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'admin')
  );
