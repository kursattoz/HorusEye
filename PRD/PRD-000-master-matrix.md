# PRD-000 — Master Bağımlılık Matrisi & Sistem Sözlüğü
**Versiyon:** 3.4
**Tarih:** 2026
**Proje:** HorusEye — AI-Based Exam Proctoring System
**Durum:** AKTIF — Tüm PRD'lerin referans aldığı kaynak doküman

---

## ⚠️ LLM KULLANIM TALİMATI

> **Yeni session mı başlatıyorsun?** Önce `PRD/LLM-GUIDE.md` dosyasını oku — hangi PRD'ye ne zaman ihtiyacın olduğunu, bağımlılık zincirini ve PRD isteme protokolünü anlatır.

Bu dosyayı okuyan bir LLM iseniz:
- Sadece kendine verilen PRD dokümanını değiştir, başka PRD'lere dokunma
- `SYSTEM_GLOSSARY` bölümündeki terim tanımlarını asla farklı yorumlama
- **Bir interface değişecekse:**
  1. Bu dosyada o interface'in `@version`'ını bir artır (örn: `@1.0` → `@1.1`)
  2. Bu dosyada `## INTERFACE_CHANGELOG` bölümüne ne değiştiğini yaz
  3. Yeni interface declaration'ını güncelle
  4. `node scripts/validate-prd-interfaces.js` çalıştır → hangi PRD'lerin stale olduğunu görürsün
  5. Script'in listelediği TÜM PRD'leri güncelle (INTERFACE_DEPS bölümündeki version'ı yeni version'a çek)
  6. Tüm PRD'ler güncellendikten sonra commit et

**Script geçmeden commit edilemez** (Husky pre-commit hook zorunlu kılar).
Script: `npm run validate:prd`

---

## 1. PRD Listesi ve Durumları

| PRD ID | Dosya | Başlık | Durum | Versiyon | Bağımlı Olduğu |
|--------|-------|--------|-------|----------|----------------|
| PRD-000 | PRD-000-master-matrix.md | Master Matris & Sözlük | AKTIF | 3.4 | — |
| PRD-001 | PRD-001-auth.md | Auth & Kullanıcı Yönetimi | AKTIF | 1.0 | PRD-000 |
| PRD-002 | PRD-002-public-docs.md | Public Dokümantasyon Alanı | AKTIF | 1.0 | PRD-000, PRD-001 |
| PRD-003 | PRD-003-file-management.md | Dosya Yönetimi (Team Upload) | AKTIF | 1.0 | PRD-000, PRD-001 |
| PRD-004 | PRD-004-feedback.md | Feedback Sistemi | AKTIF | 1.0 | PRD-000, PRD-001, PRD-003 |
| PRD-005 | PRD-005-cicd.md | CI/CD Pipeline & Repo Yapısı | AKTIF | 2.0 | PRD-000 |
| PRD-006 | PRD-006-error-management-logging.md | Hata Yönetimi & Loglama | AKTIF | 1.0 | PRD-000, PRD-001 |
| PRD-007 | PRD-007-system-monitor-dashboard.md | Sistem Monitör Dashboard | AKTIF | 1.0 | PRD-000, PRD-001, PRD-006 |
| PRD-008 | PRD-008-pwa-responsive-design.md | PWA & Responsive Tasarım | AKTIF | 1.0 | PRD-000, PRD-002 |
| PRD-009 | PRD-009-ui-design-system.md | UI Design System | AKTIF | 1.0 | PRD-000 |
| PRD-010 | PRD-010-settings-permissions.md | Settings & İzin Yönetimi | AKTIF | 1.1 | PRD-000, PRD-001, PRD-009, PRD-014 |
| PRD-011 | PRD-011-testing-strategy.md | Test Stratejisi & Altyapısı | AKTIF | 2.0 | PRD-000, PRD-005 |
| PRD-012 | PRD-012-folder-structure-conventions.md | Folder Yapısı & Kod Konvansiyonları | AKTIF | 1.0 | PRD-000, PRD-005, PRD-009 |
| PRD-013 | PRD-013-camera-ai-analysis.md | Kamera Modülü & AI Analiz Pipeline | AKTIF (feature flag) | 2.3 | PRD-000, PRD-001, PRD-006, PRD-007, PRD-016 |
| PRD-014 | PRD-014-email-notifications.md | E-posta Bildirimleri & SMTP | AKTIF | 1.0 | PRD-000, PRD-001, PRD-004, PRD-010, PRD-015 |
| PRD-015 | PRD-015-reports-deliverables.md | Raporlar & Teslim Edilebilirler | AKTIF | 1.0 | PRD-000, PRD-001, PRD-003, PRD-014 |
| PRD-016 | PRD-016-notifications.md | Bildirim Merkezi | AKTIF | 2.0 | PRD-000, PRD-001 |
| PRD-017 | PRD-017-dataset-training-pipeline.md | Veri Seti Stratejisi & Model Eğitim Pipeline'ı | AKTIF | 1.1 | PRD-000, PRD-013 |

---

## 2. Bağımlılık Matrisi

```
PRD-000 (Master)
├── PRD-009 (UI Design System)    ← Tüm frontend PRD'lerinin görsel kaynağı
├── PRD-001 (Auth)
│   ├── PRD-002 (Public Docs)     ← Auth olmadan da erişilir, Auth bilir
│   ├── PRD-003 (File Mgmt)       ← Auth zorunlu
│   │   ├── PRD-004 (Feedback)    ← File Mgmt üzerine kurulu
│   │   └── PRD-015 (Reports)     ← File Mgmt dosyalarını deliverable'a bağlar
│   ├── PRD-007 (Monitor)         ← Sadece Admin rolü erişir
│   │   └── PRD-006 (Logging)     ← Monitor, log sistemini gösterir
│   ├── PRD-010 (Settings)        ← Profil + kullanıcı yönetimi
│   │   ├── PRD-009 (UI)          ← Tema ayarları
│   │   └── PRD-014 (Email)       ← SMTP entegrasyon sekmesi
│   └── PRD-016 (Notifications)   ← Bildirim merkezi (DB backend + API)
├── PRD-005 (CI/CD)               ← Tüm sistemi deploy eder
│   └── PRD-011 (Testing)         ← CI pipeline'a entegre
├── PRD-006 (Logging)             ← Auth'dan user_id alır, her sistemden event alır
├── PRD-008 (PWA)                 ← Public Docs'u offline cache'ler
│   └── PRD-009 (UI)              ← Breakpoint'ler, bottom nav
├── PRD-012 (Folder/Conventions)  ← Tüm PRD'lerin kod yapısını tanımlar
├── PRD-014 (Email)               ← OTP + bildirim sistemi
└── PRD-013 (Camera AI) [Feature Flag]
    ├── PRD-001 (Auth)        ← Kullanıcı yetkilendirme
    ├── PRD-006 (Logging)     ← Incident + audit loglama
    ├── PRD-007 (Monitor)     ← Camera health card
    ├── PRD-016 (Notifications) ← Push notification + sesli uyarı
    └── PRD-017 (Dataset Pipeline) ← Veri toplama, eğitim, model iyileştirme
```

