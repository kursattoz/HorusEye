# HorusEye — Project Master Reference
**Last Updated:** 2026-03-18
**Project:** HorusEye — AI-Based Exam Proctoring System
**Team:** Çağla Abazaoğlu, Gizem Nur İpek, Taha Kürşat Öztürk, Ali Sahil, Tuğba Hilal Kırer
**Supervisor:** Fırat Akba (TED University, CMPE491/492)

---

## Quick Navigation

| Want to know... | Go to |
|----------------|-------|
| Tech stack, interfaces, DB schema | `PRD/PRD-000-master-matrix.md` |
| Login, roles, user management | `PRD/PRD-001-auth.md` |
| Public document area | `PRD/PRD-002-public-docs.md` |
| File upload/download | `PRD/PRD-003-file-management.md` |
| Feedback system | `PRD/PRD-004-feedback.md` |
| Git workflow, CI/CD, deployment | `PRD/PRD-005-cicd.md` |
| Error handling, audit logs | `PRD/PRD-006-error-management-logging.md` |
| System monitor dashboard | `PRD/PRD-007-system-monitor-dashboard.md` |
| PWA, responsive, offline | `PRD/PRD-008-pwa-responsive-design.md` |
| shadcn, dark mode, icons, topbar | `PRD/PRD-009-ui-design-system.md` |
| Settings page, permission matrix | `PRD/PRD-010-settings-permissions.md` |
| Test setup, E2E, unit tests | `PRD/PRD-011-testing-strategy.md` |
| Folder structure, naming rules | `PRD/PRD-012-folder-structure-conventions.md` |
| Camera AI, multi-camera strategy | `PRD/PRD-013-camera-ai-analysis.md` |

---

## PRD Status Overview

| PRD | Title | Status | Priority |
|-----|-------|--------|----------|
| PRD-000 | Master Matrix & Glossary | ACTIVE | Foundation |
| PRD-001 | Auth & User Management | ACTIVE | P0 — must-have |
| PRD-009 | UI Design System | ACTIVE | P0 — blocks all frontend |
| PRD-012 | Folder Structure & Conventions | ACTIVE | P0 — must be set up first |
| PRD-005 | CI/CD Infrastructure | ACTIVE | P0 — must be set up first |
| PRD-002 | Public Documentation Area | ACTIVE | P1 |
| PRD-003 | File Management | ACTIVE | P1 |
| PRD-006 | Error Management & Logging | ACTIVE | P1 |
| PRD-004 | Feedback System | ACTIVE | P2 |
| PRD-007 | System Monitor Dashboard | ACTIVE | P2 |
| PRD-008 | PWA & Responsive Design | ACTIVE | P2 |
| PRD-010 | Settings & Permissions | ACTIVE | P2 |
| PRD-011 | Testing Strategy | ACTIVE | P1 — parallel with dev |
| PRD-013 | Camera AI Analysis | DRAFT | P3 — future phase |

---

## Recommended Implementation Order

```
Phase 0 — Foundation ✅ COMPLETE (2026-03-18)
├── PRD-012: ✅ Folder structure, tsconfig, eslint, Tailwind v4 (@theme inline)
├── PRD-009: ✅ shadcn/ui, design tokens, dark/light/system mode, HorusEye logo
├── PRD-005: ✅ Git branches (main/develop), GitHub Actions CI (5 jobs), Husky pre-commit
└── PRD-011: ✅ Vitest + Playwright config, unit/integration/e2e test infrastructure
             ✅ PWA icons (192, 512, 512-maskable) from favicon.svg
             ✅ Migration 20240003 (force_password_change, color_theme columns)

Phase 1 — Core (authentication + basic UI)  ← CURRENT PHASE
├── PRD-001: Auth (login, RBAC, proxy.ts, user profiles)
├── PRD-006: Logger (audit_logs, error_logs, Sentry)
└── PRD-002: Public documentation area (landing page)

Phase 2 — Features
├── PRD-003: File management (upload, storage, CRUD)
├── PRD-004: Feedback system
└── PRD-010: Settings page

Phase 3 — Operations
├── PRD-007: System monitor dashboard
└── PRD-008: PWA, offline support, responsive polish

Phase 4 — Camera AI (future)
└── PRD-013: Camera module (when feature flag enabled)
```

---

## System Architecture Summary

```
Browser (React/Next.js)
    ├── Public area (/ , /docs/[slug])       → Guest + all roles
    ├── Protected area (/dashboard/*)         → Auth required
    ├── Settings (/settings)                  → All roles
    └── Monitor (/dev/monitor)               → Admin only

Next.js API Routes
    ├── /api/auth/*                           → Supabase Auth wrapper
    ├── /api/users/*                          → User management (Admin)
    ├── /api/files/*                          → File operations
    ├── /api/feedback/*                       → Feedback CRUD
    └── /api/health/*                         → Health checks

Supabase (MCP: horuseye-staging / horuseye-production)
    ├── PostgreSQL Database
    │   ├── auth.users                        → Supabase managed
    │   ├── public.user_profiles              → PRD-001
    │   ├── public.files                      → PRD-003
    │   ├── public.feedbacks                  → PRD-004
    │   ├── public.audit_logs                 → PRD-006
    │   └── public.error_logs                 → PRD-006
    ├── Auth                                  → JWT, RBAC
    └── Storage
        ├── bucket: documents                 → Team files (private)
        └── bucket: avatars                   → User avatars (private)

External Services
    ├── Sentry                                → Critical error tracking
    └── Vercel                                → Deployment (staging + production)
```

