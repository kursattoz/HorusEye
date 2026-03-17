# PRD-000 — Master Bağımlılık Matrisi & Sistem Sözlüğü
**Versiyon:** 1.0  
**Tarih:** 2025  
**Proje:** HorusEye — AI-Based Exam Proctoring System  
**Durum:** AKTIF — Tüm PRD'lerin referans aldığı kaynak doküman

---

## ⚠️ LLM KULLANIM TALİMATI

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
| PRD-000 | PRD-000-master-matrix.md | Master Matris & Sözlük | AKTIF | 2.0 | — |
| PRD-001 | PRD-001-auth.md | Auth & Kullanıcı Yönetimi | AKTIF | 1.0 | PRD-000 |
| PRD-002 | PRD-002-public-docs.md | Public Dokümantasyon Alanı | AKTIF | 1.0 | PRD-000, PRD-001 |
| PRD-003 | PRD-003-file-management.md | Dosya Yönetimi (Team Upload) | AKTIF | 1.0 | PRD-000, PRD-001 |
| PRD-004 | PRD-004-feedback.md | Feedback Sistemi | AKTIF | 1.0 | PRD-000, PRD-001, PRD-003 |
| PRD-005 | PRD-005-cicd.md | CI/CD Pipeline & Repo Yapısı | AKTIF | 1.0 | PRD-000 |
| PRD-006 | PRD-006-error-management-logging.md | Hata Yönetimi & Loglama | AKTIF | 1.0 | PRD-000, PRD-001 |
| PRD-007 | PRD-007-system-monitor-dashboard.md | Sistem Monitör Dashboard | AKTIF | 1.0 | PRD-000, PRD-001, PRD-006 |
| PRD-008 | PRD-008-pwa-responsive-design.md | PWA & Responsive Tasarım | AKTIF | 1.0 | PRD-000, PRD-002 |
| PRD-009 | PRD-009-ui-design-system.md | UI Design System | AKTIF | 1.0 | PRD-000 |
| PRD-010 | PRD-010-settings-permissions.md | Settings & İzin Yönetimi | AKTIF | 1.0 | PRD-000, PRD-001, PRD-009 |
| PRD-011 | PRD-011-testing-strategy.md | Test Stratejisi & Altyapısı | AKTIF | 1.0 | PRD-000, PRD-005 |
| PRD-012 | PRD-012-folder-structure-conventions.md | Folder Yapısı & Kod Konvansiyonları | AKTIF | 1.0 | PRD-000, PRD-005, PRD-009 |
| PRD-013 | PRD-013-camera-ai-analysis.md | Kamera Modülü & AI Analiz Pipeline | DRAFT | 0.1 | PRD-000, PRD-001, PRD-006, PRD-007 |

**Not:** `PRD-006-007-008.md` dosyası artık geçersizdir. Üç ayrı dosyaya bölündü. Silinmesi gerekir.

---

## 2. Bağımlılık Matrisi

```
PRD-000 (Master)
├── PRD-009 (UI Design System)    ← Tüm frontend PRD'lerinin görsel kaynağı
├── PRD-001 (Auth)
│   ├── PRD-002 (Public Docs)     ← Auth olmadan da erişilir, Auth bilir
│   ├── PRD-003 (File Mgmt)       ← Auth zorunlu
│   │   └── PRD-004 (Feedback)    ← File Mgmt üzerine kurulu
│   ├── PRD-007 (Monitor)         ← Sadece Admin rolü erişir
│   │   └── PRD-006 (Logging)     ← Monitor, log sistemini gösterir
│   └── PRD-010 (Settings)        ← Profil + kullanıcı yönetimi
│       └── PRD-009 (UI)          ← Tema ayarları
├── PRD-005 (CI/CD)               ← Tüm sistemi deploy eder
│   └── PRD-011 (Testing)         ← CI pipeline'a entegre
├── PRD-006 (Logging)             ← Auth'dan user_id alır, her sistemden event alır
├── PRD-008 (PWA)                 ← Public Docs'u offline cache'ler
│   └── PRD-009 (UI)              ← Breakpoint'ler, bottom nav
├── PRD-012 (Folder/Conventions)  ← Tüm PRD'lerin kod yapısını tanımlar
└── PRD-013 (Camera AI) [DRAFT]   ← Feature flag ile korunuyor
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

### 3.1 AuthUser `@1.0`
**Kanal:** PRD-001 → PRD-002, PRD-003, PRD-004, PRD-007, PRD-010, PRD-011

```typescript
// @interface AuthUser @version 1.0
interface AuthUser {
  id: string;           // UUID — Supabase auth.users.id
  email: string;
  role: UserRole;       // Bkz: SYSTEM_GLOSSARY.UserRole
  team_id: string | null;
  created_at: string;   // ISO 8601
}
```

### 3.2 HorusFile `@1.0`
**Kanal:** PRD-003 → PRD-002, PRD-004

```typescript
// @interface HorusFile @version 1.0
interface HorusFile {
  id: string;
  name: string;
  display_name: string;
  file_type: FileType;        // Bkz: SYSTEM_GLOSSARY.FileType
  storage_path: string;       // Supabase storage bucket path
  public_url: string;
  is_public: boolean;
  uploaded_by: string;        // user_id
  team_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;  // Soft delete
  metadata: Record<string, unknown>;
}
```

### 3.3 LogEvent `@1.0`
**Kanal:** PRD-006 → PRD-007

```typescript
// @interface LogEvent @version 1.0
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

