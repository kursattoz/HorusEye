# PRD-011 — Testing Strategy & Test Infrastructure
**Versiyon:** 2.0
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000, PRD-005
**Bloke ettiği:** —
**Durum:** ACTIVE

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
HorusFile: @1.4
Feedback: @1.1
LogEvent: @1.3
-->

## LLM TALİMATI
Tests must NOT use mocked Supabase clients for integration tests — use the local Supabase Docker instance.
Unit tests mock only external services (Sentry, email provider).
Every new feature must include tests at the appropriate layer before the PR is marked ready.
Coverage thresholds defined in Section 5 are enforced in CI — PRs that drop below threshold are blocked.

---

## 1. Amaç

Katmanlı, deterministik bir test stratejisi tanımlar. Hedef: tüm testler geçiyorsa sistem spesifikasyona uygun çalışıyordur. Deploy öncesi manuel regresyon testi gerekmez.

---

## 2. Test Mimarisi — 5 Katman

```
Katman 5: Security Tests
  └── OWASP Top 10 kontrolleri, RLS bypass denemeleri, XSS/injection
      Araç: Playwright + custom assertions

Katman 4: E2E Tests (Playwright)
  └── Tam kullanıcı akışları, gerçek tarayıcıda, local Supabase'e karşı
      Örnek: Login → Dosya yükle → Feedback yaz → Logout

Katman 3: API Contract Tests (Vitest + fetch)
  └── Her API route'un request/response şemasını doğrula
      Örnek: POST /api/users → 201 { id, email, role } veya 400 { error, code }

Katman 2: Integration Tests (Vitest + Supabase local)
  └── API route'lar ve server action'lar, gerçek local DB'ye karşı
      Örnek: POST /api/users → user_profiles'da row oluşturur

Katman 1: Unit Tests (Vitest)
  └── Pure function'lar, utility'ler, hook'lar, component render
      Örnek: logger formatı doğru, RBAC guard yetkisiz rolü bloklar
```

**Kural:** En düşük katmanda test et. Unit test'in doğrulayabileceği şeyi E2E ile test etme.

---

## 3. Araçlar

| Araç | Kullanım | Versiyon |
|------|----------|----------|
| Vitest | Unit + integration + API contract test runner | latest |
| @testing-library/react | Component render testleri | latest |
| Playwright | E2E + security + visual regression | latest |
| MSW (Mock Service Worker) | Unit testlerde harici HTTP API mock | latest |
| Supabase CLI | Local Supabase Docker (integration/E2E) | latest |
| @faker-js/faker | Test verisi üretimi | latest |

### Kurulum

```bash
npm install -D vitest @vitest/ui @vitest/coverage-v8
npm install -D @testing-library/react @testing-library/user-event @testing-library/jest-dom
npm install -D playwright @playwright/test
npm install -D msw @faker-js/faker
npx playwright install chromium
```

### Vitest Config (`vitest.config.ts`)

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary'],
      include: ['app/**/*.ts', 'app/**/*.tsx', 'lib/**/*.ts', 'components/**/*.tsx'],
      exclude: ['**/*.test.*', '**/*.spec.*', 'tests/**', 'node_modules/**'],
      thresholds: { lines: 70, functions: 70, branches: 65, statements: 70 }
    }
  },
  resolve: { alias: { '@': path.resolve(__dirname, './') } }
});
```

### Playwright Config (`playwright.config.ts`)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  }
});
```

---

## 4. Klasör Yapısı

