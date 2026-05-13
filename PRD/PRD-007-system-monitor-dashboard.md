# PRD-007 — System Monitor Dashboard
**Versiyon:** 1.0
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000, PRD-001, PRD-006
**Bloke ettiği:** —
**Durum:** ACTIVE

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
LogEvent: @1.3
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
Environment: STAGING  |  App: v0.3.1 (abc1234)  |  Node: 20.x  |  Next.js: 15.x
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

**Sentry link:** `sentry_event_id` mevcutsa: `https://{SENTRY_ORG}.sentry.io/issues/?query={sentry_event_id}` formatında link gösterilir. `sentry_event_id` null ise link gösterilmez.

**Boş durum:** Yeni instance'da hiç log yoksa: 'Seçilen zaman aralığında hata bulunamadı — bu iyi bir işaret!' mesajı gösterilir. Activity feed boşsa: 'Henüz aktivite yok'.

---

### 2.4 Live Activity Feed (from `audit_logs`)

- Last 100 events, refreshes every 10 seconds
- Columns: `timestamp`, `user`, `event_type`, `action`
- Filters: user search, event_type multi-select
- Same user's consecutive events are color-grouped (visual grouping, not collapsing)
- Click row → inline expansion: full metadata JSON

**Renk gruplandırma:** Aynı `user_id`'ye ait ardışık event'ler aynı arka plan rengiyle gösterilir. Renk paleti: alternating `bg-muted/50` ve `bg-transparent`. Maksimum grup boyutu: 10 event (sonraki yeni grup başlatır). Farklı kullanıcı araya girerse grup biter.

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

// app/api/health/detailed/route.ts — ADMIN ONLY (implementasyon mevcut)
GET /api/health/detailed
// Response: {
//   status: 'healthy' | 'degraded',
//   services: HealthStatus[],        // 5 servis: supabase_db, storage, auth, app, sentry
//   db_counts: Record<string, number>, // 7 tablo: user_profiles, files, feedbacks, audit_logs, error_logs, report_deliverables, checklist_items
//   environment: { env, node_version, app_url, server_time },
//   stats_24h: { total_events, unique_users, error_count },
//   checked_at: string
// }
```

**Health check implementations (gerçek):**
| Service | Check Method | Status Kuralı |
|---------|-------------|---------------|
| `supabase_db` | `user_profiles` tablosunda `SELECT count` | Response varsa healthy, yoksa down |
| `supabase_storage` | `listBuckets()` çağrısı | Response varsa healthy, yoksa down |
| `supabase_auth` | `auth.admin.listUsers({ perPage: 1 })` | Response varsa healthy, yoksa down |
| `app` | Her zaman healthy, Node version raporlar | Daima healthy |
| `sentry` | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` env var kontrolü | Configured = healthy, yoksa unknown |
| Camera Module | `CAMERA_MODULE_ENABLED=true` ise `AI_SERVICE_URL/health` endpoint'ini çağır (GET, 5s timeout) | Response 200 + `status: healthy` = healthy. `status: degraded` = degraded. Timeout veya connection error = down. `CAMERA_MODULE_ENABLED=false` ise kart "Henüz aktif değil" placeholder gösterir |

**Camera Module aktifken ek bilgiler:**
AI servis health response'undan (PRD-013 §18.7.5) şu veriler Camera Module kartında gösterilir:
- Aktif kamera sayısı (healthy/degraded/offline)
- Pipeline FPS (actual vs target)
- Buffer queue depth
- Memory kullanımı (%)

**Latency Threshold Değerleri:**

| Servis | Healthy (yeşil) | Degraded (sarı) | Down (kırmızı) |
|--------|-----------------|------------------|-----------------|
| `supabase_db` | < 100ms | 100-500ms | > 500ms veya timeout |
| `supabase_storage` | < 200ms | 200-1000ms | > 1000ms veya timeout |
| `supabase_auth` | < 200ms | 200-1000ms | > 1000ms veya timeout |
| `ai_service` | < 2s | 2-5s | > 5s veya timeout |

**Status hesaplama:** Yanıt süresi threshold'u aşarsa degraded, timeout (10s) veya connection error ise down. Sentry ve Camera Module için latency ölçülmez (sadece bağlantı durumu).

**Latency ölçüm metodolojisi:** Her servis check'i `Date.now()` ile başlar, response alındığında bitiş zamanı kaydedilir. Ölçülen süre: request gönderimi + ağ latency + servis işleme + response parse. Network overhead dahildir (gerçek kullanıcı deneyimini yansıtır).

**Realtime güncelleme:** Tüm health check'ler 30s interval ile poll edilir (`setInterval` + React Query invalidation). Supabase Realtime kullanılmaz (health check'ler server-side endpoint'tir). Manuel refresh butonu anında çağırır.

**Manuel refresh:** Sağ üst köşedeki 'Yenile' butonu tıklandığında tüm health check'ler + loglar + stats anında yeniden çekilir (React Query `invalidateQueries`).

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

**Kullanılan ApiErrorCode'lar:** `AUTH_FORBIDDEN` (non-admin erişim), `INTERNAL_ERROR` (health check hatası)
