# HorusEye — Final Report (D7) — Skeleton

**Deadline:** 2026-05-15
**Owner:** Çağla Abazaoğlu (with per-member contributions, BL-68)

This skeleton lays out the final report sections. Each member fills in
their own subsection in §6 and signs off on the related shared section.
Replace every "TODO:" tag before submission.

---

## Cover

- **Project title:** HorusEye — AI-Based Exam Proctoring System
- **Course:** TED University CMPE 492 — Senior Project (Spring 2026)
- **Team:** Taha Kürşat Öztürk · Tuğba Hilal Kırer · Gizem Nur İpek · Ali Sahil · Çağla Abazaoğlu
- **Supervisor:** TODO: name
- **Submission date:** 2026-05-15

## Abstract (≤ 250 words)

TODO: 1-paragraph summary of the problem, approach, results, and
limitations. Pull from D5 Test Plan §1 and D6 §1 — keep it concise.

## 1. Introduction

### 1.1 Problem statement
TODO: Why exam proctoring needs AI assistance. Cite jury feedback if any
landed during D3 / D5 reviews.

### 1.2 Stakeholders
TED University CMPE department, exam proctors, students, the project team.

### 1.3 Project goals
- Reduce per-proctor cognitive load during in-person exams.
- Surface suspicious behaviour as suspicion scores, never as automatic
  decisions.
- Stay KVKK-compliant and minimise data retention.

### 1.4 Scope (what we built / didn't build)
- **In:** single-camera Phase A pipeline, exam mgmt, incident review,
  live monitoring, on-prem deployment.
- **Out:** multi-camera fusion (Phase B), face enrolment, OCR-based
  attendance, LSTM behavioural sequence model.

## 2. Background and related work

### 2.1 Computer vision in proctoring (literature)
TODO: 4-6 paragraphs comparing 2-3 academic / industry approaches; cite
sources used by Ali during BL-42 / BL-149 design.

### 2.2 Privacy and ethics framework
TODO: KVKK summary, IEEE ethics for autonomous decisions, our
human-in-the-loop principle.

## 3. Architecture (high level)

### 3.1 System diagram
TODO: insert PNG from `docs/architecture-diagram.png` (Kürşat).

### 3.2 Portal (Next.js 16, App Router)
- Auth + role-based middleware (`portal/proxy.ts`).
- Sprint & backlog management module (PRD-018).
- Exam module (PRD-013): rooms, students, sessions, live monitor.
- File management, public docs, feedback, reports, calendar.

### 3.3 AI service (FastAPI + Python 3.12)
- RTSP capture (`ai-service/src/ingestion/rtsp_capture.py`).
- YOLOv8n inference (`ai-service/src/detection/yolo_detector.py`).
- Phase A.1 plug-points for BoT-SORT + MediaPipe Face Mesh.
- WebSocket protocol v1.0 (`ai-service/src/api/protocol.py`).

### 3.4 Data layer (Supabase / Postgres 17)
- 30+ tables across PRD-001 through PRD-018.
- Row-level security: admin-full / user-own / public-read.
- Storage buckets: `incident-evidence` (private, 25 MB cap).

### 3.5 Infrastructure (AWS CDK + GitHub Actions)
- ECS Fargate + ALB + Route 53 + ECR.
- SSM parameters as runtime config; KMS-encrypted secrets at rest.
- CI/CD: `develop` → staging, `main` → production, with a Supabase
  migration step before every deploy.

## 4. Implementation deep dive

### 4.1 Sprint history (16 weeks)
TODO: copy summary from D8 §1.

### 4.2 PRD coverage matrix
Insert `/sprints/analytics` PRD coverage card screenshot.

### 4.3 Engineering workflow
- 18 PRDs versioned with interface contracts (PRD-000) — pre-commit hook
  (`scripts/validate-prd-interfaces.js`) blocks drift.
- Backlog DB drives Kanban + analytics; status changes audit-logged.
- Cross-review matrix (PRD-018 §11) — every PR reviewed by a peer.

### 4.4 Notable engineering trade-offs
TODO: Çağla writes 2-3 paragraphs after consulting the team.

## 5. Evaluation and testing

### 5.1 Test plan recap (link to D5)
### 5.2 Unit + integration tests (BL-52, BL-34, BL-6)
### 5.3 E2E tests (BL-12, BL-50, BL-36)
### 5.4 Security tests (BL-51)
### 5.5 AI service tests (BL-132 + Sprint 3 protocol/RTSP/YOLO test files)
### 5.6 Demo / dry-run results
TODO: numbers — false positives / false negatives if any from Çağla's
classroom validation (BL-156).

## 6. Per-member contributions (BL-68)

> First-pass content auto-generated from the live backlog (commits +
> `backlog_items.assigned_to`). Each member edits their own section
> before submission; aim for ≤ 1 page per member with a personal angle
> on what was hard, what was learned, and what they'd do differently.

### 6.1 Taha Kürşat Öztürk (product_owner / fullstack)