```
tests/
├── setup.ts                              Global test setup
├── helpers/
│   ├── supabase-client.ts                Service role + anon + role-specific client factory
│   ├── seed.ts                           Programmatic test data oluşturma
│   ├── cleanup.ts                        Test sonrası temizlik
│   ├── api-client.ts                     Type-safe API fetch wrapper (auth header dahil)
│   └── assertions.ts                     Custom assertion'lar (ApiError shape, audit log check)
├── fixtures/
│   ├── users.ts                          Test kullanıcıları (admin, supervisor, assistant)
│   ├── files.ts                          Test dosyaları (PDF, DOCX, image)
│   └── feedback.ts                       Test feedback verileri
├── unit/
│   ├── lib/
│   │   ├── auth-utils.test.ts            canAccess, requireRole, RBAC guard
│   │   ├── file-utils.test.ts            getFileType, formatFileSize, isAllowedMimeType
│   │   ├── logger.test.ts               log(), severity helpers, sanitize
│   │   ├── switchTheme.test.ts           View Transition API + fallback
│   │   ├── mailer-crypto.test.ts         AES-256-GCM encrypt/decrypt round-trip
│   │   ├── notifications.test.ts         createNotification, notifyAdmins (mock DB)
│   │   └── extract-pdf-date.test.ts      PDF tarih algılama
│   ├── components/
│   │   ├── ErrorBoundary.test.tsx         Error boundary render + fallback
│   │   ├── TopbarUserMenu.test.tsx        Avatar dropdown render + click
│   │   ├── ThemeToggle.test.tsx           Tema değişikliği
│   │   ├── NotificationBell.test.tsx      Badge sayacı render
│   │   └── FileUploadDialog.test.tsx      Validation (boyut, tip, sayı)
│   └── hooks/
│       └── usePageTracking.test.ts        fetch mock, pathname dedup
├── integration/
│   ├── api/
│   │   ├── auth.test.ts                  Login, logout, me, rate limit
│   │   ├── health.test.ts               /api/health + /api/health/detailed
│   │   ├── users.test.ts                CRUD + RBAC + error codes
│   │   ├── files.test.ts                Upload, update, delete, restore, purge
│   │   ├── feedback.test.ts             CRUD + resolve + inline + RBAC
│   │   ├── reports.test.ts              Deliverable CRUD + checklist
│   │   ├── notifications.test.ts        List, count, mark-read + RLS
│   │   ├── settings-smtp.test.ts        SMTP save, test connection, encryption
│   │   ├── public-feedback.test.ts      OTP flow + rate limit + public_feedback
│   │   └── public-files.test.ts         Access link + rate limit
│   └── db/
│       ├── rls-policies.test.ts         Tüm tablolar × tüm roller
│       ├── audit-logs.test.ts           Severity constraints, jsonb metadata
│       ├── migrations.test.ts           Migration dosyaları tutarlılığı
│       └── constraints.test.ts          FK, CHECK, UNIQUE constraints
├── e2e/
│   ├── auth.spec.ts                     Login, logout, force password, session expiry
│   ├── file-management.spec.ts          Upload, view, delete, restore, sort, blur
│   ├── public-docs.spec.ts             Public sayfa, PDF viewer, dosya ağacı
│   ├── feedback.spec.ts                Genel + inline yorum, resolve, OTP
│   ├── settings.spec.ts                Tema, profil, kullanıcı yönetimi, SMTP
│   ├── monitor.spec.ts                 Health cards, error table, activity feed
│   ├── notifications.spec.ts           Bell badge, sayfa, mark-read, realtime
│   ├── reports.spec.ts                 Deliverable CRUD, checklist, deadline
│   ├── pwa.spec.ts                     Offline banner, cache, install prompt
│   └── visual/
│       ├── login.spec.ts               Light/dark screenshot
│       ├── dashboard.spec.ts           Light/dark screenshot
│       └── public.spec.ts             Light/dark screenshot
└── security/
    ├── xss.spec.ts                     Tüm input alanlarında XSS denemesi
    ├── injection.spec.ts               SQL injection, header injection
    ├── rls-bypass.spec.ts              RLS bypass denemeleri (anon, cross-user)
    ├── auth-bypass.spec.ts             Session hijack, token manipulation
    └── rate-limit.spec.ts              Tüm rate-limited endpoint'ler
```

---

## 5. Coverage Hedefleri

| Katman | Hedef | CI Blocker? |
|--------|-------|-------------|
| Unit | >= %80 line coverage | Evet — threshold altında PR merge olmaz |
| Integration | >= %70 critical path | Evet |
| E2E | Tüm kritik akışlar (sayı bazlı değil) | Hayır — best effort |
| Security | Tüm OWASP Top 10 kontrolleri | Hayır — CI'da çalışır ama bloklayıcı değil |
| Visual | Kritik sayfalar (login, dashboard, public) | Hayır — sadece bilgilendirme |

---

## 6. Test Helper'ları

### 6.1 Supabase Client Factory

