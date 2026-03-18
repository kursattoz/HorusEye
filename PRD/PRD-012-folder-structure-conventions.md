# PRD-012 — Folder Structure & Code Conventions
**Version:** 1.0
**Owner:** HorusEye Team
**Dependencies:** PRD-000, PRD-005, PRD-009
**Blocks:** —
**Status:** ACTIVE

---

<!-- INTERFACE_DEPS
-->
<!-- PRD-012 defines conventions only — no shared interfaces consumed from PRD-000. -->

## ⚠️ LLM INSTRUCTION
This PRD defines the **exact, non-negotiable** folder structure for the project.
When generating any file path, always check it against this document.
Do not create files outside the defined structure without updating this PRD first.
Import aliases (`@/`) always resolve from the project root — never use relative paths beyond one level (`../`).

---

## 1. Complete Folder Structure

> **Actual implementation state (2026-03-18).** Items marked `[DEVIATION]` differ from the original spec — these are intentional decisions, not errors.

```
horuseye-portal/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                     ← PR validation (lint, type, test, e2e, build)
│   │   ├── staging.yml                ← Auto-deploy on develop merge
│   │   └── production.yml             ← Manual-approval deploy on main merge
│   └── PULL_REQUEST_TEMPLATE.md
│
├── app/                               ← Next.js App Router
│   ├── (public)/                      ← Guest-accessible public area
│   │   ├── page.tsx                   ← / (landing + public docs)
│   │   └── docs/
│   │       └── [slug]/
│   │           └── page.tsx           ← /docs/[slug]
│   │
│   ├── (auth)/                        ← [DEVIATION] Auth UI routes (login, change-password)
│   │   ├── layout.tsx                 ← Minimal layout (no sidebar/topbar)
│   │   ├── login/
│   │   │   └── page.tsx               ← /login
│   │   └── change-password/
│   │       └── page.tsx               ← /change-password (force-reset flow)
│   │
│   ├── (protected)/                   ← Auth-required routes
│   │   ├── layout.tsx                 ← Auth guard + app shell (sidebar, topbar)
│   │   ├── dashboard/
│   │   │   └── page.tsx               ← /dashboard
│   │   ├── files/                     ← [DEVIATION] Flat route — was /dashboard/files
│   │   │   └── page.tsx               ← /files (admin only)
│   │   ├── team/                      ← [DEVIATION] Flat route — was /dashboard/team
│   │   │   └── page.tsx               ← /team (admin only)
│   │   ├── feedback/                  ← [DEVIATION] Flat route — was /dashboard/feedback
│   │   │   └── page.tsx               ← /feedback
│   │   ├── notifications/             ← /notifications
│   │   │   └── page.tsx
│   │   ├── settings/
│   │   │   └── page.tsx               ← /settings (all roles)
│   │   └── dev/
│   │       └── monitor/
│   │           └── page.tsx           ← /dev/monitor (admin only)
│   │
│   ├── actions/                       ← Next.js Server Actions
│   │   └── auth.ts                    ← loginAction, logoutAction, getCurrentUser, changePasswordAction
│   │
│   ├── api/                           ← API Routes
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   ├── logout/route.ts
│   │   │   └── me/route.ts
│   │   ├── users/
│   │   │   ├── route.ts               ← GET (list), POST (create)
│   │   │   ├── avatar/route.ts        ← POST (avatar upload)
│   │   │   └── [id]/
│   │   │       ├── route.ts           ← PUT, DELETE
│   │   │       └── reset/route.ts     ← POST (send reset email)
│   │   ├── files/
│   │   │   ├── route.ts               ← GET (list)
│   │   │   ├── upload/route.ts        ← POST (upload)
│   │   │   └── [id]/route.ts          ← GET, DELETE
│   │   ├── public/
│   │   │   ├── files/route.ts         ← Public file list (no auth)
│   │   │   ├── files/[slug]/route.ts  ← Public file by slug
│   │   │   └── feedback/route.ts      ← Public feedback list
│   │   ├── feedback/
│   │   │   ├── route.ts               ← GET (list), POST (create)
│   │   │   └── [id]/
│   │   │       ├── route.ts           ← PUT, DELETE
│   │   │       └── resolve/route.ts   ← POST (mark resolved)
│   │   ├── log/
│   │   │   └── page/route.ts          ← POST (page.visit event logging)
│   │   └── health/
│   │       └── route.ts               ← GET /api/health (public)
│   │
│   ├── layout.tsx                     ← Root layout (ThemeProvider, fonts)
│   ├── globals.css                    ← Design tokens via @theme inline (Tailwind v4)
│   ├── error.tsx                      ← Root error boundary
│   └── not-found.tsx                  ← 404 page
│
├── components/
│   ├── ui/                            ← shadcn/ui generated components (DO NOT EDIT)
│   │   └── ... (all shadcn components)
│   │
│   ├── layout/                        ← App shell components
│   │   ├── AppSidebar.tsx
│   │   ├── Topbar.tsx
│   │   ├── TopbarUserMenu.tsx
│   │   ├── ThemeToggle.tsx
│   │   ├── BottomNav.tsx
│   │   └── PageContainer.tsx
│   │
│   ├── auth/                          ← Auth-specific UI
│   │   └── LoginForm.tsx
│   │
│   ├── public/                        ← Public area components
│   ├── dashboard/                     ← Dashboard-specific components
│   ├── settings/                      ← Settings page tabs
│   ├── monitor/                       ← Monitor dashboard components
│   │
│   ├── error/
│   │   └── ErrorBoundary.tsx          ← React error boundary (PRD-006)
│   │
│   └── pwa/
│       └── InstallPrompt.tsx          ← PWA install banner (PRD-008)
│
├── lib/                               ← Shared utilities & clients
│   ├── supabase/
│   │   ├── client.ts                  ← Browser Supabase client (singleton)
│   │   ├── server.ts                  ← Server-side Supabase client (with service_role option)
│   │   └── middleware.ts              ← Supabase session refresh for proxy.ts
│   ├── auth/
│   │   └── guards.ts                  ← RBAC guard functions (canAccess, requireRole)
│   │                                  ← [DEVIATION] session.ts removed — getCurrentUser() is in app/actions/auth.ts
│   ├── logger/
│   │   └── index.ts                   ← Two-layer logger (Sentry + Supabase) (PRD-006)
│   └── utils/
│       ├── cn.ts                      ← Tailwind class merge utility
│       ├── file.ts                    ← File type helpers, size formatters
│       ├── date.ts                    ← Date formatting helpers
│       └── switchTheme.ts             ← View Transition API wrapper for theme changes
│
├── hooks/                             ← Custom React hooks
│   ├── usePageTracking.ts             ← Auto page visit logging (PRD-006)
│   ├── useCurrentUser.ts              ← Current user via GET /api/auth/me
│   ├── useTheme.ts                    ← Re-export from next-themes
│   └── usePWAInstall.ts               ← beforeinstallprompt handler (PRD-008)
│
├── types/                             ← Global TypeScript types
│   └── index.ts                       ← [DEVIATION] All PRD-000 interfaces consolidated here
│                                      ←   (not split into auth.ts/files.ts/logs.ts)
│
├── constants/
│   ├── permissions.ts                 ← PERMISSION_MATRIX (PRD-010)
│   ├── routes.ts                      ← All route paths as constants (flat routes)
│   └── config.ts                      ← Feature flags, app config
│
├── supabase/
│   ├── migrations/                    ← All DB migrations (append-only)
│   │   ├── 20240001_user_profiles.sql       ← user_profiles table + RLS
│   │   ├── 20240002_logging_tables.sql      ← audit_logs + error_logs + indexes
│   │   └── 20240003_user_profiles_extend.sql ← force_password_change + color_theme columns
│   └── seed.sql                       ← Test data for local dev + CI
│
├── tests/
│   ├── setup.ts                       ← Global test setup (env vars, jest-dom)
│   ├── unit/
│   │   ├── lib/
│   │   │   ├── file-utils.test.ts     ← getFileType, formatFileSize, isAllowedMimeType
│   │   │   ├── logger.test.ts         ← log(), severity helpers
│   │   │   ├── auth-utils.test.ts     ← canAccess, requireRole
│   │   │   └── switchTheme.test.ts    ← View Transition API fallback
│   │   ├── components/                ← (pending: ErrorBoundary, TopbarUserMenu, ThemeToggle)
│   │   └── hooks/
│   │       └── usePageTracking.test.ts
│   ├── integration/
│   │   ├── api/
│   │   │   ├── auth.test.ts           ← /api/auth/* routes
│   │   │   └── health.test.ts         ← /api/health
│   │   └── db/
│   │       ├── rls-policies.test.ts   ← RLS blocks anon reads
│   │       └── audit-logs.test.ts     ← DB constraints + jsonb
│   └── e2e/
│       ├── auth.spec.ts               ← Login flow, redirects
│       └── monitor.spec.ts            ← /api/health, /monitor redirect
│
├── public/
│   ├── manifest.json                  ← PWA manifest (PRD-008)
│   └── icons/
│       ├── icon-192.png               ← Generated from favicon.svg via sharp
│       ├── icon-512.png
│       └── icon-512-maskable.png
│
├── scripts/
│   └── validate-prd-interfaces.js     ← PRD interface version checker
│
├── .husky/
│   └── pre-commit                     ← Runs validate:prd before every commit
│
├── proxy.ts                           ← [DEVIATION] Next.js middleware (named proxy.ts not middleware.ts)
│                                      ←   Exports `proxy` fn + config.matcher. Works identically.
├── next.config.ts                     ← [DEVIATION] TypeScript config (not .js)
├── eslint.config.mjs                  ← [DEVIATION] Flat ESLint config (not .eslintrc.json)
├── postcss.config.mjs                 ← PostCSS config for Tailwind v4
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
├── .env.example
└── package.json
```