**Değişim Riski Tablosu:**

| Değişiklik | Etkilenen PRD'ler | Risk |
|------------|------------------|------|
| User rolü eklenir/çıkarılır | PRD-001, PRD-002, PRD-003, PRD-004, PRD-007, PRD-010 | YÜKSEK |
| Dosya storage bucket değişir | PRD-003, PRD-004, PRD-002 | ORTA |
| Log tablosu şeması değişir | PRD-006, PRD-007 | ORTA |
| Auth provider değişir | PRD-001, PRD-005 | YÜKSEK |
| API route prefix değişir | PRD-001, PRD-002, PRD-003, PRD-004 | YÜKSEK |
| Renk/tasarım token değişir | PRD-009 → tüm frontend PRD'ler | DÜŞÜK |
| shadcn component güncellenir | PRD-009 | DÜŞÜK |
| Supabase MCP proje adı değişir | PRD-006, PRD-007, PRD-010, PRD-013 | ORTA |
| Folder yapısı değişir | PRD-012 → tüm PRD'ler | YÜKSEK |
| SMTP şifreleme anahtarı değişir | PRD-014 | YÜKSEK |
| report_deliverables şeması değişir | PRD-015, PRD-014 | ORTA |

**Supabase MCP:** Tüm DB işlemlerinde MCP adı `horuseye-staging` kullanılır. Üretim için `horuseye-production`.

---

## 3. Interface Contracts

Bu bölüm, PRD'ler arası veri akışını tanımlar.
Her interface'in bir `@version` numarası vardır.
Her PRD, kullandığı interface version'larını `INTERFACE_DEPS` bloğunda declare eder.
`scripts/validate-prd-interfaces.js` bu tutarlılığı otomatik kontrol eder.

**Version kuralı:** `MAJOR.MINOR`
- `MINOR` artışı: yeni optional alan eklendi (geriye uyumlu)
- `MAJOR` artışı: alan kaldırıldı, tipi değişti, alan zorunlu hale geldi (breaking change)

---

### 3.1 AuthUser `@1.1`
**Kanal:** PRD-001 → PRD-002, PRD-003, PRD-004, PRD-007, PRD-010, PRD-011, PRD-015, PRD-016

```typescript
// @interface AuthUser @version 1.1
interface AuthUser {
  id: string;               // UUID — Supabase auth.users.id
  email: string;
  role: UserRole;           // Bkz: SYSTEM_GLOSSARY.UserRole
  team_id: string | null;
  full_name: string | null; // user_profiles.full_name
  avatar_url: string | null;// user_profiles.avatar_url (signed URL)
  created_at: string;       // ISO 8601
}
```

### 3.2 HorusFile `@1.4`
**Kanal:** PRD-003 → PRD-002, PRD-004, PRD-015

```typescript
// @interface HorusFile @version 1.4
interface HorusFile {
  id: string;
  name: string;
  display_name: string;
  file_type: FileType;          // Bkz: SYSTEM_GLOSSARY.FileType
  storage_path: string;         // Supabase storage bucket path
  public_url: string | null;    // null ise /d/[id] proxy üzerinden erişilir
  file_size_bytes: number;       // Bayt cinsinden dosya boyutu
  is_public: boolean;
  uploaded_by: string;          // user_id
  team_id: string;
  blurred_pages: number[] | null; // PDF'de bulanıklaştırılacak sayfa numaraları (admin ayarlar, çoklu seçim)
  sort_order: number | null;    // Admin manuel sıralama; null ise en sona
  document_date: string | null; // Kullanıcının belirlediği belge tarihi (ISO 8601 DATE, upload tarihi değil)
  created_at: string;
  updated_at: string;
  deleted_at: string | null;    // Soft delete
  metadata: Record<string, unknown>;
}
```

### 3.3 LogEvent `@1.2`
**Kanal:** PRD-006 → PRD-007, PRD-013

```typescript
// @interface LogEvent @version 1.2
interface LogEvent {
  id: string;
  event_type: LogEventType;   // Bkz: SYSTEM_GLOSSARY.LogEventType
  severity: LogSeverity;      // Bkz: SYSTEM_GLOSSARY.LogSeverity
  user_id: string | null;
  session_id: string | null;
  resource_type: string;
  resource_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  created_at: string;
}
```

### 3.4 Feedback `@1.1`
**Kanal:** PRD-004 → PRD-002

```typescript
// @interface Feedback @version 1.1
interface Feedback {
  id: string;
  file_id: string;
  author_id: string;
  feedback_type: FeedbackType; // Bkz: SYSTEM_GLOSSARY.FeedbackType
  content: string;
  line_ref: string | null;     // Inline annotation için "sayfa:satır" formatı, örn: "2:15"
  resolved: boolean;
  created_at: string;
  updated_at: string;
}
```

### 3.5 HealthStatus `@1.0`
**Kanal:** PRD-007 (internal)

```typescript
// @interface HealthStatus @version 1.0
interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency_ms: number | null;
  last_checked: string;
  message: string | null;
}
```

### 3.6 ReportDeliverable `@1.0`
**Kanal:** PRD-015 (internal), PRD-014 (email bildirimi için okur)

