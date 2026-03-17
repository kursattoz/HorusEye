# PRD-006 — Error Management & Application Logging
**Version:** 1.0
**Owner:** HorusEye Team
**Dependencies:** PRD-000, PRD-001
**Blocks:** PRD-007
**Status:** ACTIVE

---

<!-- INTERFACE_DEPS
AuthUser: @1.0
LogEvent: @1.0
-->

## ⚠️ LLM INSTRUCTION
`LogEvent` interface is defined in PRD-000 Section 3.3 — do not redefine here.
`LogEventType` and `LogSeverity` enums come from PRD-000 — cannot be changed in this PRD.
This PRD manages two separate systems: **Sentry** (critical runtime errors) + **Supabase** (application audit logs).
If a new `LogEventType` is needed, update PRD-000 first and get approval.
Interface dependencies are declared in the INTERFACE_DEPS block above. If PRD-000 version changes, update this block or `validate:prd` will fail.

---

## 1. Purpose

In a violation-detection system, logging is non-negotiable. Every user action, every system error, every access attempt is recorded. Developer experience is also a first-class concern: full debug output in local/staging, clean UI in production.

---

## 2. Two-Layer Log Architecture

```
Event occurs
    ├── Critical error (severity: error | critical)
    │   ├── → Sentry      (instant alert, stack trace, user context)
    │   └── → error_logs  (Supabase table, cross-referenced via sentry_event_id)
    │
    └── Normal event (severity: debug | info | warn)
        └── → audit_logs  (Supabase table, append-only)
```

**Why two tables?** `error_logs` is queried for monitoring/alerting with severity filters. `audit_logs` is queried for user activity and compliance. Separate tables = separate indexes = faster queries on the monitor screen (PRD-007).

---

## 3. Database

```sql
-- User activity log (every action, append-only, no UPDATE or DELETE)
CREATE TABLE public.audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    VARCHAR(50) NOT NULL,                                  -- PRD-000 LogEventType
  severity      VARCHAR(10) NOT NULL DEFAULT 'info'
                CHECK (severity IN ('debug','info','warn','error','critical')),
  user_id       UUID        REFERENCES public.user_profiles(id),
  session_id    VARCHAR(100),
  resource_type VARCHAR(50),                                           -- 'file', 'feedback', 'user', 'page', etc.
  resource_id   UUID,
  action        VARCHAR(100) NOT NULL,
  metadata      JSONB        DEFAULT '{}'::jsonb,
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

-- System errors (separate table for faster severity-filtered queries)
CREATE TABLE public.error_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  severity        VARCHAR(10) NOT NULL
                  CHECK (severity IN ('error','critical')),
  error_code      VARCHAR(50),
  error_message   TEXT        NOT NULL,
  stack_trace     TEXT,
  user_id         UUID        REFERENCES public.user_profiles(id),
  request_path    TEXT,
  request_method  VARCHAR(10),
  metadata        JSONB       DEFAULT '{}'::jsonb,
  sentry_event_id VARCHAR(100),                                        -- Cross-reference to Sentry
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (required for monitor screen performance — PRD-007)
CREATE INDEX idx_audit_logs_user       ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX idx_audit_logs_created    ON public.audit_logs(created_at DESC);
CREATE INDEX idx_error_logs_created    ON public.error_logs(created_at DESC);
CREATE INDEX idx_error_logs_severity   ON public.error_logs(severity);

-- RLS: only admin can read
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

-- Server-side writes via service_role key bypass RLS (intentional)
```

---

## 4. Logger Library