### Known Intentional Deviations

| Item | PRD Spec | Actual | Reason |
|------|----------|--------|--------|
| `proxy.ts` | `middleware.ts` | `proxy.ts` | Renamed early in project; Next.js picks it up via `export { proxy as middleware }` |
| Route structure | `/dashboard/files`, `/dashboard/team`, `/dashboard/feedback` | `/files`, `/team`, `/feedback` | Flat routes cleaner for UX; sidebar nav unchanged |
| Auth UI group | `(public)/login` | `(auth)/login` | Separate layout group for auth pages (no sidebar) |
| Types file | `types/auth.ts`, `types/files.ts`, etc. | `types/index.ts` | Consolidated for simplicity; re-export pattern if splitting needed later |
| Session helper | `lib/auth/session.ts` | `app/actions/auth.ts` | `getCurrentUser()` is a server action — correct location for App Router pattern |
| Tailwind config | `tailwind.config.ts` | None (uses `@theme inline` in globals.css) | Tailwind v4 — config file is optional |
| ESLint config | `.eslintrc.json` | `eslint.config.mjs` | ESLint v9 flat config format |
| Next config | `next.config.js` | `next.config.ts` | TypeScript config preferred |

---

## 2. Import Alias

Always use `@/` which resolves to the project root.

```typescript
// ✅ Correct
import { log } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import type { AuthUser } from '@/types/auth';

// ❌ Wrong — never use deep relative paths
import { log } from '../../../lib/logger';
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] },
    "strict": true
  }
}
```

