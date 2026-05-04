# HorusEye — Presentation & Demo Plan (D9)

**Slot:** 25 minutes (jury session, 2026-05-22)
**Recording deadline:** 2026-05-22 (D9 deliverable)
**Owners:** Çağla (slides + recording), Kürşat (live demo + AI service), Ali (AI explainer), Hilal + Gizem (UX walkthrough)

---

## 1. Time budget (25 min total, including Q&A)

| Block | Owner | Minutes | Content |
|---|---|---|---|
| 1. Opening — problem, why AI proctoring | Çağla | 2 | TED context, exam integrity gaps, scope |
| 2. Architecture overview | Kürşat | 3 | Portal (Next.js) + AI service (FastAPI) + Supabase + AWS ECS |
| 3. Live demo: setup → exam → live monitor | Kürşat | 7 | Add room → import students → create exam → live WS feed |
| 4. AI pipeline deep dive | Ali | 4 | YOLOv8n + (Phase A.1) BoT-SORT + MediaPipe + scoring rules |
| 5. PRD coverage + sprint metrics | Çağla | 2 | `/sprints/analytics` shot, velocity, what shipped |
| 6. Privacy / KVKK / ethics stance | Çağla | 1 | Consent, data minimisation, no auto-decisions |
| 7. Q&A buffer | Ekip | 6 | — |

---

## 2. Demo script (live or pre-recorded)

> **Tip:** record the demo at 1080 p with desktop audio + voice-over so the
> jury sees exactly the same flow even if the on-prem AI service goes
> offline mid-demo.

1. **Login** with the demo account (provisioned in Supabase).
2. Sidebar tour — "Project Management" + "Exam Module" groups.
3. **`/exam-rooms`** → "Add room" → fill `Lab A`, capacity 40.
4. **`/students`** → "Import CSV" → use `docs/sample-students.csv` (10 rows).
5. **`/exams/new`** → fill metadata, add 1 session in Lab A → Save.
6. **`/exams/[id]`** → open the exam, point out the session card with the
   *Live monitor* button.
7. **`/exams/[id]/live`** → start the AI service locally
   (`docker compose up` from `ai-service/`).
   - WS connection state pill goes Idle → Connecting → Live.
   - When YOLO emits a phone detection, the bbox flashes red on the
     canvas and an entry slides into the incident feed.
8. **`/sprints/analytics`** → quick highlight of PRD coverage card, sprint
   burndown, team workload matrix.

**If the AI service can't be brought online during the demo,** keep the
recording playing and switch to slides for sections 4-6.

---

## 3. Visual assets to prepare (poster + slides)

| Asset | Owner | Deadline |
|---|---|---|
| Slide deck (Google Slides, 12-15 slides) | Çağla | 2026-05-19 |
| 2-min architecture diagram (PlantUML or Excalidraw → PNG) | Kürşat | 2026-05-18 |
| AI pipeline diagram (frame → YOLO → tracker → scorer → incident) | Ali | 2026-05-18 |
| Poster A1 / "Genç Beyinler" (BL-65) | Çağla | 2026-05-20 |
| Demo recording (mp4, ≤ 720 MB) | Çağla + Kürşat | 2026-05-21 |

---

## 4. Pre-flight checklist (24 hours before the jury)

- [ ] Production portal is up at `https://horuseye.app` (`/api/health` returns 200)
- [ ] Demo Supabase user has rooms + students + at least one exam pre-created
- [ ] `ai-service` Docker image builds clean and runs `docker compose up` end-to-end
- [ ] At least one sample RTSP source ready (a saved video file works in Phase A)
- [ ] YOLO weights `models/yolov8n.pt` baked into the image (BL-42)
- [ ] Slide deck reviewed by all five members
- [ ] Recording uploaded to Drive + LMS, link in `docs/HorusEye-Return-of-Materials.md`
- [ ] Backup laptop/projector adapter in the bag

---

## 5. Q&A prep — questions we expect

| Question | Short answer |
|---|---|
| Privacy / KVKK? | Consent at sign-in; only exam-time video; minimum-data principle; no facial ID outside enrolled students. |
| What about false positives? | We never auto-decide — all detections feed a *suspicion score* that a human proctor reviews. Tier-3 detections (e.g. brief glance) never fire alerts on their own. |
| Why YOLOv8n? | Speed/quality trade-off for real-time on-prem CPU inference; nano fits in <10 MB and runs ≥5 FPS on a typical proctor laptop. |
| Multi-camera coordination? | Phase A is single camera per session. Multi-cam fusion (BL-151) is Phase B. |
| What if the AI service crashes mid-exam? | Connection state pill goes red; incidents that were already persisted stay in the DB; the proctor falls back to manual observation. |
| Cost / scaling? | Portal: ECS Fargate (≈ $30/mo). AI service: on-prem, $0 cloud. Supabase free tier covers Phase A. |
