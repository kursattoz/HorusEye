# PRD-007 — System Monitor Dashboard
**Version:** 1.0
**Owner:** HorusEye Team
**Dependencies:** PRD-000, PRD-001, PRD-006
**Blocks:** —
**Status:** ACTIVE

---

<!-- INTERFACE_DEPS
AuthUser: @1.0
LogEvent: @1.0
HealthStatus: @1.0
-->

## ⚠️ LLM INSTRUCTION
This page is accessible to **Admin role only**. Any access by Supervisor/Assistant must return 403 and redirect to `/dashboard`.
`HealthStatus` interface is defined in PRD-000 Section 3.5 — do not redefine here.
Camera module card: always render as placeholder. If `NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false`, display "Not yet active" badge — never remove the card.
All data shown here comes from `audit_logs` and `error_logs` tables (PRD-006). Do not create new tables.
Interface dependencies are declared in the INTERFACE_DEPS block above. If PRD-000 version changes, update this block or `validate:prd` will fail.

---

## 1. Purpose

A single-screen operational view for Admins and developers. Answer in one page: which service is unhealthy, which is slow, what errors happened recently, who accessed what. No digging through logs manually.

Route: `/dev/monitor`
Access: Admin only (RBAC middleware guard — PRD-001)

---

## 2. Screen Sections

### 2.1 Service Health Cards (top row)

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Supabase DB │ │  Storage     │ │  Auth        │ │  Vercel/App  │
│  ● Healthy   │ │  ● Healthy   │ │  ● Healthy   │ │  ● Healthy   │
│  12ms        │ │  8ms         │ │  45ms        │ │  23ms        │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐
│  Sentry      │ │  Camera Mod. │
│  ● Connected │ │  ○ Not yet   │
│              │ │  active      │
└──────────────┘ └──────────────┘
```

**Status colors** (uses shadcn Badge + Lucide icons):
- `healthy`  → green dot (`CheckCircle2`)
- `degraded` → yellow dot (`AlertTriangle`)
- `down`     → red dot (`XCircle`)
- `unknown` / `disabled` → gray dot (`MinusCircle`)

**Auto-refresh:** Every 30 seconds (via `setInterval` + invalidate React Query cache).
**Manual refresh:** Button in top-right corner.

---

### 2.2 Environment Info Banner

```
Environment: STAGING  |  App: v0.3.1 (abc1234)  |  Node: 20.x  |  Next.js: 14.x
Supabase Project: horuseye-staging  |  Deployed: 2025-03-17 14:32 UTC
```

All values come from `process.env` and `/api/health/detailed`. No hardcoding.

---

### 2.3 Recent Errors (from `error_logs`)

- Last 50 errors, auto-updates every 30s
- Columns: `timestamp`, `severity`, `message`, `user`, `request_path`
- Severity filter: `error` | `critical`
- Time range filter: last 1h / 6h / 24h / 7d
- Click row → modal: full stack trace + metadata JSON + Sentry link (if `sentry_event_id` present)
- Empty state: "No errors in selected time range" (this is a good sign)

---

### 2.4 Live Activity Feed (from `audit_logs`)

- Last 100 events, refreshes every 10 seconds
- Columns: `timestamp`, `user`, `event_type`, `action`
- Filters: user search, event_type multi-select
- Same user's consecutive events are color-grouped (visual grouping, not collapsing)
- Click row → inline expansion: full metadata JSON

---

### 2.5 Statistics Cards (last 24 hours)

```
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  Page Visits │ │ Unique Users │ │ File Views   │ │ Failed Logins│ │ Total Errors │
│     47       │ │      8       │ │     23       │ │      2       │ │      1       │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

All stats are computed via Supabase queries on `audit_logs` and `error_logs`.
Queries run at page load + refresh every 5 minutes.

---

### 2.6 Database Row Counts

```
Tables (live counts):
├── user_profiles  :  12
├── files          :  34  (8 public, 26 private)
├── feedbacks      :  67
├── audit_logs     :  4,521
└── error_logs     :  3
```

Fetched from `/api/health/detailed` (admin-only endpoint).

---

## 3. Health Check Endpoints

```typescript
// app/api/health/route.ts — PUBLIC (for uptime monitors, Vercel deployment checks)
GET /api/health
// Response: { status: 'ok' | 'degraded', timestamp: string }

// app/api/health/detailed/route.ts — ADMIN ONLY
GET /api/health/detailed
// Response: {
//   services: HealthStatus[],   // PRD-000 Section 3.5
//   db_counts: Record<string, number>,
//   environment: { name, version, commit, node, nextjs, deployed_at }
// }
```

**Health check implementations:**
| Service | Check Method | Healthy Threshold |
|---------|-------------|-------------------|
| Supabase DB | `SELECT 1` query | < 100ms |
| Supabase Storage | Read a known small test object | < 500ms |
| Supabase Auth | Ping auth endpoint | < 300ms |
| Vercel / App | Self-ping `/api/health` | < 200ms |
| Sentry | SDK `isInitialized()` check | initialized = healthy |
| Camera Module | `NEXT_PUBLIC_CAMERA_MODULE_ENABLED` env | disabled = 'unknown' |

---

## 4. Supabase MCP Integration

All queries on this page run through MCP where possible.
MCP project name: **`horuseye-staging`**

- Stat queries (`COUNT`, `GROUP BY`) → MCP `execute_sql`
- Health checks → direct Supabase client (latency measurement requires direct call)
- DB counts → MCP `list_tables` + `execute_sql`

---

## 5. UI Components (all shadcn)

| Element | Component |
|---------|-----------|
| Health card | `Card` + `Badge` + Lucide icons |
| Stats | `Card` with large number display |
| Error table | `Table`, `TableRow`, `TableCell` |
| Activity feed | `Table` with row color grouping |
| Modal (error detail) | `Dialog` |
| Filters | `Select`, `Input`, `DatePickerWithRange` |
| Refresh button | `Button` + `RefreshCw` (Lucide) |
| Environment banner | `Alert` (info variant) |

---

## 6. Test Scenarios

- [ ] Admin navigates to `/dev/monitor` → all sections render without error
- [ ] Supervisor navigates to `/dev/monitor` → 403, redirect to `/dashboard`
- [ ] Guest navigates to `/dev/monitor` → redirect to `/login`
- [ ] An error is triggered → appears in "Recent Errors" within 30 seconds (auto-refresh)
- [ ] Camera module card renders as "Not yet active" when env flag is `false`
- [ ] `/api/health` → returns `{ status: 'ok' }` with no auth required
- [ ] `/api/health/detailed` without admin session → 403
- [ ] DB health card shows latency in ms
- [ ] Error row clicked → modal opens with full stack trace
- [ ] Activity feed filters by event_type → only matching rows shown
