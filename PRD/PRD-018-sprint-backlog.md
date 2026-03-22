# PRD-018 — Sprint & Backlog Yönetim Sistemi
**Versiyon:** 2.0
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000, PRD-001, PRD-006, PRD-014, PRD-015, PRD-016
**Blocks:** —
**Durum:** AKTIF

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
LogEvent: @1.2
Sprint: @1.0
BacklogItem: @2.0
BacklogActivity: @1.0
BacklogReview: @1.0
Notification: @1.0
-->

## ⚠️ LLM TALİMATI
Bu modül projenin geliştirme sürecini yönetir. Tüm backlog item'ları PRD referanslıdır ve `BL-{seq_id}` formatında human-readable ID'ye sahiptir. Status değişikliklerinde `backlog_activity` tablosuna kayıt düşülür. Review statüsündeki item'ların status değişikliği sadece Review Modal üzerinden yapılır. Sprint tamamlandığında bitmemiş item'lar otomatik backlog'a döner. `reviewer_id` atanmış item'lar review onayı olmadan `done` yapılamaz (422 hatası). Dependency enforcement aktiftir — blocker `done` değilse dependent item ilerleyemez (409 hatası).

---

## 1. Amaç

PRD'lerden türetilen geliştirme görevlerini sprint bazlı takip etmek. Ekip üyelerine dev_role bazlı otomatik atama, dependency tracking, blocker enforcement, code review workflow, burndown/velocity analizi, kişi performans takibi ve proje geneli takvim görünümü sağlamak. Reports (PRD-015) ile entegre çalışarak deliverable'ların otomatik tamamlanmasını desteklemek.

---

## 2. Veritabanı Şeması

### 2.1 `user_profiles` Ek Alanları

```sql
-- Migration: 20260322153227_create_sprint_backlog_system.sql
alter table public.user_profiles
  add column if not exists dev_role text
  check (dev_role in ('product_owner', 'portal_frontend', 'portal_backend', 'ai_backend', 'fullstack', 'project_coordinator'));
```

| dev_role | Açıklama |
|----------|----------|
| `product_owner` | Sprint koordinasyon, backlog önceliklendirme, PR review, infra |
| `portal_frontend` | Dashboard, Settings, Files UI/UX, responsive, E2E testler |
| `portal_backend` | API routes, Supabase, RLS, migrations, unit testler |
| `ai_backend` | Python/FastAPI, kamera pipeline, model entegrasyonu |
| `fullstack` | Camera UI, WebRTC, Portal↔AI, genel frontend görevleri |
| `project_coordinator` | Raporlama, materyal toplama, ekip kontrolü, front test, data eğitimi |

### 2.2 `sprints` Tablosu

```sql
-- Migration: 20260322153227_create_sprint_backlog_system.sql
create table if not exists public.sprints (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  goal        text,
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'planning'
              check (status in ('planning', 'active', 'completed')),
  created_by  uuid references public.user_profiles(id),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
```

### 2.3 `backlog_items` Tablosu

```sql
-- Migrations: 20260322153227 + 20260322155602 + 20260322165700 + 20260322181200 + 20260322183530
create table if not exists public.backlog_items (
  id              uuid primary key default gen_random_uuid(),
  seq_id          serial,                                          -- Human-readable: BL-{seq_id}
  sprint_id       uuid references public.sprints(id) on delete set null,
  title           text not null,
  description     text,
  prd_id          text,                                            -- PRD referansı (ör: 'PRD-013')
  prd_section     text,                                            -- PRD bölümü (ör: '3.2 WebSocket')
  epic            text,                                            -- Gruplandırma etiketi (ör: 'Camera MVP')
  dev_role        text,                                            -- Hedef geliştirici rolü
  assigned_to     uuid references public.user_profiles(id),        -- Atanan kişi
  reviewer_id     uuid references public.user_profiles(id),        -- Code review yapacak kişi
  deliverable_id  uuid references public.report_deliverables(id) on delete set null,  -- PRD-015 bağlantısı
  file_id         uuid references public.files(id) on delete set null,                -- İlişkili dosya
  blocked_by      uuid references public.backlog_items(id) on delete set null,        -- Bağımlılık
  status          text not null default 'backlog'
                  check (status in ('backlog', 'todo', 'in_progress', 'review', 'done')),
  priority        text not null default 'medium'
                  check (priority in ('critical', 'high', 'medium', 'low')),
  estimated_hours integer,
  actual_hours    numeric(5,2) default 0,
  sort_order      integer default 0,
  created_by      uuid references public.user_profiles(id),
  started_at      timestamptz,         -- İlk kez in_progress'e geçtiğinde otomatik
  completed_at    timestamptz,         -- done olunca otomatik
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
```