---

## User Roles Summary

| Role | Who | Key Access |
|------|-----|-----------|
| `admin` | Team members (Taha, Çağla, Gizem, Ali, Tuğba) | Everything — file CRUD, user management, monitor |
| `supervisor` | Professors, jury members | View files + write feedback |
| `assistant` | Teaching assistants | View files only |
| `guest` | Anyone with URL | Public documentation only, no account |

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | Next.js 14 App Router | SSR + API routes |
| Language | TypeScript (strict) | `noEmit` check in CI |
| UI Components | shadcn/ui (100%) | No other component library |
| Styling | Tailwind CSS | Design tokens via CSS custom properties |
| Icons | Lucide React (100%) | No other icon library |
| Dark Mode | next-themes | `system` default |
| Charts | Recharts (via shadcn) | Chart tooltips via shadcn ChartTooltip |
| Database | Supabase (PostgreSQL 15) | MCP: `horuseye-staging` |
| Auth | Supabase Auth | JWT RS256, RBAC |
| Storage | Supabase Storage | PDF, PPTX, images |
| Error Tracking | Sentry | Critical errors + stack traces |
| CI/CD | GitHub Actions | 3 workflows: CI, staging, production |
| Deployment | Vercel | Preview URLs for PRs |
| Testing | Vitest + Playwright | Unit + integration + E2E |
| PWA | next-pwa | Service worker, offline cache |

---

## Environment Setup Checklist

```bash
# 1. Clone and install
git clone https://github.com/horuseye-team/horuseye-portal.git
cd horuseye-portal
npm install

# 2. Start local Supabase (requires Docker)
npm install -g supabase
supabase start
supabase db reset     # applies all migrations + seed

# 3. Configure environment
cp .env.example .env.local
# Fill NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
# from `supabase start` output

# 4. Run dev server
npm run dev           # http://localhost:3000

# 5. Validate everything
npm run validate      # tsc + lint + tests
```

---

## Supabase MCP Reference

All database operations during development and debugging use MCP.
**MCP project names:**
- Development/Staging: `horuseye-staging`
- Production: `horuseye-production`

Common MCP operations:
```
# View tables
mcp: list_tables → horuseye-staging

# Run SQL
mcp: execute_sql → horuseye-staging → "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10"

# Apply migration
mcp: apply_migration → horuseye-staging → [SQL content]

# Get project URL
mcp: get_project_url → horuseye-staging
```

---

## Key Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Next.js App Router (no separate backend) | FastAPI/Express overkill for current scope. Server Actions + API Routes sufficient. |
| shadcn/ui as the ONLY component library | Prevents visual inconsistency. One source of truth for components. |
| Lucide as the ONLY icon library | Same reason. Prevents mixing icon styles. |
| Supabase over raw PostgreSQL | Managed auth, storage, RLS, real-time out of the box. MCP integration. |
| Two-table logging (audit_logs + error_logs) | Different query patterns, separate indexing, faster monitor queries. |
| Camera module feature-flagged | AI pipeline is complex. Ship portal first, add camera later without breaking anything. |
| PRD-000 as single source of truth | Prevents interface drift between PRDs. LLM always reads this first. |
| `npm run validate` as gate | tsc + lint + tests in one command = CI-equivalent check locally. |
| Append-only audit_logs | Immutable audit trail — no UPDATE or DELETE allowed. |
| Local Supabase Docker for tests | No mocking = no mock/prod divergence bugs. Tests prove real behavior. |

---

## Academic Context

This system is developed as a graduation project (Senior Project I & II) at TED University.

| Document | Location |
|----------|----------|
| Project Proposal | `Project-documents/project-proposal.pdf` |
| Analysis Report | `Project-documents/AnalysisReport.pdf` |
| High-Level Design | `Project-documents/CMPE491-HighLevelDesignReport-HorusEye.pdf` |
| Specifications | `Project-documents/Project Specifications Report - HorusEye.pdf` |
| Presentation | `Project-documents/HorusEye-AI-Based-Exam-Proctoring-System.pptx` |
| CMPE492 Syllabus | `Project-documents/CMPE492-Syllabus-Spring2025.docx` |

AI Technical Stack (from academic docs, planned for PRD-013):
- Object detection: **YOLOv8** (phone, paper, earbuds)
- Video processing: **OpenCV**
- Behavioral modeling: **TensorFlow LSTM/GRU**
- Gaze tracking: **MediaPipe Face Mesh**
- Target detection accuracy: **≥ 85%** under standard lighting
