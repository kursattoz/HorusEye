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

```
horuseye-portal/
│
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                     ← PR validation (lint, type, test)
│   │   ├── staging.yml                ← Auto-deploy on develop merge
│   │   └── production.yml             ← Manual-approval deploy on main merge
│   └── PULL_REQUEST_TEMPLATE.md
│
├── app/                               ← Next.js App Router
│   ├── (public)/                      ← Guest-accessible routes (no auth required)
│   │   ├── page.tsx                   ← / (landing + public docs)
│   │   ├── docs/
│   │   │   └── [slug]/
│   │   │       └── page.tsx           ← /docs/[slug]
│   │   └── login/
│   │       └── page.tsx               ← /login
│   │
│   ├── (protected)/                   ← Auth-required routes
│   │   ├── layout.tsx                 ← Auth guard + app shell (sidebar, topbar)
│   │   ├── dashboard/
│   │   │   ├── page.tsx               ← /dashboard
│   │   │   ├── files/
│   │   │   │   └── page.tsx           ← /dashboard/files (admin only)
│   │   │   ├── team/
│   │   │   │   └── page.tsx           ← /dashboard/team (admin only)
│   │   │   └── feedback/
│   │   │       └── page.tsx           ← /dashboard/feedback
│   │   ├── settings/
│   │   │   └── page.tsx               ← /settings (all roles)
│   │   └── dev/
│   │       └── monitor/
│   │           └── page.tsx           ← /dev/monitor (admin only)
│   │
│   ├── api/                           ← API Routes
│   │   ├── auth/
│   │   │   ├── login/route.ts
│   │   │   ├── logout/route.ts
│   │   │   ├── me/route.ts
│   │   │   └── reset-password/route.ts
│   │   ├── users/
│   │   │   ├── route.ts               ← GET (list), POST (create)
│   │   │   └── [id]/
│   │   │       ├── route.ts           ← PUT, DELETE
│   │   │       └── reset/route.ts     ← POST (send reset email)
│   │   ├── files/
│   │   │   ├── route.ts               ← GET (list), POST (upload)
│   │   │   └── [id]/route.ts          ← GET, DELETE
│   │   ├── public/
│   │   │   └── files/route.ts         ← Public file list (no auth)
│   │   ├── feedback/
│   │   │   ├── route.ts               ← GET (list), POST (create)
│   │   │   └── [id]/route.ts          ← PUT, DELETE
│   │   └── health/
│   │       ├── route.ts               ← GET /api/health (public)
│   │       └── detailed/route.ts      ← GET /api/health/detailed (admin)
│   │
│   ├── layout.tsx                     ← Root layout (ThemeProvider, fonts)
│   ├── globals.css                    ← Design tokens, Tailwind directives
│   ├── error.tsx                      ← Root error boundary
│   └── not-found.tsx                  ← 404 page
│
├── components/
│   ├── ui/                            ← shadcn/ui generated components (DO NOT EDIT)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── avatar.tsx
│   │   ├── chart.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── table.tsx
│   │   └── ... (all shadcn components)
│   │
│   ├── layout/                        ← App shell components
│   │   ├── AppSidebar.tsx             ← Collapsible sidebar with nav items
│   │   ├── Topbar.tsx                 ← Top navigation bar
│   │   ├── TopbarUserMenu.tsx         ← Avatar + dropdown menu (PRD-009)
│   │   ├── ThemeToggle.tsx            ← Dark/light/system switcher (PRD-009)
│   │   ├── BottomNav.tsx              ← Mobile bottom tab bar (PRD-008)
│   │   └── PageContainer.tsx          ← Max-width content wrapper
│   │
│   ├── auth/                          ← Auth-specific UI
│   │   ├── LoginForm.tsx
│   │   └── SessionExpiredModal.tsx
│   │
│   ├── public/                        ← Public area components
│   │   ├── DocumentList.tsx
│   │   ├── DocumentViewer.tsx
│   │   └── PublicDocumentCard.tsx
│   │
│   ├── dashboard/                     ← Dashboard-specific components
│   │   ├── files/
│   │   │   ├── FileTable.tsx
│   │   │   ├── FileUploadDialog.tsx
│   │   │   └── FileDeleteDialog.tsx
│   │   ├── team/
│   │   │   ├── UserTable.tsx
│   │   │   └── AddUserDialog.tsx
│   │   └── feedback/
│   │       ├── FeedbackList.tsx
│   │       ├── FeedbackForm.tsx
│   │       └── InlineFeedbackTooltip.tsx
│   │
│   ├── settings/                      ← Settings page tabs
│   │   ├── AppearanceTab.tsx
│   │   ├── ProfileTab.tsx
│   │   ├── AccountTab.tsx
│   │   └── UsersPermissionsTab.tsx
│   │
│   ├── monitor/                       ← Monitor dashboard components
│   │   ├── ServiceHealthCard.tsx
│   │   ├── ErrorLogTable.tsx
│   │   ├── ActivityFeed.tsx
│   │   └── StatsCards.tsx
│   │
│   ├── error/
│   │   ├── ErrorBoundary.tsx          ← React error boundary (PRD-006)
│   │   └── OfflinePage.tsx            ← Shown when offline + auth route (PRD-008)
│   │
│   └── pwa/
│       └── InstallPrompt.tsx          ← PWA install banner (PRD-008)
│
├── lib/                               ← Shared utilities & clients
│   ├── supabase/
│   │   ├── client.ts                  ← Browser Supabase client (singleton)
│   │   ├── server.ts                  ← Server-side Supabase client (with service_role option)
│   │   └── middleware.ts              ← Supabase auth for Next.js middleware
│   ├── auth/
│   │   ├── guards.ts                  ← RBAC guard functions (canAccess, requireRole)
│   │   └── session.ts                 ← Session helpers (getUser, getUserRole)
│   ├── logger/
│   │   └── index.ts                   ← Two-layer logger (Sentry + Supabase) (PRD-006)
│   └── utils/
│       ├── cn.ts                      ← Tailwind class merge utility
│       ├── file.ts                    ← File type helpers, size formatters
│       └── date.ts                    ← Date formatting helpers
│
├── hooks/                             ← Custom React hooks
│   ├── usePageTracking.ts             ← Auto page visit logging (PRD-006)
│   ├── useCurrentUser.ts              ← Current user from Supabase session
│   ├── useTheme.ts                    ← Re-export from next-themes
│   └── usePWAInstall.ts               ← beforeinstallprompt handler (PRD-008)
│
├── types/                             ← Global TypeScript types
│   ├── database.ts                    ← Generated Supabase types (auto-generated, do not edit)
│   ├── auth.ts                        ← AuthUser, UserRole (from PRD-000)
│   ├── files.ts                       ← HorusFile, FileType (from PRD-000)
│   ├── logs.ts                        ← LogEvent, LogPayload (from PRD-000)
│   └── index.ts                       ← Re-exports all types
│
├── constants/
│   ├── permissions.ts                 ← PERMISSION_MATRIX (PRD-010)
│   ├── routes.ts                      ← All route paths as constants
│   └── config.ts                      ← Feature flags, app config
│
├── supabase/
│   ├── migrations/                    ← All DB migrations (append-only)
│   │   ├── 20250101000001_create_user_profiles.sql
│   │   ├── 20250101000002_create_files.sql
│   │   ├── 20250101000003_create_feedbacks.sql
│   │   └── 20250101000004_create_logs.sql
│   └── seed.sql                       ← Test data for local dev + CI
│
├── tests/
│   ├── setup.ts                       ← Global test setup
│   ├── unit/                          ← Unit tests (PRD-011)
│   ├── integration/                   ← Integration tests (PRD-011)
│   └── e2e/                           ← Playwright E2E tests (PRD-011)
│
├── public/
│   ├── manifest.json                  ← PWA manifest (PRD-008)
│   ├── sw.js                          ← Service worker (generated by next-pwa)
│   └── icons/
│       ├── icon-192.png
│       ├── icon-512.png
│       └── icon-512-maskable.png
│
├── scripts/
│   └── validate-prd-interfaces.js     ← PRD interface version checker (PRD-000 → all PRDs)
│
├── .husky/
│   └── pre-commit                     ← Runs validate:prd before every commit
│
├── middleware.ts                      ← Next.js middleware (auth + RBAC routing)
├── next.config.js                     ← Next.js + PWA config
├── tailwind.config.ts                 ← Tailwind theme extensions
├── tsconfig.json                      ← TypeScript config (strict mode, @ alias)
├── vitest.config.ts                   ← Vitest config (PRD-011)
├── playwright.config.ts               ← Playwright config (PRD-011)
├── .env.example                       ← All required env vars (no values)
├── .env.local                         ← Local values (git-ignored)
├── .eslintrc.json                     ← ESLint config
├── .gitignore
└── package.json
```

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