### 2.4 `backlog_attachments` Tablosu

```sql
-- Migration: 20260322155602_create_backlog_attachments.sql
create table if not exists public.backlog_attachments (
  id              uuid primary key default gen_random_uuid(),
  backlog_item_id uuid not null references public.backlog_items(id) on delete cascade,
  file_name       text not null,
  file_url        text not null,
  file_type       text not null,
  file_size_bytes integer,
  uploaded_by     uuid references public.user_profiles(id),
  created_at      timestamptz default now()
);
```

**Resim sıkıştırma:** Upload sırasında Sharp ile max 1200px, %80 quality. Video ve PDF sıkıştırılmaz.

### 2.5 `backlog_activity` Tablosu

```sql
-- Migration: 20260322181200_backlog_enhancements_v2.sql
create table if not exists public.backlog_activity (
  id              uuid primary key default gen_random_uuid(),
  backlog_item_id uuid not null references public.backlog_items(id) on delete cascade,
  user_id         uuid not null references public.user_profiles(id),
  from_status     text,
  to_status       text,
  action          text not null,    -- 'status_change' | 'hours_logged' | 'reassigned' | 'review_requested' | 'review_approved' | 'review_changes_requested'
  hours_logged    numeric(5,2),
  created_at      timestamptz default now()
);
```

### 2.6 `backlog_reviews` Tablosu

```sql
-- Migration: 20260322190253_create_backlog_reviews.sql
create table if not exists public.backlog_reviews (
  id              uuid primary key default gen_random_uuid(),
  backlog_item_id uuid not null references public.backlog_items(id) on delete cascade,
  reviewer_id     uuid not null references public.user_profiles(id),
  status          text not null default 'pending'
                  check (status in ('pending', 'approved', 'changes_requested')),
  comment         text,
  has_screenshot  boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
```

---

## 3. RLS Politikaları

Tüm tablolar (`sprints`, `backlog_items`, `backlog_attachments`, `backlog_activity`, `backlog_reviews`) için:

```sql
-- SELECT, INSERT, UPDATE, DELETE: to authenticated using (true)
```

> **Not:** 5 kişilik ekipte kısıtlayıcı RLS gereksiz karmaşıklık yaratır. Tüm üyeler tüm veriyi görebilir/düzenleyebilir.

---

## 4. API Route'ları

### 4.1 Sprint CRUD

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/sprints` | Sprint listesi (item count, done count, estimated hours) |
| POST | `/api/sprints` | Sprint oluştur |
| GET | `/api/sprints/[id]` | Sprint detay + tüm item'lar (assignee, attachments, blocker, reviews) |
| PUT | `/api/sprints/[id]` | Sprint güncelle. `completed` → bitmemiş item'lar backlog'a |
| DELETE | `/api/sprints/[id]` | Sprint sil (item'lar backlog'a) |

### 4.2 Sprint Analytics

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/sprints/[id]/analytics` | Burndown, velocity, kişi performansı, epic breakdown, review stats, priority counts |
| GET | `/api/sprints/analytics` | Proje geneli: cross-sprint comparison, timeline events, PRD coverage, completion projection |