```typescript
// @interface ReportDeliverable @version 1.0
interface ReportDeliverable {
  id: string;
  title: string;
  description: string | null;
  deliverable_number: string;  // Görüntüleme için sıra kodu, örn: "D-01"
  deadline: string;            // ISO 8601
  status: DeliverableStatus;   // Bkz: SYSTEM_GLOSSARY.DeliverableStatus
  assigned_to: string | null;  // user_id (FK → user_profiles)
  file_id: string | null;      // FK → files (opsiyonel bağlantı)
  created_at: string;
  updated_at: string;
}
```

### 3.7 ChecklistItem `@1.0`
**Kanal:** PRD-015 (internal)

```typescript
// @interface ChecklistItem @version 1.0
interface ChecklistItem {
  id: string;
  deliverable_id: string;  // FK → report_deliverables
  label: string;
  is_checked: boolean;
  checked_by: string | null;  // user_id — son işaretleyen
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

### 3.8 Notification `@1.0`
**Kanal:** PRD-016 (internal)

```typescript
// @interface Notification @version 1.0
type NotificationCategory = 'files' | 'feedback' | 'team' | 'system';

interface Notification {
  id: string;
  user_id: string;           // FK → user_profiles
  category: NotificationCategory;
  title: string;
  description: string | null;
  is_read: boolean;
  link: string | null;        // Opsiyonel navigasyon linki
  metadata: Record<string, unknown>;
  created_at: string;
}
```

### 3.9 Exam `@1.0`
**Kanal:** PRD-013 (internal)

```typescript
// @interface Exam @version 1.0
type ExamStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';