```typescript
// tests/helpers/supabase-client.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Admin client — RLS bypass
export const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Anon client — guest gibi davranır
export const anonClient = createClient(SUPABASE_URL, ANON_KEY);

// Belirli bir kullanıcı olarak davranır (session token ile)
export async function createAuthenticatedClient(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY);
  const { data } = await client.auth.signInWithPassword({ email, password });
  return { client, session: data.session! };
}
```

### 6.2 API Client

```typescript
// tests/helpers/api-client.ts
const BASE = 'http://localhost:3000';

export async function apiCall(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Cookie'] = `sb-access-token=${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}
```

### 6.3 Custom Assertions

```typescript
// tests/helpers/assertions.ts

// API error response doğrulama (PRD-000 §4.13 formatı)
export function expectApiError(response: any, expectedCode: string, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus);
  expect(response.body).toMatchObject({
    error: expect.any(String),
    code: expectedCode,
    status: expectedStatus,
  });
}

// Audit log yazıldığını doğrula
export async function expectAuditLog(
  supabase: any,
  eventType: string,
  userId?: string,
) {
  const query = supabase
    .from('audit_logs')
    .select()
    .eq('event_type', eventType)
    .order('created_at', { ascending: false })
    .limit(1);

  if (userId) query.eq('user_id', userId);
  const { data } = await query;
  expect(data).toHaveLength(1);
  return data![0];
}