### 4.3 Backlog CRUD

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/backlog` | Backlog listesi (filtreleme: sprint_id, status, prd_id, unassigned) |
| POST | `/api/backlog` | Item oluştur. dev_role varsa otomatik assign |
| PUT | `/api/backlog/[id]` | Item güncelle. Activity + log kaydı. Blocker/review enforcement |
| DELETE | `/api/backlog/[id]` | Item sil |

### 4.4 Backlog Attachments

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/backlog/[id]/attachments` | Attachment listesi |
| POST | `/api/backlog/[id]/attachments` | Dosya yükle (resimler Sharp ile compress) |
| DELETE | `/api/backlog/[id]/attachments?attachment_id=` | Attachment sil |

### 4.5 Reviews

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/backlog/[id]/reviews` | Review geçmişi |
| POST | `/api/backlog/[id]/reviews` | Review yaz. approved → item done. changes_requested → item in_progress |

### 4.6 Request Unblock

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/api/backlog/[id]/request-unblock` | Blocker'ın assignee'sine notification + email gönder |

### 4.7 Dev Roles

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/settings/dev-roles` | Ekip üyeleri + dev_role'leri |
| PUT | `/api/settings/dev-roles` | Rol ataması (admin only). Unstarted item'lar yeni role holder'a transfer |

---

## 5. Otomatik Davranışlar

### 5.1 Status Değişikliği Kuralları

| Tetikleyici | Davranış |
|-------------|----------|
| `dev_role` set + `assigned_to` boş → POST | O role sahip kişi otomatik assign |
| Status → `in_progress` (ilk kez) | `started_at` otomatik set |
| Status → `done` | `completed_at` otomatik set |
| Status → `review` | Reviewer'a in-app notification + email |
| Her status değişikliği | `backlog_activity` kaydı + `audit_logs` kaydı |
| `actual_hours` güncelleme | `backlog_activity` kaydı (hours_logged) |
| Sprint → `completed` | `status != 'done'` olan item'lar `sprint_id = null` |
| Dev role değişikliği (settings) | `backlog`/`todo` statüsündeki item'lar yeni kişiye transfer |

### 5.2 Blocker Enforcement (409)

- Status `in_progress`, `review`, veya `done`'a geçişte blocker kontrolü
- Blocker `done` değilse → **409 Conflict** + blocker detayları (BL-{seq_id}, title, assignee, status, priority, PRD)
- Blocker başkasına aitse → otomatik notification gönderir
- UI'da modal açılır: blocker kartı + **Request Unblock** butonu

### 5.3 Review Enforcement (422)

- `reviewer_id` atanmış item'lar direkt `done`'a çekilemez → **422 Unprocessable**
- Zorunlu akış: `in_progress` → `review` → reviewer approve → otomatik `done`
- `review` statüsündeki item'ın dropdown'dan status değişikliği → Review Modal'a yönlendirme

### 5.4 Review Akışı

| Adım | Aksiyon | Sistem Tepkisi |
|------|---------|----------------|
| 1 | Developer item'ı `review`'a çeker | Reviewer'a in-app notification + email |
| 2 | Reviewer Review Modal açar | Önceki review'lar listelenir + yeni review formu |
| 3a | Reviewer **Approve** basar | Item → `done`, developer'a notification + email, approval badge |
| 3b | Reviewer **Request Changes** basar + comment yazar | Item → `in_progress`, developer'a notification + email |
| 4 | Developer düzeltir, tekrar `review`'a çeker | Reviewer tekrar bildirim alır, review history'de önceki review görünür |

### 5.5 Deliverable Auto-Sync (PRD-015)

- Item `done` + `deliverable_id` set → deliverable'ın tüm backlog item'ları done mu kontrol
- Hepsi done → deliverable status `completed`
- Bazıları done → deliverable status `in_progress`

### 5.6 Unblock Request

- `POST /api/backlog/[id]/request-unblock`
- Blocker'ın assignee'sine: in-app notification + email (task bilgisi, kim bekliyor, sprint board linki)
- `audit_logs` + `backlog_activity`'de kayıt

---

## 6. UI Sayfaları

### 6.1 Sprint Board (`/sprints`)

**Bileşen:** `SprintBoard.tsx`

- Active / Planning / Completed grupları (collapsible)
- Sprint kartları: name, goal, date range, progress bar, item/done count, estimated hours
- Backlog section: sprint'e atanmamış item'lar + create dialog
- **New Sprint** butonu + **Project Analytics** butonu
- Create dialog: name, goal, start_date, end_date, epic

### 6.2 Sprint Detail — Kanban Board (`/sprints/[id]`)

**Bileşen:** `SprintDetail.tsx`

- **5 sütunlu Kanban**: Backlog, To Do, In Progress, Review, Done
- **Drag-and-drop**: Native HTML5 DnD, optimistic update, blocker/review enforcement
- **User filtresi**: Varsayılan logged-in user, glow animasyonu (primary renk), "My Reviews" seçeneği
- **Header butonları** (tooltip + outline variant):
  - 📊 Analytics & Performance → `/sprints/[id]/analytics`
  - 🔀 Dependency Graph → `/sprints/[id]/dependencies`
  - ⚙️ Sprint Settings → modal (name, goal, dates)
- Küçük ekranlarda: horizontal scroll, 280px fixed-width columns, snap-x
- Blocker Modal: 409 geldiğinde ekran ortasında, %40 overlay, blocker detay kartı + Request Unblock butonu

### 6.3 Backlog Item Kartı

**Bileşen:** `BacklogItemCard.tsx`

**Görünüm:**
- `BL-{seq_id}` human-readable ID
- Priority renk kodlu border-left (critical=red, high=orange, medium=blue, low=gray)
- Compact mode (kanban): truncated title, first name only
- PRD badge, epic badge, attachment count, estimated hours

**Hover aksiyonları:**
- Status dropdown (review statüsünde → Review Modal'a yönlendirme)
- ✏️ Edit → BacklogEditModal (tüm alanları düzenleme)
- 💬 Review → Review Modal (in_progress, review, done statülerinde)
- 📎 Attach → dosya yükleme (Sharp compress)
- 🗑️ Delete

**Expand (tıklama ile):**
- Blocker bilgisi + Request Unblock butonu
- Description + PRD section
- Review history (son 2 inline, fazlası modal'a link)
- Approval badge (done + approved → "Approved by X on Y")
- Attachment thumbnail'ları + image preview modal (zoom: Ctrl/Cmd+scroll, cursor-pozisyonlu)

**Blocked item'lar:**
- Kırmızı "Blocked" badge
- Status ilerletme engeli (409)
- Expand'da blocker detayı + Request Unblock

### 6.4 Backlog Edit Modal

**Bileşen:** `BacklogEditModal.tsx`

Düzenlenebilir alanlar: Title, Description, Status, Priority, Assigned to, Reviewer, PRD Reference, PRD Section, Epic, Dev Role, Estimated Hours, Actual Hours.

### 6.5 Review Modal

**Bileşen:** BacklogItemCard içinde Dialog

- **Review statüsünde:** Önceki review'lar listesi + yeni review formu (comment textarea + screenshot checkbox) + Approve (yeşil) / Request Changes (amber) butonları
- **Diğer statülerde:** Sadece review geçmişi (read-only) + Close butonu
- Review kaydı: `backlog_reviews` + `backlog_activity` + `audit_logs` + notification + email

### 6.6 Image Preview Modal

**Bileşen:** `ImagePreviewModal.tsx`

- Ctrl/Cmd + Scroll ile zoom (cursor-pozisyonlu, %50-%500)
- Double-click toggle (1x ↔ 2x)
- Drag to pan (zoom > 1 iken)
- Zoom butonları + yüzde göstergesi + reset

### 6.7 Dependency Graph (`/sprints/[id]/dependencies`)

**Bileşen:** `DependencyGraph.tsx`

- Zincir bazlı görselleştirme: kartlar ok (→) ile bağlı
- Done blocker = yeşil ok, pending = gri
- Status renk kodlu kartlar + priority ring
- `BL-{seq_id}` ID'ler görünür
- "Independent" grid + "Blocked by External" bölümü
- Read-only sayfa

### 6.8 Sprint Analytics (`/sprints/[id]/analytics`)

**Bileşen:** `SprintAnalytics.tsx`

- **Summary kartları:** Progress, Estimated hours, Actual hours, Capacity
- **Burndown chart** (ChartContainer + ChartTooltip): remaining vs ideal
  - Dinamik slogan: "Ahead of schedule" (yeşil) / "Behind schedule" (kırmızı) / "On track" (primary)
  - Detay: "X items ahead/behind ideal pace"
  - (i) info tooltip: chart nasıl okunur açıklaması
- **Status & Priority panel:** Status bar'lar (5 status renk kodlu) + Priority breakdown
- **Team Performance:** Kişi bazlı completion rate, avg cycle hours, estimated vs actual, progress bar
- **Epic Breakdown:** Bar chart (done vs total by epic)
- **Review Tracking:** Kişi bazlı total reviews, approved, changes requested, screenshot count, avg comment length, quality score (0-100), pending review count
- **Recent Activity:** Son 30 aktivite feed

**Quality Score hesaplama:**
- Avg comment uzunluğu > 20 karakter → +30 puan
- En az 1 screenshot → +30 puan
- En az 1 changes_requested → +20 puan
- Review sayısı × 5 (max +20 puan)

### 6.9 Project Analytics (`/sprints/analytics`)

**Bileşen:** `ProjectAnalytics.tsx`

- **Summary kartları:** Progress %, Hours (est/actual), Velocity (items/day), Projected End Date, Deadline + On track/At risk
- **Overall progress bar**
- **Monthly Calendar** (`MonthlyCalendar.tsx`): Google Calendar tarzı aylık grid
  - Sprint aralıkları renkli background (mavi/mor/amber/yeşil)
  - Sprint başlangıç günü: üstte sprint adı label
  - Sprint bitiş günü: "end" etiketi
  - Deliverable deadline'ları: renkli event çubukları
  - Bugün: primary daire
  - Ay navigasyonu + "Today" butonu + Türkçe ay adları
- **Sprint Comparison:** Bar chart (done vs total by sprint)
- **Team Workload by Sprint:** Tablo — kişi × sprint matrix (done/total + hours + review count)
- **PRD Coverage:** Grid kartları — her PRD'nin done/total + progress bar + yüzde badge

### 6.10 Dev Roles Ayarları (`/settings/dev-roles`)

**Bileşen:** `DevRolesTab.tsx`

- Admin-only sayfa
- Her üye: avatar, name, email, dev_role dropdown
- Rol referans tablosu
- Save → backlog item'lar otomatik transfer (backlog/todo statüsündekileri)

---

## 7. Sidebar Gruplandırma

```
Dashboard