### 3.4 Feedback `@1.0`
**Kanal:** PRD-004 → PRD-002

```typescript
// @interface Feedback @version 1.0
interface Feedback {
  id: string;
  file_id: string;
  author_id: string;
  feedback_type: FeedbackType; // Bkz: SYSTEM_GLOSSARY.FeedbackType
  content: string;
  line_ref: number | null;     // Inline annotation için satır no
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

---

## INTERFACE_CHANGELOG

Her interface değişikliği buraya eklenir. Eski versiyonlar silinmez.

| Interface | Versiyon | Tarih | Değişiklik | Etkili PRD'ler |
|-----------|---------|-------|-----------|----------------|
| AuthUser | 1.0 | 2025 | İlk tanım | PRD-001,002,003,004,007,010,011 |
| HorusFile | 1.0 | 2025 | İlk tanım | PRD-002,003,004 |
| LogEvent | 1.0 | 2025 | İlk tanım | PRD-006,007 |
| Feedback | 1.0 | 2025 | İlk tanım | PRD-002,004 |
| HealthStatus | 1.0 | 2025 | İlk tanım | PRD-007 |

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
  | 'video'   // mp4 (ileride kamera kayıtları için)
  | 'other';
```

### 4.3 LogEventType
```typescript
type LogEventType =
  | 'auth.login'
  | 'auth.logout'
  | 'auth.failed'
  | 'auth.password_reset'
  | 'file.upload'
  | 'file.download'
  | 'file.delete'
  | 'file.view'
  | 'feedback.create'
  | 'feedback.update'
  | 'feedback.delete'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'system.error'
  | 'system.warning'
  | 'page.visit';    // Her sayfa geçişi loglanır
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

### 4.6 Environment
```typescript
type Environment = 'local' | 'staging' | 'production';
```

---

## 5. Veritabanı Şeması (Ana Tablolar)

Bu bölüm normalize edilmiş tablo listesidir. Detaylı migration SQL'leri her PRD'nin kendi bölümündedir.

```
auth.users (Supabase managed)
  └── public.user_profiles (PRD-001)
      ├── public.files (PRD-003)
      │   └── public.feedbacks (PRD-004)
      ├── public.audit_logs (PRD-006)
      └── public.error_logs (PRD-006)
```

**Tablo Sahipliği:**
| Tablo | Sahibi PRD | Okuyan PRD'ler |
|-------|-----------|----------------|
| user_profiles | PRD-001 | PRD-002, PRD-003, PRD-004, PRD-006, PRD-007 |
| files | PRD-003 | PRD-002, PRD-004, PRD-007 |
| feedbacks | PRD-004 | PRD-002 |
| audit_logs | PRD-006 | PRD-007 |
| error_logs | PRD-006 | PRD-007 |

---

## 6. Tech Stack Kararları

| Katman | Teknoloji | Versiyon | Karar Gerekçesi |
|--------|-----------|----------|-----------------|
| Frontend | Next.js App Router | 14.x | SSR + API routes yeterli, ayrı backend gereksiz |
| UI | shadcn/ui + Tailwind | latest | Ekip kararı |
| Backend | Next.js Server Actions + API Routes | 14.x | FastAPI overkill bu aşamada |
| Database | PostgreSQL (Supabase) | 15.x | Managed, migration desteği var |
| Auth | Supabase Auth | latest | RBAC, email/password, magic link |
| Storage | Supabase Storage | latest | Dosya yönetimi için |
| Error Tracking | Sentry | latest | Kritik hatalar |
| App Logging | Supabase (audit_logs tablosu) | — | Kullanıcı hareketleri |
| CI/CD | GitHub Actions | — | Ücretsiz, entegre |
| Deploy | Vercel | — | Next.js native, preview URLs |
| PWA | next-pwa | latest | Service worker yönetimi |
| Monitoring | Custom /dev/monitor sayfası | — | DB + backend + servis health |

---

## 7. URL & Route Yapısı

```
/ (root)
├── /                    → Public landing + dosyalar (Guest erişimi)
├── /docs/[slug]         → Tekil public doküman görüntüle
├── /login               → Auth sayfası
├── /dashboard           → Protected, login sonrası ana sayfa
│   ├── /dashboard/files → Dosya yönetimi (Admin)
│   ├── /dashboard/team  → Takım yönetimi (Admin)
│   └── /dashboard/feedback → Feedback listesi (Admin + Supervisor)
└── /dev                 → Geliştirici araçları (Admin only)
    └── /dev/monitor     → Sistem monitör ekranı
```

---

## 8. Ortam Değişkenleri Sözleşmesi

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # Sadece server-side

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=              # CI/CD için

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_ENV=                # local | staging | production

# Feature Flags
NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false   # Şimdilik false
```

---

## 9. Değişiklik Yönetimi

Bu dosyada değişiklik yapılmadan önce:

1. Hangi interface değişiyor? → Bölüm 3'e bak
2. Kaç PRD etkileniyor? → Bağımlılık Matrisine bak (Bölüm 2)
3. Etkilenen PRD'lerde ne güncellenmeli? → O PRD'lerin "Breaking Changes" bölümüne yaz
4. LLM'e verirken: Sadece ilgili PRD'yi ver + PRD-000'ı ver + "sadece bu PRD'yi güncelle" de

---

*Bu doküman HorusEye projesinin tek gerçek kaynağıdır (single source of truth).*