interface Exam {
  id: string;
  name: string;                // "CMPE 492 Final Sınavı"
  course_code: string | null;
  description: string | null;
  scheduled_date: string;      // ISO DATE
  scheduled_start: string;     // HH:MM
  scheduled_end: string;       // HH:MM
  duration_minutes: number;
  status: ExamStatus;
  settings: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
```

### 3.10 ExamRoom `@1.0`
**Kanal:** PRD-013 (internal)

```typescript
// @interface ExamRoom @version 1.0
interface ExamRoom {
  id: string;
  name: string;               // "Lab A", "Salon 101"
  capacity: number | null;
  location: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### 3.11 Camera `@1.2`
**Kanal:** PRD-013 + PRD-019 (internal)

```typescript
// @interface Camera @version 1.2
type CameraRole = 'front_wide' | 'front_close' | 'rear_wide' | 'side_left' | 'side_right';
type CameraType = 'ip_camera' | 'phone' | 'usb_webcam';

interface Camera {
  id: string;
  room_id: string | null;          // NEW: nullable for movable cams (PRD-019)
  label: string;
  stream_url: string;
  camera_type: CameraType;
  role: CameraRole;
  position_x: number | null;
  position_y: number | null;
  quality_score: number;
  is_active: boolean;
  is_fixed: boolean;               // NEW (PRD-019)
  owner_user_id: string | null;    // NEW (PRD-019) — null = system-owned
  device_id: string | null;        // NEW (PRD-019) — phone fingerprint
  last_seen_at: string | null;     // NEW (PRD-019)
  created_at: string;
}
```

### 3.12 ExamSession `@1.1`
**Kanal:** PRD-013 (internal)

```typescript
// @interface ExamSession @version 1.1
type SessionStatus = 'scheduled' | 'active' | 'paused' | 'ended';

interface ExamSession {
  id: string;
  exam_id: string;             // FK → exams (üst entity)
  room_id: string;             // FK → exam_rooms
  started_at: string | null;
  ended_at: string | null;
  status: SessionStatus;
  settings: Record<string, unknown>;  // FPS, thresholds, override'lar
  created_at: string;
  updated_at: string;
}
```

### 3.13 Student `@1.2`
**Kanal:** PRD-013 (internal)
**Yenilik (1.2):** Risk skoru cache alanları (BL-225, Sprint 11) — `students` tablosunda persist edilir, AI tarafından incident insert trigger'ı ile güncellenir.

```typescript
// @interface Student @version 1.2
interface Student {
  id: string;
  student_id: string;          // Okul numarası (unique)
  full_name: string;
  email: string | null;
  department: string | null;   // Bölüm (opsiyonel)
  is_active: boolean;
  // ── Risk cache (BL-225, Sprint 11) — derived from incidents
  risk_score: number;          // 0..1, weighted severity rolling 90d avg
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_trend: 'rising' | 'stable' | 'falling';
  incident_count: number;
  risk_updated_at: string | null;
  created_at: string;
  updated_at: string;
}
```

### 3.14 Incident `@1.1`
**Kanal:** PRD-013 (internal)

```typescript
// @interface Incident @version 1.1
type IncidentType =
  | 'phone_detected' | 'earbuds_detected' | 'paper_detected'
  | 'gaze_diversion' | 'head_turn' | 'empty_seat'
  | 'whispering' | 'unauthorized_communication' | 'position_uncertainty';

type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
type ProctorDecision = 'clean' | 'suspicious' | 'violation';

interface Incident {
  id: string;
  session_id: string;           // FK → exam_sessions
  student_id: string | null;    // Öğrenci numarası
  track_id: number | null;      // BoT-SORT tracking ID
  incident_type: IncidentType;
  severity: IncidentSeverity;
  confidence: number;           // 0.0-1.0
  risk_score: number | null;
  triggered_rules: string[];
  camera_ids: string[];
  evidence_paths: string[];
  raw_signals: Record<string, unknown> | null; // AI detection raw data (re-scoring için)
  is_reviewed: boolean;
  reviewed_by: string | null;
  review_note: string | null;
  proctor_decision: ProctorDecision | null;    // Post-exam gözetmen kararı
  decision_note: string | null;                // Karar açıklaması
  decided_by: string | null;                   // FK → user_profiles
  decided_at: string | null;                   // ISO 8601
  occurred_at: string;
  created_at: string;
}
```

### 3.14a SessionCamera `@1.0`
**Kanal:** PRD-019 (owner)

```typescript
// @interface SessionCamera @version 1.0
interface SessionCamera {
  id:          string;
  session_id:  string;     // FK → exam_sessions
  camera_id:   string;     // FK → cameras
  added_at:    string;
  added_by:    string | null;
}
```

### 3.14b CameraHealthEvent `@1.0`
**Kanal:** PRD-019 (owner)

```typescript
// @interface CameraHealthEvent @version 1.0
type CameraHealthEventType =
  | 'connected' | 'disconnected' | 'reconnected'
  | 'low_battery' | 'critical_battery' | 'charging'
  | 'app_backgrounded' | 'app_foregrounded'
  | 'overheat' | 'orientation_changed' | 'preview_offscreen'
  | 'permission_revoked';

interface CameraHealthEvent {
  id:         string;
  camera_id:  string;
  session_id: string | null;
  event_type: CameraHealthEventType;
  metadata:   Record<string, unknown> | null;
  created_at: string;
}
```

### 3.15 Sprint `@1.0`
**Kanal:** PRD-018 (owner)

```typescript
// @interface Sprint @version 1.0
type SprintStatus = 'planning' | 'active' | 'completed';

interface Sprint {
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
```

### 3.16 BacklogItem `@2.0`
**Kanal:** PRD-018 (owner)

```typescript
// @interface BacklogItem @version 2.0
type BacklogStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
type BacklogPriority = 'critical' | 'high' | 'medium' | 'low';
type DevRole = 'product_owner' | 'portal_frontend' | 'portal_backend' | 'ai_backend' | 'fullstack' | 'project_coordinator';

interface BacklogItem {
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
```

### 3.17 BacklogActivity `@1.0`
**Kanal:** PRD-018 (owner)

```typescript
// @interface BacklogActivity @version 1.0
interface BacklogActivity {
  id: string;
  backlog_item_id: string;
  user_id: string;
  from_status: string | null;
  to_status: string | null;
  action: string;
  hours_logged: number | null;
  created_at: string;
}
```

### 3.18 BacklogReview `@1.0`
**Kanal:** PRD-018 (owner)

```typescript
// @interface BacklogReview @version 1.0
interface BacklogReview {
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

## INTERFACE_CHANGELOG

Her interface değişikliği buraya eklenir. Eski versiyonlar silinmez.

| Interface | Versiyon | Tarih | Değişiklik | Etkili PRD'ler |
|-----------|---------|-------|-----------|----------------|
| AuthUser | 1.0 | 2025 | İlk tanım | PRD-001,002,003,004,007,010,011 |
| AuthUser | 1.1 | 2026 | `full_name: string \| null` ve `avatar_url: string \| null` eklendi | PRD-001,002,003,004,007,010,011,015,016 |
| HorusFile | 1.0 | 2025 | İlk tanım | PRD-002,003,004 |
| HorusFile | 1.1 | 2026 | `public_url` tipi `string` → `string \| null` (private dosyalar için nullable) | PRD-002,003,004,015 |
| HorusFile | 1.2 | 2026 | `file_size_bytes: number`, `blurred_page: number \| null`, `sort_order: number \| null` eklendi | PRD-002,003,004,015 |
| HorusFile | 1.3 | 2026 | `blurred_page: number \| null` → `blurred_pages: number[] \| null` (çoklu sayfa blur desteği) | PRD-002,003,004,015 |
| HorusFile | 1.4 | 2026 | `document_date: string \| null` eklendi — kullanıcı tarafından belirlenen belge tarihi (PDF'den otomatik algılama destekli) | PRD-002,003,004,015 |
| LogEvent | 1.0 | 2025 | İlk tanım | PRD-006,007 |
| LogEvent | 1.1 | 2026 | `LogEventType`'a `file.update` ve `file.restore` eklendi | PRD-006,007 |
| LogEvent | 1.2 | 2026 | `LogEventType`'a Faz 2 event tipleri eklendi: exam.*, session.*, student.*, attendance.*, camera.*, ai.*, proctor.* (17 yeni event). Kanal PRD-013 eklendi | PRD-006,007,013 |
| Feedback | 1.0 | 2025 | İlk tanım | PRD-002,004 |
| Feedback | 1.1 | 2026 | `line_ref` tipi `number \| null` → `string \| null` (DB şeması `VARCHAR(20)` ile uyumlu, format: "sayfa:satır") | PRD-002,004 |
| HealthStatus | 1.0 | 2025 | İlk tanım | PRD-007 |
| ReportDeliverable | 1.0 | 2026 | İlk tanım (PRD-015 eklendi) | PRD-015,014 |
| ChecklistItem | 1.0 | 2026 | İlk tanım (PRD-015 eklendi) | PRD-015 |
| Notification | 1.0 | 2026 | İlk tanım — DB backend, API routes, helper lib (PRD-016 eklendi) | PRD-016 |
| ExamRoom | 1.0 | 2026 | İlk tanım — sınav odası yönetimi (PRD-013 Phase A) | PRD-013 |
| Camera | 1.0 | 2026 | İlk tanım — kamera tanımı + RTSP stream (PRD-013 Phase A) | PRD-013 |
| ExamSession | 1.0 | 2026 | İlk tanım — sınav oturumu yönetimi (PRD-013 Phase A) | PRD-013 |
| Student | 1.0 | 2026 | İlk tanım — öğrenci yönetimi, toplu import, transfer (PRD-013 Phase A) | PRD-013 |
| Incident | 1.0 | 2026 | İlk tanım — AI tespit olayları, severity, evidence (PRD-013 Phase A) | PRD-013 |
| Incident | 1.1 | 2026 | `raw_signals`, `proctor_decision`, `decision_note`, `decided_by`, `decided_at` eklendi — post-exam review ve re-scoring desteği | PRD-013 |
| Exam | 1.0 | 2026 | İlk tanım — sınav üst entity, multi-session, wizard, gözetmen/öğrenci ataması | PRD-013 |
| Camera | 1.1 | 2026 | `camera_type: CameraType` eklendi — IP kamera, telefon, USB webcam ayrımı. `stream_url` açıklaması genişletildi | PRD-013 |
| Student | 1.1 | 2026 | `room_id` ve `seat_number` kaldırıldı (öğrenciler odaya değil oturuma atanır — `session_students` tablosu). `department` eklendi | PRD-013 |
| ExamSession | 1.1 | 2026 | `exam_id` eklendi (FK → exams). `name` ve `created_by` kaldırıldı (sınav adı `exams.name`'den gelir, oluşturan `exams.created_by`'dan) | PRD-013 |
| Camera | 1.2 | 2026 | `is_fixed`, `owner_user_id`, `device_id`, `last_seen_at` eklendi; `room_id` nullable yapıldı (taşınabilir telefonlar için). `fixed_cameras_have_home_room` CHECK constraint | PRD-019 |
| SessionCamera | 1.0 | 2026 | İlk tanım — oturum ↔ kamera M:N junction (PRD-019) | PRD-019 |
| CameraHealthEvent | 1.0 | 2026 | İlk tanım — telefon sağlık event tipleri (battery/visibility/permission/orientation) | PRD-019 |

---

## 4. Sistem Sözlüğü (SYSTEM_GLOSSARY)

Bu tanımlar tüm PRD'lerde aynı şekilde kullanılır. LLM farklı yorumlayamaz.

### 4.1 UserRole
```typescript
type UserRole =
  | 'admin'       // Ekip üyesi. Tam yetki. Dosya CRUD, kullanıcı yönetimi, sistem monitor
  | 'supervisor'  // Hoca/jüri. Dosya görüntüle + feedback yaz
  | 'assistant'   // Asistan. Sadece görüntüle, feedback yazamaz
  | 'guest';      // Login yok. Sadece public alan. Hesap oluşturulamaz, sadece URL erişimi
```

### 4.2 FileType
```typescript
type FileType =
  | 'pdf'
  | 'pptx'
  | 'docx'
  | 'image'   // png, jpg, jpeg, webp
  | 'video'   // mp4 (ileride kamera kayıtları için — PRD-013)
  | 'other';
```

### 4.3 LogEventType
```typescript
type LogEventType =
  // Faz 0-1 — Mevcut
  | 'auth.login'
  | 'auth.logout'
  | 'auth.failed'
  | 'auth.password_reset'
  | 'file.upload'
  | 'file.download'
  | 'file.delete'
  | 'file.view'
  | 'file.update'    // Metadata veya visibility güncellendi
  | 'file.restore'   // Soft-deleted dosya geri yüklendi
  | 'feedback.create'
  | 'feedback.update'
  | 'feedback.delete'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'system.error'
  | 'system.warning'
  | 'page.visit'     // Her sayfa geçişi loglanır
  // Faz 2 — Sınav Yönetimi (PRD-013)
  | 'exam.create'
  | 'exam.update'
  | 'exam.delete'
  | 'exam.start'
  | 'exam.end'
  | 'session.start'
  | 'session.pause'
  | 'session.end'
  | 'student.import'
  | 'student.transfer'
  | 'student.checkout'
  | 'attendance.checkin'
  | 'attendance.checkout'
  // Faz 2 — AI & Kamera (PRD-013)
  | 'camera.connect'
  | 'camera.disconnect'
  | 'camera.error'
  | 'camera.calibrate'
  | 'ai.detection'      // Yüksek hacim — sadece Redis, DB'ye yazılmaz
  | 'ai.incident'       // Risk eşiği aşıldı → incident kaydı
  | 'ai.model_deploy'   // Yeni AI modeli aktif edildi
  | 'ai.dataset_import'  // Yeni veri seti sisteme aktarıldı (PRD-017)
  // Faz 2 — Gözetmen Aksiyonları (PRD-013)
  | 'proctor.acknowledge'
  | 'proctor.decide'     // Post-exam: gözetmen kararı (clean/suspicious/violation)
  | 'proctor.dismiss'
  | 'proctor.escalate'
  | 'proctor.flag';
```

### 4.4 LogSeverity
```typescript
type LogSeverity = 'debug' | 'info' | 'warn' | 'error' | 'critical';
```

### 4.5 FeedbackType
```typescript
type FeedbackType =
  | 'general'   // Dosya bazlı genel yorum
  | 'inline';   // Belirli satır/bölüme yorum
```

### 4.6 DeliverableStatus
```typescript
type DeliverableStatus =
  | 'pending'      // Başlanmadı
  | 'in_progress'  // Devam ediyor
  | 'completed';   // Tamamlandı
```

### 4.7 Environment
```typescript
type Environment = 'local' | 'staging' | 'production';
```

### 4.8 IncidentType (Phase 2 — PRD-013)
```typescript
type IncidentType =
  | 'phone_detected'              // Cep telefonu tespiti
  | 'earbuds_detected'            // Kulaklık tespiti
  | 'paper_detected'              // Yetkisiz kağıt/not
  | 'gaze_diversion'              // Bakış sapması
  | 'head_turn'                   // Kafa dönüşü
  | 'empty_seat'                  // Boş koltuk
  | 'whispering'                  // Dudak hareketi → konuşma (Phase C)
  | 'unauthorized_communication'  // Kafa dönüşü + dudak hareketi (Phase C)
  | 'position_uncertainty';       // Kameralar arası çelişki (Phase B)
```

### 4.9 IncidentSeverity (Phase 2 — PRD-013)
```typescript
type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
```

### 4.10 SessionStatus (Phase 2 — PRD-013)
```typescript
type SessionStatus = 'scheduled' | 'active' | 'paused' | 'ended';
```

### 4.11 CameraRole (Phase 2 — PRD-013)
```typescript
type CameraRole = 'front_wide' | 'front_close' | 'rear_wide' | 'side_left' | 'side_right';
```

### 4.12 ExamStatus (Phase 2 — PRD-013)
```typescript
type ExamStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
```

### 4.13 ApiErrorCode (Cross-PRD Standart)
```typescript
// Tüm API route'lar bu envelope formatını kullanır.
// Konum: lib/errors/api-error.ts

interface ApiErrorResponse {
  error: string;              // Kullanıcıya gösterilecek mesaj (Türkçe)
  code: ApiErrorCode;         // Makine-okunabilir hata kodu
  status: number;             // HTTP status code
  details?: Record<string, unknown>; // Opsiyonel ek bilgi
}

type ApiErrorCode =
  // Auth (PRD-001)
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_RATE_LIMITED'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_USER_NOT_FOUND'
  | 'AUTH_PASSWORD_CHANGE_REQUIRED'
  // File (PRD-003)
  | 'FILE_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'FILE_INVALID_TYPE'
  | 'FILE_UPLOAD_FAILED'
  | 'FILE_QUOTA_EXCEEDED'
  | 'FILE_NAME_CONFLICT'
  // Feedback (PRD-004)
  | 'FEEDBACK_TOO_LONG'
  | 'FEEDBACK_NOT_FOUND'
  | 'FEEDBACK_UNAUTHORIZED'
  // User (PRD-001, PRD-010)
  | 'USER_NOT_FOUND'
  | 'USER_EMAIL_EXISTS'
  | 'USER_INVALID_ROLE'
  // Report (PRD-015)
  | 'REPORT_NOT_FOUND'
  | 'REPORT_DEADLINE_PAST'
  // Email (PRD-014)
  | 'EMAIL_SMTP_NOT_CONFIGURED'
  | 'EMAIL_SEND_FAILED'
  | 'EMAIL_OTP_EXPIRED'
  | 'EMAIL_OTP_INVALID'
  | 'EMAIL_OTP_RATE_LIMITED'
  | 'EMAIL_DOMAIN_NOT_ALLOWED'
  // Notification (PRD-016)
  | 'NOTIFICATION_NOT_FOUND'
  // System
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  // Phase 2 — Camera & AI (PRD-013)
  | 'EXAM_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_ALREADY_ACTIVE'
  | 'CAMERA_CONNECTION_FAILED'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'SEAT_ALREADY_ASSIGNED';
```

**Kullanım kuralı:** Her API route hata dönerken `NextResponse.json({ error, code, status }, { status })` formatını kullanır. `lib/errors/api-error.ts`'deki `ApiError` class'ı throw edilir, global error handler yakalar.

---

## 5. Veritabanı Şeması (Ana Tablolar)

Bu bölüm normalize edilmiş tablo listesidir. Detaylı migration SQL'leri her PRD'nin kendi bölümündedir.

```
auth.users (Supabase managed)
  └── public.user_profiles (PRD-001)
      ├── public.files (PRD-003)
      │   ├── public.feedbacks (PRD-004)
      │   ├── public.file_access_requests (PRD-014)
      │   └── public.report_deliverables.file_id FK (PRD-015)
      ├── public.audit_logs (PRD-006)
      ├── public.error_logs (PRD-006)
      ├── public.report_deliverables (PRD-015)
      │   └── public.checklist_items (PRD-015)
      ├── public.checklist_items.checked_by FK (PRD-015)
      └── public.notifications (PRD-016)

-- Auth/Email bağımsız tablolar:
public.smtp_settings (PRD-014)       ← singleton (id=1)
public.feedback_otps (PRD-014)       ← public feedback OTP doğrulama
public.public_feedback (PRD-014)    ← misafir OTP feedback kayıtları (auth.users dışı)

-- Faz 2 — Kamera & AI (PRD-013, feature flag korumalı):
public.exams (PRD-013)               ← sınav tanımları (üst entity)
public.exam_rooms (PRD-013)          ← sınav odaları
public.students (PRD-013)            ← öğrenci havuzu
public.cameras (PRD-013)             ← kamera tanımları (room_id FK)
public.exam_sessions (PRD-013)       ← sınav oturumları (exam_id + room_id FK)
public.session_proctors (PRD-013)    ← gözetmen ataması (session × user çoktan çoğa)
public.session_students (PRD-013)    ← öğrenci-oturum ataması (session × student)
public.incidents (PRD-013)           ← AI tespit olayları (session_id FK)
public.push_subscriptions (PRD-013)  ← PWA push notification subscription'ları
public.seat_assignments (PRD-013)    ← oturma planı: session × öğrenci × koltuk × track eşleştirmesi
public.camera_calibrations (PRD-013)  ← kamera kalibrasyon verileri (manuel piksel mapping veya homografi matrisi)
public.seat_camera_assignments (PRD-013) ← koltuk-kamera eşleştirmesi (primary + secondary failover)
public.track_roles (PRD-013)          ← sınav sırasında track rol ataması (student/proctor/visitor/unknown)
public.rescore_logs (PRD-013)         ← accommodation re-scoring audit logu
public.attendance_records (PRD-013)   ← yoklama + çıkış kayıtları (OCR giriş + kiosk/proctor çıkış)
public.student_exam_reports (PRD-013) ← bireysel öğrenci sınav raporları (persona, radar, timeline)
public.session_reports (PRD-013)      ← oturum bazlı aggregate rapor (heatmap, persona dağılımı)
public.exam_reports (PRD-013)         ← sınav geneli rapor (cross-room karşılaştırma)
public.ai_models (PRD-013)           ← eğitilmiş AI modelleri (fine-tune versiyonlama)
public.datasets (PRD-017)            ← veri setleri (kaynak, versiyon, kalite raporu)
```

**Tablo Sahipliği:**
| Tablo | Sahibi PRD | Okuyan PRD'ler |
|-------|-----------|----------------|
| user_profiles | PRD-001 | PRD-002, PRD-003, PRD-004, PRD-006, PRD-007, PRD-015 |
| files | PRD-003 | PRD-002, PRD-004, PRD-007, PRD-015 |
| feedbacks | PRD-004 | PRD-002 |
| public_feedback | PRD-014 | PRD-002 |
| audit_logs | PRD-006 | PRD-007 |
| error_logs | PRD-006 | PRD-007 |
| smtp_settings | PRD-014 | — |
| feedback_otps | PRD-014 | — |
| file_access_requests | PRD-014 | — |
| report_deliverables | PRD-015 | PRD-014 |
| checklist_items | PRD-015 | — |
| notifications | PRD-016 | — |
| exam_rooms | PRD-013 | — |
| students | PRD-013 | — |
| cameras | PRD-013 | — |
| exam_sessions | PRD-013 | — |
| incidents | PRD-013 | PRD-007 |
| push_subscriptions | PRD-013 | — |
| exams | PRD-013 | — |
| session_proctors | PRD-013 | — |
| session_students | PRD-013 | — |
| seat_assignments | PRD-013 | — |
| camera_calibrations | PRD-013 | — |
| seat_camera_assignments | PRD-013 | — |
| track_roles | PRD-013 | — |
| rescore_logs | PRD-013 | — |
| attendance_records | PRD-013 | — |
| student_exam_reports | PRD-013 | — |
| session_reports | PRD-013 | — |
| exam_reports | PRD-013 | — |
| ai_models | PRD-013 | PRD-017 |
| datasets | PRD-017 | PRD-013 |

---

## 6. Tech Stack Kararları

| Katman | Teknoloji | Versiyon | Karar Gerekçesi |
|--------|-----------|----------|-----------------|
| Frontend | Next.js App Router | 15.x | SSR + API routes yeterli, ayrı backend gereksiz |
| UI | shadcn/ui + Tailwind | latest | Ekip kararı |
| Backend | Next.js Server Actions + API Routes | 15.x | FastAPI overkill bu aşamada |
| Database | PostgreSQL (Supabase) | 15.x | Managed, migration desteği var |
| Auth | Supabase Auth | latest | RBAC, email/password, magic link |
| Storage | Supabase Storage | latest | Dosya yönetimi için |
| Error Tracking | Sentry | latest | Kritik hatalar |
| App Logging | Supabase (audit_logs tablosu) | — | Kullanıcı hareketleri |
| CI/CD | GitHub Actions | — | Ücretsiz, entegre |
| Deploy (staging/prod) | AWS ECS Fargate + ALB | — | Container-based, AI/ML genişlemeye uygun |
| Deploy (PR preview) | Vercel | — | Otomatik PR preview URL'leri (GitHub App entegrasyonu) |
| PWA | next-pwa / Serwist | latest | Service worker yönetimi |
| Email | Nodemailer (SMTP) | latest | Admin-configurable, Hostinger SMTP |
| Monitoring | Custom /dev/monitor sayfası | — | DB + backend + servis health |
| AI — Object Detection | YOLOv8 (Ultralytics) | latest | Person + nesne tespiti — PRD-013 |
| AI — Gaze Tracking | MediaPipe Face Mesh | latest | Göz hareketleri + baş pozisyonu — PRD-013 |
| AI — Multi-Student Tracking | BoT-SORT (Ultralytics built-in) | latest | Çoklu kişi takibi, occlusion re-ID — PRD-013 |
| AI — Video Processing | OpenCV | 4.x | Frame pipeline — PRD-013 |
| AI — Behavioral Model (Phase C) | TensorFlow LSTM/GRU | 2.x | Phase A'da kullanılmaz — PRD-013 |
| AI — Risk Scoring (Phase A–B) | Rule-based (custom Python) | — | Deterministik — PRD-013 |

---

## 7. URL & Route Yapısı

```
/ (root)
├── /                        → Public landing + dosya listesi (Guest erişimi)
├── /docs/[slug]             → Tekil public doküman görüntüle
├── /d/[id]                  → Dosya proxy route (signed URL — public/private)
│
├── /login                   → Auth sayfası
├── /change-password         → Zorunlu şifre değişikliği
│
└── (protected — auth zorunlu)
    ├── /dashboard               → Ana sayfa: proctoring istatistikleri + yaklaşan sınavlar
    │
    │   ── PROCTORING (ana modül) ──────────────────────
    ├── /exams                   → Sınavlar (takvim + liste görünümü)
    ├── /exams/new               → Sınav oluşturma wizard (5 adım)
    ├── /exams/[id]              → Sınav detay (oturumlar, gözetmenler, öğrenciler)
    ├── /exams/[id]/edit         → Sınav düzenleme
    ├── /exams/[id]/sessions/[sid]            → Canlı izleme (kamera grid + alert)
    ├── /exams/[id]/sessions/[sid]/incidents  → Olay inceleme
    ├── /exams/[id]/sessions/[sid]/report     → Sınav sonrası rapor
    ├── /exams/[id]/sessions/[sid]/kiosk     → Tablet kiosk (öğrenci self-service çıkış)
    ├── /monitoring              → Canlı izleme hub (tüm aktif oturumlar tek ekranda)
    ├── /students                → Öğrenci havuzu (import, CRUD, geçmiş)
    ├── /analytics               → Genel sistem analitik (tüm sınavlar, trendler)
    ├── /analytics/courses/[code] → Ders bazlı trend analitik
    ├── /rooms                   → Sınav odaları + kameralar + sıra düzeni editörü
    ├── /rooms/[id]              → Oda detay: sıra düzeni, kameralar, test modu
    │
    │   ── PROJECT (ekip içi iletişim) ─────────────────
    ├── /files                   → Dosya yönetimi (Admin)
    ├── /reports                 → Teslim edilebilirler listesi
    ├── /reports/[id]            → Tekil deliverable detay + checklist
    ├── /feedback                → Feedback listesi (Admin + Supervisor)
    ├── /team                    → Takım yönetimi (Admin)
    │
    │   ── SYSTEM ──────────────────────────────────────
    ├── /notifications           → Bildirim merkezi
    ├── /ai/training             → Fine-tuning arayüzü (model eğitim, deploy)
    ├── /settings                → Ayarlar hub
    │   ├── /settings/profile        → Profil bilgileri
    │   ├── /settings/account        → Şifre + oturum yönetimi
    │   ├── /settings/appearance     → Tema & renk
    │   ├── /settings/users          → Kullanıcı yönetimi (Admin)
    │   └── /settings/integrations   → SMTP yapılandırması (Admin)
    └── /dev/monitor             → Sistem monitör ekranı (Admin)
```

---

## 8. API Route Haritası

```
-- Auth
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/reset-password

-- Dosya Yönetimi (Admin)
GET  /api/files
POST /api/files/upload
GET  /api/files/[id]
PUT  /api/files/[id]
DELETE /api/files/[id]
GET  /api/files/trash
POST /api/files/[id]/restore

-- Public Dosya Erişimi
GET  /api/public/files
GET  /api/public/files/[slug]
GET  /api/public/files/[slug]/download
POST /api/public/files/access-link

-- Feedback (Auth)
GET  /api/feedback
POST /api/feedback
GET  /api/feedback/[id]
PUT  /api/feedback/[id]
DELETE /api/feedback/[id]
POST /api/feedback/[id]/resolve

-- Public Feedback + OTP
POST /api/public/feedback
POST /api/public/feedback/otp
POST /api/public/feedback/otp/verify

-- Kullanıcı Yönetimi (Admin)
GET  /api/users
POST /api/users
GET  /api/users/[id]
PUT  /api/users/[id]
DELETE /api/users/[id]
POST /api/users/[id]/reset

-- Reports & Deliverables (Auth)
GET  /api/reports
GET  /api/reports/[id]
PUT  /api/reports/[id]
GET  /api/reports/[id]/checklist
POST /api/reports/[id]/checklist
PUT  /api/reports/[id]/checklist/[itemId]
DELETE /api/reports/[id]/checklist/[itemId]
PATCH  /api/reports/[id]/checklist/reorder

-- Settings (Admin)
GET  /api/settings/smtp
POST /api/settings/smtp
POST /api/settings/smtp/test

-- Notifications (Auth)
GET  /api/notifications
GET  /api/notifications/count
POST /api/notifications/read

-- Dosya Temizlik (Admin / Cron)
POST /api/files/purge

-- Sistem
GET  /api/health
GET  /api/health/detailed
POST /api/log/page

-- Faz 2 — Kamera & AI (CAMERA_MODULE_ENABLED=true)
GET    /api/rooms
POST   /api/rooms
GET    /api/rooms/[id]
PUT    /api/rooms/[id]
DELETE /api/rooms/[id]
GET    /api/rooms/[id]/cameras
POST   /api/rooms/[id]/cameras
PUT    /api/cameras/[id]
DELETE /api/cameras/[id]
GET    /api/students
POST   /api/students
POST   /api/students/import
PUT    /api/students/[id]
DELETE /api/students/[id]
POST   /api/students/transfer
GET    /api/exams
POST   /api/exams
GET    /api/exams/[id]
PUT    /api/exams/[id]
DELETE /api/exams/[id]
GET    /api/exams/[id]/sessions
POST   /api/exams/[id]/sessions
GET    /api/sessions/[id]
PUT    /api/sessions/[id]
DELETE /api/sessions/[id]
POST   /api/sessions/[id]/proctors
DELETE /api/sessions/[id]/proctors/[uid]
GET    /api/sessions/[id]/students
POST   /api/sessions/[id]/students
DELETE /api/sessions/[id]/students/[sid]
GET    /api/sessions/[id]/incidents
POST   /api/sessions/[id]/incidents
PUT    /api/incidents/[id]
POST   /api/push/subscribe
DELETE /api/push/subscribe
POST   /api/push/test
POST   /api/sessions/[id]/seat-assignments
GET    /api/sessions/[id]/seat-assignments
PUT    /api/seat-assignments/[id]
-- Öğrenci Çıkış (Kiosk + Proctor)
POST   /api/sessions/[id]/checkout
GET    /api/sessions/[id]/checkout/status
POST   /api/sessions/[id]/checkout/bulk
GET    /api/sessions/[id]/reports
GET    /api/sessions/[id]/reports/[student]

-- Raporlama & Analitik
GET    /api/sessions/[id]/report             → Oturum raporu
GET    /api/exams/[id]/report                → Sınav geneli raporu
GET    /api/analytics                         → Genel sistem istatistikleri
GET    /api/analytics/courses/[code]          → Ders bazlı trend
GET    /api/reports/export/[id]               → PDF/Excel export
DELETE /api/reports/share/[token]            → Paylaşım token'ı iptal et

-- Gözetmen İnceleme & Karar (Phase A)
GET    /api/exams/[id]/sessions/[sid]/review → Post-exam inceleme sayfa verisi
PUT    /api/incidents/[id]/decide            → Proctor kararı kaydet (clean/suspicious/violation)

-- Kamera Kalibrasyonu (Admin)
POST   /api/cameras/[id]/calibration          → Kalibrasyon kaydet (manual veya homography)
GET    /api/cameras/[id]/calibration          → Kalibrasyon verisi

-- Yoklama (Proctor — mobil)
POST   /api/sessions/[id]/attendance          → OCR yoklama kaydı
GET    /api/sessions/[id]/attendance          → Yoklama listesi
PUT    /api/attendance/[id]                   → Yoklama durumu güncelle

-- Otomatik Yerleştirme
POST   /api/exams/[id]/auto-placement         → Risk-bazlı otomatik dağıtım

POST   /api/evidence/purge
POST   /api/ai/training
GET    /api/ai/training
GET    /api/ai/training/[id]
POST   /api/ai/models/[id]/deploy
POST   /api/ai/models/[id]/test
GET    /api/ai/models

-- Dataset Yönetimi (Admin — PRD-017)
GET    /api/ai/datasets
POST   /api/ai/datasets/import
GET    /api/ai/datasets/[id]
DELETE /api/ai/datasets/[id]
POST   /api/ai/datasets/[id]/validate
POST   /api/ai/datasets/merge
GET    /api/ai/datasets/[id]/export
WS     /ws/sessions/[id]/detections
WS     /ws/sessions/[id]/video
```

---

## 9. Ortam Değişkenleri Sözleşmesi

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # Sadece server-side

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=              # CI/CD için

# App
NEXT_PUBLIC_APP_URL=            # Dış erişim URL'i (ECS'de request.nextUrl.origin KULLANILMAZ)
NEXT_PUBLIC_ENV=                # local | staging | production

# Email
SMTP_ENCRYPTION_KEY=            # 32-byte hex — AES-256-GCM şifreleme anahtarı

# Cron / Scheduled Jobs
CRON_SECRET=                    # Cron endpoint auth (POST /api/files/purge, POST /api/evidence/purge)

# Feature Flags
NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false   # Şimdilik false — PRD-013

# Harici Veri Kaynakları (PRD-017, opsiyonel)
ROBOFLOW_API_KEY=                    # Roboflow Universe API erişimi (CLI indirme için)

# Faz 2 — AI Servis & Push Notifications (CAMERA_MODULE_ENABLED=true olduğunda)
AI_SERVICE_URL=                  # FastAPI base URL (http://ai-service:8000)
AI_SERVICE_WS_URL=               # WebSocket URL (ws://ai-service:8000)
VAPID_PUBLIC_KEY=                # Web Push VAPID public key
VAPID_PRIVATE_KEY=               # Web Push VAPID private key
```

---

## 10. Değişiklik Yönetimi

Bu dosyada değişiklik yapılmadan önce:

1. Hangi interface değişiyor? → Bölüm 3'e bak
2. Kaç PRD etkileniyor? → Bağımlılık Matrisine bak (Bölüm 2)
3. Etkilenen PRD'lerde ne güncellenmeli? → O PRD'lerin "Breaking Changes" bölümüne yaz
4. LLM'e verirken: Sadece ilgili PRD'yi ver + PRD-000'ı ver + "sadece bu PRD'yi güncelle" de

---

*Bu doküman HorusEye projesinin tek gerçek kaynağıdır (single source of truth).*
