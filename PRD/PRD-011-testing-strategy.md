# PRD-011 — Testing Strategy & Test Infrastructure
**Version:** 1.0
**Owner:** HorusEye Team
**Dependencies:** PRD-000, PRD-005
**Blocks:** —
**Status:** ACTIVE

---

<!-- INTERFACE_DEPS
AuthUser: @1.0
HorusFile: @1.0
Feedback: @1.0
LogEvent: @1.0
-->

## ⚠️ LLM INSTRUCTION
Tests must NOT use mocked Supabase clients for integration tests — use the local Supabase Docker instance.
Unit tests mock only external services (Sentry, email provider).
Every new feature must include tests at the appropriate layer before the PR is marked ready.
Coverage thresholds defined in Section 5 are enforced in CI — PRs that drop below threshold are blocked.
Interface dependencies are declared in the INTERFACE_DEPS block above. If PRD-000 version changes, update this block or `validate:prd` will fail.

---

## 1. Purpose

Define a layered, deterministic test strategy that catches regressions at every level of the stack. The goal: if all tests pass, the system works as specified. No manual regression testing should be required before deployment.

---

## 2. Three-Layer Test Architecture

```
Layer 3: E2E Tests (Playwright)
  └── Full user flows in a real browser, against local Supabase
      Examples: Login → Upload file → Add feedback → Logout

Layer 2: Integration Tests (Vitest + Supabase local)
  └── API routes and server actions, against real local DB
      Examples: POST /api/users creates a user_profile row

Layer 1: Unit Tests (Vitest)
  └── Pure functions, utilities, hooks, component rendering
      Examples: logger formats correctly, RBAC guard blocks unauthorized role
```

**Rule:** Test at the lowest layer that gives you confidence. Do not write an E2E test for something a unit test can verify.

---

## 3. Tools & Setup

| Tool | Purpose | Version |
|------|---------|---------|
| Vitest | Unit + integration test runner | latest |
| @testing-library/react | Component rendering tests | latest |
| Playwright | E2E browser tests | latest |
| @playwright/test | Playwright test utilities | latest |
| MSW (Mock Service Worker) | Mock external HTTP APIs in unit tests | latest |
| Supabase CLI | Local Supabase for integration/E2E | latest |

### Install

```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/user-event
npm install -D playwright @playwright/test
npm install -D msw
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
    setupFiles:  ['./tests/setup.ts'],
    globals:     true,
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'lcov'],
      thresholds: { lines: 70, functions: 70, branches: 65, statements: 70 }
    }
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') }
  }
});
```

### Playwright Config (`playwright.config.ts`)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir:              './tests/e2e',
  fullyParallel:        true,
  forbidOnly:           !!process.env.CI,
  retries:              process.env.CI ? 2 : 0,
  reporter:             'html',
  use: {
    baseURL:  'http://localhost:3000',
    trace:    'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url:     'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  }
});
```

---

## 4. Folder Structure

> **Status as of 2026-03-18.** ✅ = implemented, ⏳ = pending (Phase 1+)

```
tests/
├── setup.ts                          ✅ Global test setup (env vars, jest-dom)
├── unit/
│   ├── canAccess.test.ts             ✅ canAccess guard (quick smoke tests)
│   ├── lib/
│   │   ├── logger.test.ts            ✅ log(), severity helpers
│   │   ├── auth-utils.test.ts        ✅ canAccess, requireRole
│   │   ├── file-utils.test.ts        ✅ getFileType, formatFileSize, isAllowedMimeType
│   │   └── switchTheme.test.ts       ✅ View Transition API + fallback
│   ├── components/
│   │   ├── ErrorBoundary.test.tsx    ⏳ Error boundary rendering
│   │   ├── TopbarUserMenu.test.tsx   ⏳ Avatar dropdown
│   │   └── ThemeToggle.test.tsx      ⏳ Theme switching
│   └── hooks/
│       └── usePageTracking.test.ts   ✅ fetch mock, pathname dedup
├── integration/
│   ├── api/
│   │   ├── auth.test.ts              ✅ /api/auth/me (401), login error handling
│   │   ├── health.test.ts            ✅ /api/health response shape
│   │   ├── users.test.ts             ⏳ GET/POST/PUT/DELETE /api/users
│   │   └── files.test.ts             ⏳ File upload, delete, list
│   └── db/
│       ├── rls-policies.test.ts      ✅ RLS blocks anon reads, service_role writes
│       └── audit-logs.test.ts        ✅ Severity constraints, jsonb metadata
└── e2e/
    ├── auth.spec.ts                  ✅ Redirect flow, login validation, invalid credentials
    ├── monitor.spec.ts               ✅ /api/health shape, /monitor redirect
    ├── file-management.spec.ts       ⏳ Upload, download, delete flow
    ├── feedback.spec.ts              ⏳ Add feedback, resolve, inline
    ├── settings.spec.ts              ⏳ Theme toggle, profile update, user mgmt
    └── pwa.spec.ts                   ⏳ Offline behavior, install prompt