PROJECT MANAGEMENT
  Sprints
  Reports
  Files
  Team
  Feedback

Monitor

COMING SOON
  ...
```

---

## 8. Notification & Email Tetikleyicileri

| Olay | Notification | Email | Log |
|------|-------------|-------|-----|
| Item → `review` | Reviewer'a | Reviewer'a | audit_logs + backlog_activity (review_requested) |
| Review approved | Assignee'ye | Assignee'ye | audit_logs + backlog_activity (review_approved) |
| Review changes_requested | Assignee'ye | Assignee'ye | audit_logs + backlog_activity (review_changes_requested) |
| Request Unblock | Blocker assignee'ye | Blocker assignee'ye | audit_logs + backlog_activity |
| Blocker enforcement (409) | Blocker assignee'ye (otomatik) | — | audit_logs |
| Item done → dependents | Dependent assignee'lere | — | audit_logs |
| Status değişikliği | — | — | audit_logs + backlog_activity |
| Hours logged | — | — | backlog_activity |
| Reassigned | — | — | backlog_activity |

---

## 9. Tip Tanımları

```typescript
// @interface Sprint @version 1.0
export type SprintStatus = 'planning' | 'active' | 'completed';

export interface Sprint {
  id: string;
  name: string;
  goal: string | null;
  start_date: string;
  end_date: string;
  status: SprintStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// @interface BacklogItem @version 2.0
export type BacklogStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type BacklogPriority = 'critical' | 'high' | 'medium' | 'low';
export type DevRole = 'product_owner' | 'portal_frontend' | 'portal_backend' | 'ai_backend' | 'fullstack' | 'project_coordinator';

export interface BacklogItem {
  id: string;
  seq_id: number;
  sprint_id: string | null;
  title: string;
  description: string | null;
  prd_id: string | null;
  prd_section: string | null;
  epic: string | null;
  dev_role: DevRole | null;
  assigned_to: string | null;
  reviewer_id: string | null;
  deliverable_id: string | null;
  file_id: string | null;
  blocked_by: string | null;
  status: BacklogStatus;
  priority: BacklogPriority;
  estimated_hours: number | null;
  actual_hours: number | null;
  sort_order: number;
  created_by: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

// @interface BacklogActivity @version 1.0
export interface BacklogActivity {
  id: string;
  backlog_item_id: string;
  user_id: string;
  from_status: string | null;
  to_status: string | null;
  action: string;
  hours_logged: number | null;
  created_at: string;
}

// @interface BacklogReview @version 1.0
export interface BacklogReview {
  id: string;
  backlog_item_id: string;
  reviewer_id: string;
  status: 'pending' | 'approved' | 'changes_requested';
  comment: string | null;
  has_screenshot: boolean;
  created_at: string;
  updated_at: string;
}
```

---

## 10. Key Files

### Sayfalar

| Dosya | Rol |
|-------|-----|
| `portal/app/(protected)/sprints/page.tsx` | Sprint Board |
| `portal/app/(protected)/sprints/[id]/page.tsx` | Sprint Detail (Kanban) |
| `portal/app/(protected)/sprints/[id]/dependencies/page.tsx` | Dependency Graph |
| `portal/app/(protected)/sprints/[id]/analytics/page.tsx` | Sprint Analytics |
| `portal/app/(protected)/sprints/analytics/page.tsx` | Project Analytics |
| `portal/app/(protected)/settings/dev-roles/page.tsx` | Dev Roles ayarları |

### Bileşenler

| Dosya | Rol |
|-------|-----|
| `portal/components/sprints/SprintBoard.tsx` | Sprint listesi + backlog section |
| `portal/components/sprints/SprintDetail.tsx` | Kanban board + settings modal + blocker modal |
| `portal/components/sprints/BacklogItemCard.tsx` | Item kartı (compact + full) + review modal + blocker modal |
| `portal/components/sprints/BacklogSection.tsx` | Backlog create dialog |
| `portal/components/sprints/BacklogEditModal.tsx` | Item düzenleme modal'ı |
| `portal/components/sprints/DependencyGraph.tsx` | Dependency görselleştirme |
| `portal/components/sprints/SprintAnalytics.tsx` | Burndown + performans + review tracking |
| `portal/components/sprints/ProjectAnalytics.tsx` | Proje geneli analytics |
| `portal/components/sprints/MonthlyCalendar.tsx` | Google Calendar tarzı aylık takvim |
| `portal/components/sprints/ImagePreviewModal.tsx` | Zoom + pan image viewer |
| `portal/components/settings/DevRolesTab.tsx` | Rol atama UI |

### API Routes

| Dosya | Rol |
|-------|-----|
| `portal/app/api/sprints/route.ts` | Sprint CRUD |
| `portal/app/api/sprints/[id]/route.ts` | Sprint detail + update + delete |
| `portal/app/api/sprints/[id]/analytics/route.ts` | Sprint analytics data |
| `portal/app/api/sprints/analytics/route.ts` | Project analytics data |
| `portal/app/api/backlog/route.ts` | Backlog CRUD |
| `portal/app/api/backlog/[id]/route.ts` | Item update + delete + enforcement |
| `portal/app/api/backlog/[id]/attachments/route.ts` | Attachment CRUD + Sharp compress |
| `portal/app/api/backlog/[id]/reviews/route.ts` | Review CRUD + auto status change |
| `portal/app/api/backlog/[id]/request-unblock/route.ts` | Unblock request + notification |
| `portal/app/api/settings/dev-roles/route.ts` | Dev role management |

### Migrations

| Dosya | İçerik |
|-------|--------|
| `20260322153227_create_sprint_backlog_system.sql` | sprints, backlog_items, dev_role column |
| `20260322155602_create_backlog_attachments.sql` | backlog_attachments table |
| `20260322165700_add_blocked_by_to_backlog_items.sql` | blocked_by FK column |
| `20260322181200_backlog_enhancements_v2.sql` | deliverable_id, epic, file_id, reviewer_id, backlog_activity, actual_hours, started_at |
| `20260322183530_add_seq_id_to_backlog_items.sql` | seq_id serial column (BL-{N}) |
| `20260322190253_create_backlog_reviews.sql` | backlog_reviews table |

---

## 11. Cross-Review Matrisi

| Developer (dev_role) | Reviewer |
|---------------------|----------|
| portal_frontend (Hilal) | Gizem (portal_backend) |
| portal_backend (Gizem) | Hilal (portal_frontend) |
| ai_backend (Ali) | Çağla (project_coordinator) |
| fullstack (Kürşat) | Gizem (portal_backend) |
| project_coordinator (Çağla) | Kürşat (product_owner) |
| product_owner (Kürşat) | Gizem (portal_backend) |

---

## 12. Test Senaryoları

### Sprint CRUD
- [ ] Sprint oluşturma: name, goal, dates → 201 Created
- [ ] Sprint güncelleme: status → completed → bitmemiş item'lar backlog'a
- [ ] Sprint silme: item'lar backlog'a, sprint silindi

### Backlog CRUD
- [ ] Item oluşturma: dev_role → auto-assign doğru kişiye
- [ ] Item edit modal: tüm alanlar güncellenebilir
- [ ] Item silme: DB'den kaldırıldı, log yazıldı

### Status Enforcement
- [ ] Blocker done değilken dependent `in_progress`'e çekilemiyor (409)
- [ ] 409'da blocker modal açılıyor, Request Unblock çalışıyor
- [ ] `reviewer_id` olan item direkt `done`'a çekilemiyor (422)
- [ ] `review` statüsünde dropdown → Review Modal'a yönlendirme

### Review Workflow
- [ ] `review`'a geçişte reviewer'a notification + email
- [ ] Review Modal: önceki review'lar listeleniyor
- [ ] Approve → item done + assignee'ye notification + email
- [ ] Request Changes → item in_progress + assignee'ye notification + email
- [ ] Done item'da approval badge görünüyor
- [ ] Review kaydı audit_logs + backlog_activity'de

### Dependency
- [ ] Dependency graph zincirler doğru gösterildi
- [ ] Done blocker → dependents'a "unblocked!" notification

### Analytics
- [ ] Sprint burndown data günlük doğru hesaplandı
- [ ] Burndown slogan (ahead/behind/on track) doğru
- [ ] Kişi performansı doğru hesaplandı
- [ ] Review quality score doğru hesaplandı
- [ ] Project analytics: PRD coverage doğru
- [ ] Monthly calendar: sprint aralıkları renkli, event'ler doğru günlerde

### Attachments
- [ ] JPEG yükleme → Sharp compress → max 1200px
- [ ] Image preview modal: zoom + pan çalışıyor
- [ ] Attachment silme çalışıyor

### Drag & Drop
- [ ] Kanban drag-drop: optimistic update
- [ ] Blocker'lı item drag → 409 → revert + modal
- [ ] Review'a drop → reviewer'a bildirim

---

## 13. Breaking Changes Geçmişi

| Versiyon | Değişiklik |
|----------|------------|
| 1.0 | İlk sürüm: sprint CRUD, backlog CRUD, kanban, dev roles |
| 2.0 | seq_id (BL-{N}), blocker enforcement (409), review enforcement (422), review workflow (approve/changes_requested), backlog_reviews table, backlog_activity genişletme, epic alanı, deliverable_id/file_id/reviewer_id FK'lar, attachment compress, dependency graph, sprint/project analytics, monthly calendar, image preview zoom, request unblock, cross-review matrisi |