**Role:** Product Owner & full-stack engineer. Responsible for the
sprint/backlog system (PRD-018), CI/CD pipeline (PRD-005), AWS infrastructure,
the camera streaming front-end, and the live monitoring page.

**Key deliveries:**
- **Sprint & Backlog Management System (PRD-018):** designed the data
  model (sprints, backlog_items with seq_id BL-N, attachments, activity,
  reviews, deliverable links) and built the full Kanban + Analytics +
  Dependency Graph UI (BL-9, BL-13-15, BL-71-72).
- **AWS infrastructure:** ECS Fargate + ALB + Route 53 + ECR via CDK
  (BL-16). Wired SSM-driven configuration with SecureString → String
  migration after a CDK valueFromLookup incident; documented the rule in
  CLAUDE.md.
- **Forgot-password end-to-end flow (BL-33):** PKCE callback route,
  reset-password page, `/api/auth/reset-password` integration. Originally
  shipped without a callback handler — fixed in Sprint 3.
- **Camera RTSP ingestion (BL-49):** OpenCV-backed reader + async
  orchestrator with FPS throttling, drop-on-full queue, and exponential-
  backoff reconnect.
- **AI service WebSocket protocol (BL-120):** designed the v1.0 wire
  format (subscribe handshake, ping/pong, status, incident, frame,
  detection, error) and the Python ↔ TypeScript twin-file convention.
- **Exam creation wizard (BL-144) + live monitoring page (BL-117) +
  bbox overlay (BL-118):** the demo flow from `/exams/new` through to
  canvas-rendered detections.
- **Cross-cutting infra:** middleware → proxy.ts migration for Next.js 16,
  zero-downtime ECS rolling deploys (`minHealthyPercent: 100`), env-var
  consistency CI gate.

**Most useful lesson:** every CI/CD failure traced back to either a
missing local migration file or an SSM type drift. Adding the
`scripts/check-env-vars.sh` gate and the migration backfill discipline
removed an entire class of "deploy boom" incidents.

### 6.2 Tuğba Hilal Kırer (portal_frontend)

**Role:** Portal frontend — every UI surface that isn't the AI service.

**Key deliveries:**
- **Files & Trash management:** drag-reorder, inline name/category/
  description editing, soft-delete + restore + permanent purge (BL-23,
  BL-83-87, BL-99). Powered the "drag-and-drop on the table" UX that the
  jury sees in the public docs section.
- **Users tab:** search/filter debounce, role edit, activate/deactivate,
  password reset (BL-82, BL-88).
- **Account & session management:** active sessions list, device
  detection, password strength indicator, account deletion, page
  tracking consent (BL-79). All consolidated into the AccountTab
  component during the integration merge.
- **Students page (BL-123):** list, debounced search, inline add form,
  CSV import with detailed import-result feedback (imported/updated/
  skipped/errors).
- **Sidebar architecture (BL-140):** new "Exam Module" group, role-based
  visibility, persistence of collapsed state (BL-77).
- **Color theming + accent variables (BL-74):** dark/light toggle with
  cubic-bezier sliding pill animation.
- **ErrorBoundary + 404 polish (BL-73):** wrapped every route segment.

**Most useful lesson:** Tailwind v4 + shadcn/ui works beautifully if you
treat shadcn as "starter parts" and then add motion/colour variables
yourself. The cross-team component naming convention (TableX, FormX,
ModalX) made review handoffs cheap.

### 6.3 Gizem Nur İpek (portal_backend)

**Role:** Portal backend — Supabase schema, RLS, API routes, CI checks.

**Key deliveries:**
- **Supabase schema baseline (PRD-001/003/004):** users, files, feedback,
  notifications, OTP, file access requests, smtp_settings. Cleaned up
  RLS policies sprint by sprint (BL-5, audit run before integration).
- **Force password change middleware (BL-76):** trap users on
  `/change-password` until they reset, plus PRD-001 password policy
  validation server-side.
- **Notification + email triggers:** file upload/update/delete,
  feedback create/resolve, checklist completion (BL-25, BL-28, BL-38,
  BL-39); welcome email on user create (BL-27); 90-day cleanup cron
  (BL-26).
- **Public feedback OTP flow (BL-91):** 10 min expiry, 3/hour rate
  limit, @tedu.edu.tr only.
- **Page visit tracking (BL-35, BL-89):** auto-logging middleware
  feeding `audit_logs` for the Monitor screen.
- **Exam Module data layer (BL-130, BL-122, BL-129):** exams, exam_rooms,
  cameras, exam_sessions, session_proctors, session_students, students,
  incidents + rescoring history. The 5 migrations under
  `20260504*` are the Sprint 3 contribution.
- **Exam CRUD API (BL-124) + Incident API (BL-121):** 13 endpoints, all
  audit-logged, camera stream_url AES-256-GCM encrypted at rest.
- **Guest session tracking (BL-90):** sessionStorage-based anonymous IDs
  plumbing into AppShell and notifyAdmins.

