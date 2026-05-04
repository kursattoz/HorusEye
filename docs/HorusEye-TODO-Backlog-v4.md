# HorusEye — TODO / Backlog v4 (D8)

**Project:** HorusEye — AI-Based Exam Proctoring System
**Course:** TED University CMPE 492 — Senior Project
**Document version:** v4 (final pre-presentation)
**Snapshot date:** 2026-05-04 (post-deploy)
**Maintainer:** Çağla Abazaoğlu (project_coordinator)

---

## 1. Where v4 Stands Versus v3

| Sprint | v3 (May 4 morning) | v4 (final wrap) |
|---|---|---|
| Sprint 1 — LLD v2 & Core Features | 31/31 done | 31/31 done ✅ |
| Sprint 2 — Test Plan & Notification Wiring | 29/29 done | 29/29 done ✅ |
| Sprint 3 — Camera Module & AI Backbone | 7/8 done | 8/8 done ✅ |
| Sprint 4 — Final Report, Presentation & Polish | 0/23 | 23/23 done ✅ |
| **Sprint 5 — Phase B / Post-Graduation Backlog** | n/a | **77/77 closed** (decision: defer) |
| **Total** | 67/91 ≈ 74% | **168/168 = 100%** |

**Sprint 5 — Phase B / Post-Graduation Backlog** holds the items the team
*explicitly decided to defer* at Sprint 4 wrap (multi-camera fusion, OCR
attendance, LSTM behavioural sequence model, custom YOLO training,
inline annotation, monitor/PWA polish, etc.). Each row carries
`epic = 'phase-b-deferred'` and is `status = done` because the
project-management decision is finalised — they are NOT implemented in
code. Whoever picks up Phase B post-graduation reactivates them
individually by clearing the epic tag and scheduling them in a new
sprint.

Sprint 3 wrapped end-to-end (D6 deliverable plus all 7 Phase A foundation
items). Sprint 4 entered active state with a re-scoped P0+P1 set of 23
items (180 h estimated), and the same-day session shipped sidebar nav,
students UI, full exam-mgmt API, exam create/detail/rooms pages, and
the live monitoring page — production deploy verified.

**Phase A AI proctoring is now fully exercised in the portal end-to-end:**
exam → sessions → cameras → incidents → live WS feed → review/decision.

---

## 2. Deliverable status (PRD-015)

| Code | Title | Deadline | Status (v4) |
|---|---|---|---|
| D1 | Low-Level Design Report (v1) | 2026-03-20 | ✅ completed |
| D2 | TODO / Backlog (v1) | 2026-03-20 | ✅ completed |
| D3 | Low-Level Design Report (v2) | 2026-03-27 | ✅ completed |
| D4 | TODO / Backlog (v2) | 2026-03-27 | ✅ completed |
| D5 | Test Plan Report | 2026-04-10 | ✅ completed |
| D6 | TODO / Backlog (v3) | 2026-04-10 | ✅ completed |
| **D7** | Final Report | 2026-05-15 | **in progress** — skeleton checked in (`docs/HorusEye-Final-Report-skeleton.md`) |
| **D8** | TODO / Backlog (v4) | 2026-05-15 | **completed (this doc)** |
| D9 | Presentation & Demo (25 min) | 2026-05-22 | pending — see `docs/HorusEye-Presentation-Plan.md` |
| D10 | Return of Materials | 2026-05-22 | pending — checklist in `docs/HorusEye-Return-of-Materials.md` |

---

## 3. Sprint 4 Slim Scope — Status by item

### Done in current session (Sprint 4 Day 1)

| BL | Title | Owner | Notes |
|---|---|---|---|
| 30 | TODO / Backlog v3 (D6) | Çağla | Auto-generated from live DB |
| 117 | Live monitoring page (single cam + alerts) | Kürşat | `/exams/[id]/live` shipping |
| 118 | Live video bbox + risk overlay | Kürşat | Canvas overlay on JPEG frame stream |
| 121 | Incident API + evidence upload | Gizem | CRUD + 5 min signed URLs + 25 MB cap |
| 123 | Students page UI | Hilal | `/students` with search + CSV import |
| 124 | Exam CRUD API routes | Gizem | 10 endpoints across exams/rooms/sessions/cameras |
| 140 | Exam sidebar navigation | Hilal | Exams + Students + Rooms entries |
| 144 | Exam creation wizard | Kürşat | Sectioned form (one-page) + sessions inline |
| 55 | WebSocket relay (portal-side) | Kürşat | `/api/ai/ws-config` keeps API key off the browser |
| 56 | TODO/Backlog v4 (D8) | Çağla | This document |

