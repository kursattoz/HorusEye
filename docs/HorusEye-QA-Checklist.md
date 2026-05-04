# HorusEye — Final QA Checklist (BL-63)

**Owner:** Tuğba Hilal Kırer (portal_frontend) — primary
**Cross-checks:** Gizem (backend smoke), Çağla (UX walkthrough)
**Run when:** before tagging `v1.0.0-final` and again the day before the jury demo.

---

## A. Auth + access control

- [ ] `/login` renders without auth; logged-in users redirect to `/dashboard`.
- [ ] Unauthenticated GET to `/dashboard`, `/exams`, `/students`, `/sprints` redirects to `/login`.
- [ ] `/change-password` traps users with `force_password_change=true` until reset.
- [ ] Forgot password flow end-to-end (login → email → `/auth/callback` → `/reset-password`).
- [ ] `assistant` role cannot access `/team`, `/files`, `/dev/monitor` (admin-only).

## B. Sprint & backlog (PRD-018)

- [ ] `/sprints` shows Sprint 1-4 with correct status (1+2+3 completed, 4 active).
- [ ] Each sprint card shows correct done/total + estimated hours.
- [ ] `/sprints/[id]` opens kanban with 5 columns.
- [ ] Drag-drop changes status (or shows blocker modal on 409).
- [ ] BL-{seq_id} appears on every card.
- [ ] PRD badges visible on cards.
- [ ] `/sprints/analytics` shows PRD coverage with the new PRD-013 entries
      (Exam, ExamRoom, Camera, ExamSession, Student, Incident).
- [ ] D6/D8 deliverables show as **completed**.

## C. Exam module (PRD-013, Sprint 4 work)

- [ ] `/exam-rooms` list + add new room + soft-deactivate works.
- [ ] `/students` list, search debounced, single add, CSV import.
- [ ] CSV import error handling (invalid student_id, bad email, missing column).
- [ ] `/exams` list with status badges, links to detail.
- [ ] `/exams/new` create form — duration auto-derives from start/end.
- [ ] `/exams/[id]` shows sessions, room counts, "Live monitor" button.
- [ ] `/exams/[id]/live` connects WS (or shows "AI service offline" gracefully).
- [ ] Camera stream_url is **never** returned plaintext from `/api/cameras`.

## D. Incident pipeline (Sprint 4)

- [ ] POST `/api/incidents` validates type + severity + confidence range.
- [ ] PUT `/api/incidents/[id]` review action stamps `reviewed_by`/`decided_by`.
- [ ] Evidence upload rejects files >25 MB and non-image/non-video MIME.
- [ ] Evidence GET returns 404 if path isn't in the incident's array (anti-IDOR).
- [ ] Live monitor incident feed scrolls newest-first, severity badge colors correct.

## E. AI service end-to-end (Phase A)

- [ ] `docker compose up` from `ai-service/` brings `/health` to 200 in <15 s.
- [ ] WS `/ws/sessions/{id}/detections` accepts handshake, rejects wrong api_key.
- [ ] Sample RTSP source streams frames; YOLO emits at least one detection.
- [ ] Frame `jpeg_base64` renders correctly on the portal canvas (BL-118).
- [ ] Bbox color matches detection class.

## F. File management + feedback (PRD-002/003/004 — pre-existing regressions)

- [ ] Public files list at `/login` shows correct documents.
- [ ] PDF viewer renders without console errors.
- [ ] File upload, edit name/category/description, drag reorder all work.
- [ ] Trash → restore → delete permanently chain.
- [ ] Public feedback OTP flow (3/hour rate limit, 10 min expiry, @tedu.edu.tr only).

## G. Cross-browser smoke

- [ ] Chrome (latest)
- [ ] Safari 17+
- [ ] Firefox (latest)
- [ ] Mobile portrait (≤ 768 px) — sidebar collapses, exam wizard usable

## H. Production-only checks

- [ ] `/api/health` returns 200 from outside the network.
- [ ] CDN-cached assets reload after a deploy (no stale chunks).
- [ ] Email send works (request a password reset, watch SMTP logs).
- [ ] Sentry receives a synthetic error (`/api/log/pdf-error`).

## I. Performance

- [ ] Lighthouse mobile run on `/login` ≥ 90.
- [ ] `/sprints/[id]` Kanban with 30+ items renders in <2 s.
- [ ] Live monitor canvas paints at ≥ 5 FPS when a frame stream is active.

## J. Sign-off

| Section | Owner | Status | Notes |
|---|---|---|---|
| A. Auth | Hilal | | |
| B. Sprint/backlog | Kürşat | | |
| C. Exam module | Hilal | | |
| D. Incident pipeline | Gizem | | |
| E. AI service | Ali | | |
| F. Files/feedback | Hilal | | |
| G. Cross-browser | Hilal | | |
| H. Prod | Kürşat | | |
| I. Perf | Hilal | | |

Final approver: **Çağla Abazaoğlu** (signs off after each section is green).