---

## 3. Naming Conventions

| Item | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `FileUploadDialog.tsx` |
| Hooks | camelCase, `use` prefix | `useCurrentUser.ts` |
| Utilities | camelCase | `cn.ts`, `file.ts` |
| Types | PascalCase | `AuthUser`, `HorusFile` |
| Constants | SCREAMING_SNAKE_CASE for objects, camelCase for values | `PERMISSION_MATRIX`, `routes.dashboard` |
| API routes | kebab-case directories | `reset-password/route.ts` |
| Test files | same name as file + `.test.ts` / `.spec.ts` | `logger.test.ts`, `auth.spec.ts` |
| DB migrations | `[timestamp]_[description].sql` | `20250101000001_create_user_profiles.sql` |
| CSS classes | Tailwind only, no custom class names | `className="flex items-center gap-4"` |

---

## 4. TypeScript Rules

```json
// tsconfig.json — strict settings enforced
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

**Rules:**
- No `any` type. Use `unknown` and narrow it.
- All API responses must have typed return shapes.
- Database types are auto-generated via `supabase gen types typescript` — never write them manually.
- PRD-000 interface contracts must be reflected in `types/` files exactly.

---

## 5. Self-Validation System

The following commands must all pass before any PR is merged (enforced in CI):

```bash
npm run validate
# Runs:
#   1. tsc --noEmit         → TypeScript: zero errors, zero type violations
#   2. eslint .             → ESLint: zero warnings (warnings = errors in CI)
#   3. npm run test:coverage → Vitest: all tests pass, coverage above threshold
#   4. supabase db lint     → SQL: migration files are valid
```

**Dependency safety rules (enforced by ESLint rules):**
- `eslint-plugin-import`: no circular dependencies
- `eslint-plugin-no-restricted-imports`: cannot import from `app/` in `lib/` or `types/`
- `@typescript-eslint/no-floating-promises`: all async calls must be awaited or `.catch()`-ed

**When a new PRD interface is added to PRD-000:**
1. Add type to `types/` files
2. Run `tsc --noEmit` → zero errors
3. If `tsc` fails → the interface is not yet implemented → do not merge

This is the self-checking mechanism: TypeScript compilation failure = broken dependency = blocked PR.

---

## 6. Environment Files

```bash
# .env.example — commit this file with all keys but no values

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # Server-side only — never expose to client

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=                # CI/CD only

# App
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_ENV=                  # local | staging | production

# Feature Flags
NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false   # Keep false until PRD-013 is implemented
```

`.env.local` is git-ignored. Never commit secrets.
CI reads from GitHub Secrets (see PRD-005 Section 7).