**Most useful lesson:** RLS is brilliant when designed up-front and
miserable when retrofitted. The Sprint 1 RLS audit caught two policies
that admins relied on but were missing the `is_admin()` helper —
fixing them once meant Sprint 3's exam tables landed RLS-clean from day
one.

### 6.4 Ali Sahil (ai_backend)

**Role:** AI service owner — RTSP → YOLO → tracker → scorer → events.

**Key deliveries:**
- **AI service scaffold (BL-24):** FastAPI + uvicorn + WebSocket
  router, /health, Dockerfile with Phase A on-prem deployment in mind,
  pytest baseline.
- **YOLOv8n inference pipeline (BL-42):** ultralytics wrapper, COCO
  class filter (person, cell phone, laptop, book, keyboard), normalized
  bbox output, lazy weights load. Dockerfile pre-bakes the weights
  to remove the first-request stall.
- **Phase A.1 detection scaffolds:** rule-based scoring extension
  (BL-41) with windowed gaze + head-lost rules, IoU tracker as a
  BoT-SORT placeholder (BL-48), MediaPipe Face Mesh extractor with
  graceful no-mediapipe fallback (BL-149).
- **AI performance report CLI (BL-60):** per-session JSON summary
  pulling severity/type/decision breakdowns directly from Supabase via
  the service role key.
- **YOLOv8 fine-tuning script (BL-64):** ultralytics training wrapper
  with deterministic seed, early stopping, test-set evaluation, and a
  data.yaml template for the post-graduation custom dataset push.
- **WebSocket protocol implementation:** server-side handshake with
  API-key auth (BL-120), ping/pong heartbeat, unsubscribe lifecycle.

**Most useful lesson:** keeping the AI service Python-only and on-prem
removed an entire deployment dimension (no GPU on AWS, no model files
in the repo) and let the demo run on a laptop. The cost is a tighter
hand-off path: the WebSocket protocol was the single contract between
my service and the rest of the team — once it was versioned, every
end started moving in parallel.

### 6.5 Çağla Abazaoğlu (project_coordinator)

**Role:** Project coordination — deliverables, testing, materials.

**Key deliveries:**
- **All 10 deliverables (D1-D10):** LLD v1/v2, TODO/Backlog v1-v4,
  Test Plan, Final Report, Presentation/Demo, Return of Materials. D6/D8
  are auto-generated from the live backlog snapshot but reviewed and
  enriched before submission.
- **E2E baseline (BL-12, BL-36):** Playwright suite covering the login
  → file upload → reports flow, plus the Sprint 4 expansion to full
  user journeys (BL-50).
- **Test Plan Report (D5):** documented coverage targets, test types,
  and acceptance criteria per PRD.
- **Demo & presentation production (BL-62):** 25-minute time budget,
  recording script, slide deck.
- **Poster & "Genç Beyinler" event materials (BL-65).**
- **Privacy/KVKK stance documentation (BL-133):** consent at sign-in,
  data minimisation, no automatic decisions.
- **Cross-team coordination:** sprint reviews, retrospectives, the
  cross-review matrix in PRD-018 §11.

**Most useful lesson:** documenting the deliverable timeline in the
backlog (with `deliverable_id` linking) meant `/sprints/analytics`
showed the demo timeline next to engineering progress without ever
needing a side spreadsheet. The auto-sync from done backlog items to
deliverable status (PRD-018 §5.5) caught at least three "we forgot to
flip the deliverable" misses.

## 7. Limitations and future work

### 7.1 What we know is fragile
- Single-camera Phase A: occlusion can blind detections.
- COCO pre-trained YOLO has gaps on context-specific objects (custom
  earbuds, calculators) — Phase B addresses with custom training (BL-154).
- AI service is not yet on AWS — Phase A trusts the LAN.

### 7.2 Phase B candidates
- Multi-camera fusion (BL-151), homography calibration (BL-152).
- Face enrolment + auto-lock matching (BL-164).
- LSTM/GRU behavioural sequence model (BL-163).
- OCR attendance from paper exam slips (BL-162).

### 7.3 Phase C candidates
- Course-level analytics (BL-157), system-wide analytics & export (BL-158).

## 8. Conclusion

TODO: 2-paragraph wrap. Highlight what the team learned operationally
(workflow, PRDs, sprint discipline) more than the code itself.

## Appendix A — Repository structure

See `PRD/PRD-012-folder-structure-conventions.md`.

## Appendix B — How to run the system

### Portal
```bash
cd portal
npm install
cp .env.example .env.local  # fill in Supabase + SMTP_ENCRYPTION_KEY
npm run dev
```

### AI service
```bash
cd ai-service
docker compose up
# /health → http://localhost:8000/health
# WS     → ws://localhost:8000/ws/sessions/{id}/detections
```

### Tests
```bash
cd portal && npm run validate    # PRD + tsc + lint + coverage
cd ai-service && pytest tests/   # FastAPI + WS + RTSP + YOLO tests
```

## Appendix C — Acknowledgements

TODO: supervisor, TED CMPE department, library staff, anyone who lent
hardware.