```

---

## 5. Coverage Thresholds

| Layer | Line Coverage Target |
|-------|---------------------|
| Unit | ≥ 80% |
| Integration | ≥ 70% (critical paths) |
| E2E | Key user flows (not percentage-based) |

CI blocks merge if unit/integration coverage drops below threshold.

---

## 6. Integration Tests — Supabase Local

Integration tests run against local Supabase Docker (started by CI via `supabase start`).

```typescript
// tests/integration/api/auth.test.ts
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

describe('POST /api/auth/login', () => {
  it('returns session for valid credentials', async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@horuseye.com', password: 'Test1234!' })
    });
    expect(res.status).toBe(200);
    const { session } = await res.json();
    expect(session.access_token).toBeDefined();
  });

  it('writes audit_log on success', async () => {
    // ... check audit_logs table via service_role client
    const { data } = await supabase
      .from('audit_logs')
      .select()
      .eq('event_type', 'auth.login')
      .order('created_at', { ascending: false })
      .limit(1);
    expect(data?.[0]).toBeDefined();
  });

  it('blocks after 5 failed attempts', async () => {
    // ... 5 bad logins, 6th should return 429
  });
});
```

**Test isolation:** Each test suite uses a dedicated test user, created in `beforeAll` and deleted in `afterAll` via `service_role`.

---

## 7. RLS Policy Tests

```typescript
// tests/integration/db/rls-policies.test.ts
// Verifies that RLS policies are correctly restricting access

describe('RLS: user_profiles', () => {
  it('supervisor cannot read other users profiles', async () => {
    const supervisorClient = createClientWithRole('supervisor');
    const { data, error } = await supervisorClient.from('user_profiles').select();
    // Should only return own profile
    expect(data?.length).toBe(1);
    expect(data?.[0].id).toBe(supervisorUserId);
  });

  it('admin can read all profiles', async () => {
    const adminClient = createClientWithRole('admin');
    const { data } = await adminClient.from('user_profiles').select();
    expect(data!.length).toBeGreaterThan(1);
  });
});
```

---

## 8. E2E Test Examples

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

test('admin login flow', async ({ page }) => {
  await page.goto('/login');
  await page.fill('[name="email"]', 'admin@horuseye.com');
  await page.fill('[name="password"]', 'Test1234!');
  await page.click('[type="submit"]');
  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('[data-testid="topbar-avatar"]')).toBeVisible();
});

test('guest cannot access dashboard', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL('/login');
});

test('rate limiting blocks after 5 failed attempts', async ({ page }) => {
  await page.goto('/login');
  for (let i = 0; i < 5; i++) {
    await page.fill('[name="email"]', 'test@horuseye.com');
    await page.fill('[name="password"]', 'wrongpassword');
    await page.click('[type="submit"]');
  }
  await expect(page.locator('[data-testid="rate-limit-message"]')).toBeVisible();
});
```

---

## 9. npm Scripts

```json
{
  "scripts": {
    "test":              "vitest run",
    "test:watch":        "vitest",
    "test:ui":           "vitest --ui",
    "test:coverage":     "vitest run --coverage",
    "test:integration":  "vitest run tests/integration",
    "test:e2e":          "playwright test",
    "test:e2e:ui":       "playwright test --ui",
    "validate":          "tsc --noEmit && npm run lint && npm run test:coverage"
  }
}
```

`npm run validate` is the single command CI runs on every PR. It must pass entirely.

---

## 10. CI Integration (PRD-005 extension)

Addition to `.github/workflows/ci.yml`:

```yaml
- name: Start Supabase local
  run: supabase start

- name: Run seed data
  run: supabase db reset

- name: Run unit + integration tests
  run: npm run test:coverage

- name: Run E2E tests
  run: npm run test:e2e
  env:
    PLAYWRIGHT_BASE_URL: http://localhost:3000

- name: Upload coverage report
  uses: actions/upload-artifact@v4
  with:
    name: coverage
    path: coverage/lcov.info
```

---

## 11. Test Data & Seeding

```sql
-- supabase/seed.sql (used by supabase db reset in tests)

-- Test users (passwords are set via Supabase Auth Admin API in seed script)
INSERT INTO public.user_profiles (id, email, full_name, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@horuseye.com',      'Test Admin',      'admin'),
  ('00000000-0000-0000-0000-000000000002', 'supervisor@horuseye.com', 'Test Supervisor', 'supervisor'),
  ('00000000-0000-0000-0000-000000000003', 'assistant@horuseye.com',  'Test Assistant',  'assistant');

-- Test files
INSERT INTO public.files (id, name, display_name, file_type, is_public, uploaded_by) VALUES
  ('10000000-0000-0000-0000-000000000001', 'test.pdf', 'Test Document', 'pdf', true,
   '00000000-0000-0000-0000-000000000001');
```