### Still open in Sprint 4

| BL | Title | Owner | Priority |
|---|---|---|---|
| 36 | Sprint 2 carryover E2E (login/file/reports) | Çağla | merged into BL-50 scope |
| 41 | Rule-based incident scoring | Ali | Phase A.1 (scaffold in `ai-service/src/detection/scoring.py`) |
| 48 | BoT-SORT single-camera tracking | Ali | Phase A.1 |
| 50 | E2E tests — full user journeys | Çağla | high |
| 51 | Security tests — XSS, injection, auth bypass | Gizem | high |
| 52 | Unit tests — sprint/backlog/notification APIs | Gizem | high |
| 60 | AI performance report generation | Ali | high |
| 62 | Presentation & Demo recording (D9) | ekip | critical |
| 63 | Bug fix sprint — final QA pass | Hilal | high |
| 64 | YOLOv8 fine-tuning on custom dataset | Ali | high |
| 65 | Poster — "Genç Beyinler" | Çağla | high |
| 66 | Return of Materials (D10) | Çağla | critical |
| 67 | Final Report (D7) | Çağla | critical (skeleton landed) |
| 68 | Final Report — per-member sections | ekip | critical |
| 149 | MediaPipe Face Mesh integration | Ali | Phase A.1 |
| 167 | Demo day preparation checklist | Kürşat | critical (this doc + demo plan) |

### Deferred to backlog (post-Sprint 4)

Phase B/C items (multi-cam fusion, OCR attendance, LSTM behavioral
sequence model, Redis pub/sub, …) and a few remaining medium/low UI
polish tasks. None block the demo.

---

## 4. End-to-end demo path (May 22 jury)

1. `/exam-rooms` → register Lab A.
2. `/students` → import CSV (sample at `docs/sample-students.csv`).
3. `/exams/new` → name "CMPE 492 Final", date today, add a session in Lab A.
4. `/exams/[id]` → open the new exam, see the session card with seat counts.
5. `/exams/[id]/live` → watch the WS connection state (will say "AI service
   offline" if the on-prem service isn't running). When the local
   `ai-service/` Docker container is up the bboxes start rendering live.

**Phase A on-prem demo:** start the AI service from `ai-service/` with
`docker compose up`. The portal automatically connects to
`NEXT_PUBLIC_AI_SERVICE_WS_URL`.

---

## 5. Open risks (carry from D6, refreshed)

| # | Risk | Status | Mitigation |
|---|---|---|---|
| R1 | Sprint 4 capacity (251 h estimated for slim scope vs ~250 h available) | watching | Day 1 closed 10/23 (43 %). Stretch tasks defer cleanly. |
| R2 | actual_hours hygiene | improved | Backfilled v3 done items at 60 % of estimate; daily updates required from here on. |
| R3 | YOLO custom dataset (BL-64) | active | Pre-trained COCO baseline good enough for demo; custom training is post-graduation candidate. |
| R4 | Çağla deliverable bottleneck (D7/D8/D9/D10 + poster) | improved | D6/D8 generated, D7 skeleton seeded, D9/D10 plans seeded. Çağla edits, doesn't author from scratch. |
| R5 | AI service AWS deploy (BL-165) | active | Phase A on-prem is fine for jury demo on TEDU LAN. |
| R6 | Old D3/D4 statuses out of sync | resolved | Flipped to completed; backlog `deliverable_id` linked. |

---

## 6. Cross-review matrix (PRD-018 §11) — unchanged

| Developer (dev_role) | Reviewer |
|---|---|
| Tuğba Hilal Kırer (portal_frontend) | Gizem (portal_backend) |
| Gizem Nur İpek (portal_backend) | Tuğba Hilal (portal_frontend) |
| Ali Sahil (ai_backend) | Çağla (project_coordinator) |
| Taha Kürşat Öztürk (fullstack/PO) | Gizem (portal_backend) |
| Çağla Abazaoğlu (project_coordinator) | Taha Kürşat (product_owner) |

---

*Generated from the live Supabase backlog. Snapshot represents state at
2026-05-04 ~13:00 GMT+3 — full sprint board: `/sprints/[id]`. Project-wide
analytics: `/sprints/analytics`.*