```typescript
// lib/logger/index.ts

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';

export interface LogPayload {
  event_type:    string;                      // PRD-000 LogEventType
  severity:      string;                      // PRD-000 LogSeverity
  user_id?:      string;
  session_id?:   string;
  resource_type?: string;
  resource_id?:  string;
  action:        string;
  metadata?:     Record<string, unknown>;
  ip_address?:   string;
  user_agent?:   string;
}

export async function log(payload: LogPayload): Promise<void> {
  const env = process.env.NEXT_PUBLIC_ENV;

  // Local: also write to console with color (developer experience)
  if (env === 'local') {
    const color = payload.severity === 'error'    ? '\x1b[31m'
                : payload.severity === 'critical' ? '\x1b[35m'
                : payload.severity === 'warn'     ? '\x1b[33m'
                : '\x1b[36m';
    console.log(
      `${color}[${payload.severity.toUpperCase()}]\x1b[0m`,
      payload.event_type,
      payload.action,
      payload.metadata ?? ''
    );
  }

  // Critical errors → Sentry (synchronous capture, fire and forget write)
  if (payload.severity === 'error' || payload.severity === 'critical') {
    Sentry.captureEvent({
      message: payload.action,
      level:   payload.severity as Sentry.SeverityLevel,
      extra:   payload.metadata,
      user:    payload.user_id ? { id: payload.user_id } : undefined,
    });
  }

  // All events → Supabase (fire and forget — never block the application)
  const table = (payload.severity === 'error' || payload.severity === 'critical')
    ? 'error_logs'
    : 'audit_logs';

  const supabase = createClient({ serviceRole: true }); // bypass RLS for server-side writes
  supabase.from(table).insert(payload).then(({ error }) => {
    if (error && env !== 'production') {
      console.error('[Logger] DB insert failed:', error.message);
    }
  });
}

// Convenience wrappers
export const logDebug = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'debug' });
export const logInfo  = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'info' });
export const logWarn  = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'warn' });
export const logError = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'error' });
export const logCritical = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'critical' });
```

---

## 5. Frontend Error Boundary

```typescript
// components/error/ErrorBoundary.tsx
// Wraps every route segment — never let an unhandled error crash the whole app

// Display rules:
// local / staging  → full error message + stack trace + "Copy to clipboard" button + Sentry event ID
// production       → "An error occurred. Our team has been notified." + Sentry event ID only
```

---

## 6. Global Error Display Standards

All PRDs follow this standard. No component should define its own error display pattern.

```typescript
// ✅ Success
toast.success("Operation completed successfully.");

// ⚠️ Warning
toast.warning("Warning: ...");

// ❌ Error — production
toast.error("Something went wrong. Please try again.");

// ❌ Error — local / staging (full detail for debugging)
toast.error(`[${errorCode}] ${errorMessage}`, {
  description: stackTrace,
  duration:    10_000,
  action: { label: "Copy", onClick: () => navigator.clipboard.writeText(fullErrorJson) }
});
```

**Environment check pattern (used everywhere):**
```typescript
const isDev = process.env.NEXT_PUBLIC_ENV !== 'production';
```

---

## 7. Automatic Page Visit Logging

Every protected route transition is auto-logged in middleware (see PRD-001).
For public pages, a client-side hook handles it:

```typescript
// hooks/usePageTracking.ts
// Fires on every route change
// With user session → logs with user_id
// Without session   → logs with anonymous session_id (stored in sessionStorage)
```

---

## 8. Supabase MCP Integration

All direct Supabase read/write operations for logs must use MCP.
MCP project name: **`horuseye-staging`**

- `audit_logs` writes: via `service_role` key on server-side (RLS bypassed)
- `error_logs` writes: via `service_role` key on server-side
- `audit_logs` reads (admin): via standard client with RLS policy
- Manual inspection/debugging: via MCP `execute_sql` on `horuseye-staging`

---

## 9. Test Scenarios

- [ ] Failed login → row written to `audit_logs` with `event_type: 'auth.failed'`
- [ ] Unhandled 500 error → row in `error_logs` + Sentry event captured
- [ ] Local environment error → colored console output + detailed toast
- [ ] Production environment error → user-friendly message only, no stack trace exposed
- [ ] Guest downloads file → `audit_logs` row with `user_id = null`, `session_id` set
- [ ] Admin views `/dev/monitor` → `audit_logs` visible, `error_logs` visible
- [ ] `service_role` insert succeeds → RLS does not block server-side log writes