// Notification oluşturulduğunu doğrula
export async function expectNotification(
  supabase: any,
  userId: string,
  category: string,
) {
  const { data } = await supabase
    .from('notifications')
    .select()
    .eq('user_id', userId)
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(1);
  expect(data).toHaveLength(1);
  return data![0];
}
```

---

## 7. Test Verisi & Seed

```sql
-- supabase/seed.sql
-- Test kullanıcıları (şifreler seed script'te Supabase Auth Admin API ile set edilir)
INSERT INTO public.user_profiles (id, email, full_name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@horuseye.com',      'Test Admin',      'admin'),
  ('00000000-0000-0000-0000-000000000002', 'supervisor@horuseye.com', 'Test Supervisor', 'supervisor'),
  ('00000000-0000-0000-0000-000000000003', 'assistant@horuseye.com',  'Test Assistant',  'assistant');

-- Test dosyası
INSERT INTO public.files (id, name, display_name, file_type, storage_path, is_public, uploaded_by, team_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'test.pdf', 'Test Document', 'pdf',
   'public/test.pdf', true, '00000000-0000-0000-0000-000000000001', 'test-team');

-- Test feedback
INSERT INTO public.feedbacks (id, file_id, author_id, feedback_type, content) VALUES
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002', 'general', 'Test feedback content');

-- Test deliverable
INSERT INTO public.report_deliverables (id, title, deliverable_number, deadline, status, created_by) VALUES
  ('30000000-0000-0000-0000-000000000001', 'Test Deliverable', 'D-01',
   '2026-04-01', 'pending', '00000000-0000-0000-0000-000000000001');
```

**Şifre seed script'i** (`tests/helpers/seed.ts`):
```typescript
import { adminClient } from './supabase-client';

const TEST_PASSWORD = 'Test1234!';
const TEST_USERS = [
  { id: '00000000-0000-0000-0000-000000000001', email: 'admin@horuseye.com' },
  { id: '00000000-0000-0000-0000-000000000002', email: 'supervisor@horuseye.com' },
  { id: '00000000-0000-0000-0000-000000000003', email: 'assistant@horuseye.com' },
];

export async function seedTestUsers() {
  for (const user of TEST_USERS) {
    await adminClient.auth.admin.createUser({
      email: user.email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { id: user.id },
    });
  }
}
```

---

## 8. Modül Bazlı Test Spesifikasyonları

### 8.1 Auth (PRD-001)

**Unit:**
| Test | Dosya | Assertion |
|------|-------|-----------|
| canAccess admin → /files | auth-utils.test.ts | `true` |
| canAccess supervisor → /settings/users | auth-utils.test.ts | `false` |
| canAccess assistant → /feedback | auth-utils.test.ts | `true` (okuma) |
| canAccess guest → /dashboard | auth-utils.test.ts | `false` |

**Integration API:**
| Test | Method | Path | Input | Expected |
|------|--------|------|-------|----------|
| Valid login | POST | /api/auth/login | `{email, password}` | 200, `session.access_token` mevcut |
| Invalid credentials | POST | /api/auth/login | yanlış şifre | 401, `code: AUTH_INVALID_CREDENTIALS` |
| Rate limit (6. deneme) | POST | /api/auth/login | 5 başarısız + 1 | 429, `code: AUTH_RATE_LIMITED` |
| Get current user | GET | /api/auth/me | valid token | 200, `{id, email, role}` |
| No token | GET | /api/auth/me | — | 401, `code: AUTH_SESSION_EXPIRED` |
| Logout | POST | /api/auth/logout | valid token | 200, cookie temizlenir |
| Password reset | POST | /api/auth/reset-password | `{newPassword}` | 200, diğer session'lar invalidate |
| Audit log yazıldı | — | — | login sonrası | `audit_logs` tablosunda `auth.login` row |

**E2E:**
| Test | Akış | Assertion |
|------|------|-----------|
| Admin login | /login → email + password → submit | URL = /dashboard, topbar avatar görünür |
| Supervisor login | /login → email + password → submit | URL = /dashboard |
| Guest redirect | /dashboard direkt | URL = /login |
| Force password change | login (force_password_change=true) | URL = /change-password, dashboard erişimi bloklu |
| Session expiry | login → token expire simule → sayfa yenile | SessionExpiredModal görünür |
| Rate limit UI | 5 yanlış şifre | "Çok fazla deneme" mesajı görünür |

---

### 8.2 Dosya Yönetimi (PRD-003)

**Integration API:**
| Test | Method | Path | Input | Expected |
|------|--------|------|-------|----------|
| Upload PDF | POST | /api/files/upload | multipart form, 1MB PDF | 201, file kaydı DB'de |
| Upload 51MB | POST | /api/files/upload | 51MB dosya | 400, `code: FILE_TOO_LARGE` |
| Upload .exe | POST | /api/files/upload | test.exe | 400, `code: FILE_INVALID_TYPE` |
| List files | GET | /api/files | admin token | 200, `[{id, name, ...}]` |
| Supervisor upload | POST | /api/files/upload | supervisor token | 403, `code: AUTH_FORBIDDEN` |
| Update metadata | PUT | /api/files/[id] | `{is_public: true}` | 200, `is_public=true` |
| Soft delete | DELETE | /api/files/[id] | admin token | 200, `deleted_at` set |
| Restore | POST | /api/files/[id]/restore | admin token | 200, `deleted_at` null |
| Purge old | POST | /api/files/purge | admin token | 200, 30 günden eski silinir |
| Audit log | — | — | upload sonrası | `audit_logs`'da `file.upload` row |
| Notification | — | — | upload sonrası | Supervisor'lara `files` category bildirim |

**E2E:**
| Test | Akış | Assertion |
|------|------|-----------|
| Upload + view | Upload dialog → PDF seç → submit → listede görünür | Dosya listede, tıklayınca viewer açılır |
| Public toggle | Dosya → kebab menu → "Publish" | Public sayfada görünür |
| Delete + restore | Dosya → sil → çöp kutusu → restore | Tekrar listede |
| Sort order | Drag ile sıra değiştir | Sıra kaydedilir, sayfa yenilenince korunur |
| Blur pages | Dosya → blur ayarı → sayfa 2,3 seç | Public viewer'da o sayfalar bulanık |

---

### 8.3 Feedback (PRD-004)

**Integration API:**
| Test | Method | Path | Input | Expected |
|------|--------|------|-------|----------|
| Create general | POST | /api/feedback | `{file_id, content, feedback_type:'general'}` | 201, DB'de row |
| Create inline | POST | /api/feedback | `{..., feedback_type:'inline', line_ref:'2:15'}` | 201, `line_ref` kaydedildi |
| 2001 char | POST | /api/feedback | 2001 karakter content | 400, `code: FEEDBACK_TOO_LONG` |
| Guest submit | POST | /api/feedback | no token | 401 |
| Assistant submit | POST | /api/feedback | assistant token | 403 |
| Resolve | POST | /api/feedback/[id]/resolve | admin token | 200, `resolved=true, resolved_by` set |
| Supervisor resolve | POST | /api/feedback/[id]/resolve | supervisor token | 403 |
| Soft hide | DELETE | /api/feedback/[id] | admin token | 200, `is_hidden=true` (row hala var) |
| Email trigger | — | — | feedback sonrası | Dosya sahibine email (fire-and-forget) |

**E2E:**
| Test | Akış | Assertion |
|------|------|-----------|
| Write + see | Supervisor login → dosya aç → yorum yaz → submit | Yorum listede görünür |
| Inline | PDF'de metin seç → tooltip → yorum ekle | Sidebar'da inline yorum, tıklayınca scroll |
| Resolve toggle | Admin → resolve → yorum gizlenir → "göster" toggle | Toggle açınca tekrar görünür |
| Markdown render | `**bold** ve `code`` yaz | HTML'de `<strong>` ve `<code>` render |

---

### 8.4 Email & OTP (PRD-014)

**Unit:**
| Test | Dosya | Assertion |
|------|-------|-----------|
| AES encrypt → decrypt round-trip | mailer-crypto.test.ts | Orijinal şifre geri gelir |
| Encrypt farklı IV üretir | mailer-crypto.test.ts | İki encrypt farklı ciphertext |
| Template HTML valid | templates.test.ts | Her template `<html>` ve `</html>` içerir |
| Template plain text fallback | templates.test.ts | Her template text versiyonu var |

**Integration API:**
| Test | Method | Path | Input | Expected |
|------|--------|------|-------|----------|
| Save SMTP | POST | /api/settings/smtp | `{host, port, username, password}` | 200, password_enc DB'de şifreli |
| Get SMTP (no password) | GET | /api/settings/smtp | admin token | 200, password alanı yok |
| Non-admin SMTP | POST | /api/settings/smtp | supervisor token | 403 |
| Send OTP | POST | /api/public/feedback/otp | `{email: 'x@tedu.edu.tr', file_id}` | 200, `{otp_id}` |
| OTP non-tedu | POST | /api/public/feedback/otp | `{email: 'x@gmail.com'}` | 400, `code: EMAIL_DOMAIN_NOT_ALLOWED` |
| OTP rate limit | POST | /api/public/feedback/otp | 4. istek / 1 saat | 429, `code: EMAIL_OTP_RATE_LIMITED` |
| Verify OTP | POST | /api/public/feedback/otp/verify | `{otp_id, code}` | 200, `verified_at` set |
| Expired OTP | POST | /api/public/feedback/otp/verify | 10+ dk sonra | 403, `code: EMAIL_OTP_EXPIRED` |
| Wrong OTP code | POST | /api/public/feedback/otp/verify | yanlış 6 hane | 400, `code: EMAIL_OTP_INVALID` |
| Submit with OTP | POST | /api/public/feedback | `{otp_id, content, author_name}` | 201, `public_feedback`'te row |

---

### 8.5 Bildirimler (PRD-016)

**Integration API:**
| Test | Method | Path | Input | Expected |
|------|--------|------|-------|----------|
| List own | GET | /api/notifications | user token | 200, sadece kendi bildirimleri |
| Unread count | GET | /api/notifications/count | user token | 200, `{unread: N}` |
| Mark read (ids) | POST | /api/notifications/read | `{ids: ['uuid1']}` | 200, is_read=true |
| Mark all read | POST | /api/notifications/read | `{all: true}` | 200, tüm is_read=true |
| RLS cross-user | GET | /api/notifications | user A token | Sadece user A'nın bildirimleri, B'ninkiler yok |
| Trigger: file upload | — | — | dosya yüklenince | Supervisor'lara `files` bildirim |
| Trigger: feedback | — | — | feedback yazılınca | Dosya sahibine `feedback` bildirim |
| Self-notification yok | — | — | admin kendi dosyasına feedback yazar | Admin'e bildirim gitmez |

---

### 8.6 Monitor (PRD-007)

**Integration API:**
| Test | Method | Path | Expected |
|------|--------|------|----------|
| Public health | GET | /api/health | 200, `{status: 'ok'}` (auth yok) |
| Detailed (admin) | GET | /api/health/detailed | 200, `{services, db_counts, stats_24h}` |
| Detailed (supervisor) | GET | /api/health/detailed | 403 |
| Detailed (no auth) | GET | /api/health/detailed | 401 |
| Service format | GET | /api/health/detailed | Her service: `{status, latency_ms}` |
| DB counts | GET | /api/health/detailed | `db_counts` keys: user_profiles, files, feedbacks, audit_logs, error_logs |

---

### 8.7 Raporlar & Deliverables (PRD-015)

**Integration API:**
| Test | Method | Path | Input | Expected |
|------|--------|------|-------|----------|
| Create deliverable | POST (via admin) | — | `{title, deadline, status}` | 201, DB'de row |
| Update assigned_to | PUT | /api/reports/[id] | `{assigned_to: userId}` | 200, email + notification tetiklenir |
| Add checklist item | POST | /api/reports/[id]/checklist | `{label}` | 201, sort_order otomatik |
| Toggle checklist | PUT | /api/reports/[id]/checklist/[itemId] | `{is_checked: true}` | 200, checked_by set |
| Delete checklist | DELETE | /api/reports/[id]/checklist/[itemId] | — | 200, row silinir |

---

### 8.8 Settings (PRD-010)

**E2E:**
| Test | Akış | Assertion |
|------|------|-----------|
| Theme change | Settings → Appearance → Dark | Tema anında değişir, sayfa yenilenince korunur |
| Profile update | Settings → Profile → isim değiştir → save | Topbar'daki isim güncellenir |
| Avatar upload | Settings → Profile → avatar seç → upload | Yeni avatar topbar'da görünür |
| Password change | Settings → Account → eski + yeni şifre → submit | Başarı mesajı, diğer session'lar kapanır |
| User management | Settings → Users → kullanıcı ekle → rol ata | Yeni kullanıcı listede, welcome email gönderilir |
| SMTP config | Settings → Integrations → SMTP bilgileri → test | Bağlantı başarılı badge |

---

## 9. RLS Policy Test Matrisi

Her tablo × her rol kombinasyonu test edilir:

| Tablo | Anon | Assistant | Supervisor | Admin | Service Role |
|-------|------|-----------|------------|-------|-------------|
| user_profiles SELECT | ❌ | Sadece kendi | Sadece kendi | Hepsi | Hepsi |
| user_profiles INSERT | ❌ | ❌ | ❌ | ❌ | ✅ |
| user_profiles UPDATE | ❌ | Sadece kendi | Sadece kendi | Hepsi | Hepsi |
| files SELECT | Public olanlar | Hepsi | Hepsi | Hepsi | Hepsi |
| files INSERT | ❌ | ❌ | ❌ | ✅ | ✅ |
| files UPDATE | ❌ | ❌ | ❌ | ✅ | ✅ |
| files DELETE | ❌ | ❌ | ❌ | ✅ | ✅ |
| feedbacks SELECT | is_hidden=false | is_hidden=false | is_hidden=false | Hepsi | Hepsi |
| feedbacks INSERT | ❌ | ❌ | ✅ | ✅ | ✅ |
| audit_logs SELECT | ❌ | ❌ | ❌ | ✅ | ✅ |
| audit_logs INSERT | ❌ | ❌ | ❌ | ❌ | ✅ |
| notifications SELECT | ❌ | Sadece kendi | Sadece kendi | Sadece kendi | Hepsi |
| notifications UPDATE | ❌ | Sadece kendi | Sadece kendi | Sadece kendi | Hepsi |
| report_deliverables SELECT | ❌ | ✅ | ✅ | ✅ | ✅ |

**Test pattern:**
```typescript
describe('RLS: files', () => {
  it('anon can only read public files', async () => {
    const { data } = await anonClient.from('files').select();
    expect(data!.every(f => f.is_public === true)).toBe(true);
  });

  it('supervisor cannot insert files', async () => {
    const { error } = await supervisorClient.from('files').insert({...});
    expect(error).toBeTruthy();
    expect(error!.code).toBe('42501'); // RLS violation
  });
});
```

---

## 10. Security Test Spesifikasyonları

### 10.1 XSS Prevention

```typescript
// tests/security/xss.spec.ts
const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><script>alert(1)</script>',
  "'; DROP TABLE users; --",
  '{{constructor.constructor("return this")()}}',
];

test('feedback content sanitized', async ({ page }) => {
  // Supervisor login → feedback yaz (XSS payload) → submit
  // Sayfa render → script execute olmadığını doğrula
  for (const payload of XSS_PAYLOADS) {
    await createFeedback(payload);
    await page.goto(`/docs/test`);
    // Script çalışmadıysa alert dialog yok
    const dialog = await page.waitForEvent('dialog', { timeout: 1000 }).catch(() => null);
    expect(dialog).toBeNull();
  }
});
```

Test edilecek input alanları:
- Feedback content (PRD-004)
- User full_name (PRD-001)
- File display_name (PRD-003)
- Deliverable title (PRD-015)
- Notification title/description (PRD-016)

### 10.2 SQL Injection

```typescript
// tests/security/injection.spec.ts
const SQL_PAYLOADS = [
  "'; DROP TABLE user_profiles; --",
  "' OR '1'='1",
  "1; SELECT * FROM auth.users; --",
];

test('search parameter safe from injection', async () => {
  for (const payload of SQL_PAYLOADS) {
    const res = await apiCall('GET', `/api/users?search=${encodeURIComponent(payload)}`, null, adminToken);
    // 200 dönmeli (injection başarısız, normal arama yapılır)
    // VEYA 400 (validation hatası) — ama asla 500 değil
    expect(res.status).not.toBe(500);
  }
});
```

### 10.3 Auth Bypass

```typescript
// tests/security/auth-bypass.spec.ts
test('expired token rejected', async () => {
  // Manually crafted expired JWT
  const res = await apiCall('GET', '/api/auth/me', null, EXPIRED_TOKEN);
  expect(res.status).toBe(401);
});

test('manipulated role in token rejected', async () => {
  // JWT with role=admin but signed with wrong key
  const res = await apiCall('GET', '/api/users', null, TAMPERED_TOKEN);
  expect(res.status).toBe(401);
});

test('cross-user data access blocked', async () => {
  // User A token → User B's notifications
  const res = await apiCall('GET', '/api/notifications', null, userAToken);
  const hasOtherUser = res.body.some(n => n.user_id !== userAId);
  expect(hasOtherUser).toBe(false);
});
```

### 10.4 Rate Limit Verification

| Endpoint | Limit | Test |
|----------|-------|------|
| POST /api/auth/login | 5 / 15dk / IP | 6. istek → 429 |
| POST /api/public/feedback/otp | 3 / 1 saat / email | 4. istek → 429 |
| POST /api/public/files/access-link | 3 / 1 saat / email | 4. istek → 429 |
| POST /api/public/feedback | 5 / 1 saat / IP | 6. istek → 429 |

---

## 11. DB Migration Testleri

```typescript
// tests/integration/db/migrations.test.ts
import { readdir } from 'fs/promises';
import { join } from 'path';

describe('Migration file integrity', () => {
  it('all migration files have valid timestamp prefix', async () => {
    const files = await readdir(join(process.cwd(), 'supabase/migrations'));
    const pattern = /^\d{14}_\w+\.sql$/;
    for (const file of files) {
      expect(file).toMatch(pattern);
    }
  });

  it('migration timestamps are in chronological order', async () => {
    const files = await readdir(join(process.cwd(), 'supabase/migrations'));
    const timestamps = files.map(f => f.slice(0, 14)).sort();
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it('no duplicate migration timestamps', async () => {
    const files = await readdir(join(process.cwd(), 'supabase/migrations'));
    const timestamps = files.map(f => f.slice(0, 14));
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });

  it('supabase db push succeeds (dry run)', async () => {
    // CI'da: supabase db push --dry-run
    // Eğer local migration dosyaları remote ile uyumsuzsa fail olur
  });
});
```

---

## 12. CI Pipeline

### 12.1 GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  pull_request:
    branches: [develop, main]

jobs:
  unit-and-integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx supabase start
      - run: npx supabase db reset
      - run: npm run test:coverage
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_LOCAL_SERVICE_KEY }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_LOCAL_ANON_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx supabase start
      - run: npx supabase db reset
      - run: npx playwright install --with-deps chromium
      - run: npm run build
      - run: npm run test:e2e
        env:
          SUPABASE_URL: http://localhost:54321
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: test-results/

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx supabase start && npx supabase db reset
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test tests/security/
```

### 12.2 npm Scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration --no-threads",
    "test:e2e": "playwright test tests/e2e",
    "test:e2e:ui": "playwright test --ui",
    "test:security": "playwright test tests/security",
    "test:visual": "playwright test tests/e2e/visual",
    "test:all": "npm run test:coverage && npm run test:e2e && npm run test:security",
    "validate": "tsc --noEmit && npm run lint && npm run test:coverage",
    "validate:prd": "node scripts/validate-prd-interfaces.js"
  }
}
```

### 12.3 PR Merge Kuralları

| Kontrol | Zorunlu? | Fail Davranışı |
|---------|----------|----------------|
| `tsc --noEmit` | Evet | PR merge bloklı |
| `npm run lint` | Evet | PR merge bloklı |
| Unit + Integration coverage | Evet | Threshold altında → bloklı |
| E2E testler | Evet | Fail → bloklı (retry 2×) |
| Security testler | Hayır | Fail → uyarı (bloklı değil) |
| Visual regression | Hayır | Fail → bilgilendirme |
| `validate:prd` | Evet | Interface mismatch → bloklı |

---

## 13. Test İzolasyon Kuralları

| Konu | Strateji |
|------|----------|
| **DB state** | Integration: `beforeAll` kendi verisini oluşturur, `afterAll` temizler. E2E: `supabase db reset` her run öncesi |
| **Parallel** | Unit: Vitest parallel. Integration: seri (`--no-threads`). E2E: Playwright per-file parallel |
| **Hassas veri** | Auth: gerçek local Supabase token. SMTP: MSW mock. Sentry: boş DSN |
| **Network** | Unit: MSW ile izole. Integration: local Supabase only. E2E: full stack local |
| **Timeout** | Unit: 5s. Integration: 10s. E2E: 30s. Security: 60s |
| **Test user prefix** | Integration testleri `test_` prefix'li email kullanır |

---

## 14. Visual Regression

Playwright screenshot comparison:

```typescript
// tests/e2e/visual/login.spec.ts
test('login page light', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveScreenshot('login-light.png', { maxDiffPixels: 100 });
});

test('login page dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/login');
  await expect(page).toHaveScreenshot('login-dark.png', { maxDiffPixels: 100 });
});
```

**Test edilen sayfalar:** login, dashboard, public docs, settings, monitor
**Kural:** Snapshot update PR'da explicit yapılır. CI'da `--update-snapshots` kullanılmaz.

---

## 15. PWA & Offline Testleri (PRD-008)

```typescript
// tests/e2e/pwa.spec.ts
test('offline banner appears', async ({ page, context }) => {
  await page.goto('/');
  await context.setOffline(true);
  await expect(page.locator('[data-testid="offline-banner"]')).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('[data-testid="offline-banner"]')).not.toBeVisible();
});

test('public docs cached offline', async ({ page, context }) => {
  await page.goto('/'); // cache dolsun
  await context.setOffline(true);
  await page.goto('/');
  // Sayfa yüklenmeli (service worker cache'ten)
  await expect(page.locator('[data-testid="file-tree"]')).toBeVisible();
});

test('authenticated route shows offline page', async ({ page, context }) => {
  await loginAsAdmin(page);
  await context.setOffline(true);
  await page.goto('/dashboard');
  await expect(page.locator('text=Bağlantı gerekli')).toBeVisible();
});

test('no horizontal scroll on 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
```

---

## 16. Faz 2 Test Stratejisi (PRD-013 — gelecek)

Faz 2 aktif olduğunda bu bölüm genişletilir. Şimdilik placeholder:

| Katman | Konu | Yaklaşım |
|--------|------|----------|
| Unit | Risk score hesaplama | Mock detection data → score doğru mu |
| Unit | FPS state machine | State transition tablosu vs fonksiyon çıktısı |
| Integration | AI health check | Mock AI servis → /api/health/detailed doğru mu |
| Integration | Incident CRUD | POST /api/sessions/[id]/incidents → DB row |
| E2E | Sınav wizard | 5 adım tamamlama akışı |
| E2E | Canlı izleme | Mock WebSocket → overlay render |
| Security | RTSP URL maskeleme | API response'da stream_url görünmemeli |
| Performance | 40 öğrenci mock data | Dashboard render < 200ms |
