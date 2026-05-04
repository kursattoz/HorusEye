# HorusEye — Return of Materials Checklist (D10)

**Deadline:** 2026-05-22
**Owner:** Çağla Abazaoğlu (project_coordinator)

---

This is the master inventory the jury and the supervisor expect on the
final submission day. Tick each row off as the artefact is uploaded /
returned. Where a row says "link →" replace the placeholder URL with
the actual one.

## 1. Reports + documents

- [ ] **D1 — Low-Level Design Report v1** (PDF) — `docs/HorusEye-LLD-Report.pdf`
- [ ] **D2 — TODO / Backlog v1** (PDF) — link →
- [ ] **D3 — Low-Level Design Report v2** (PDF) — link →
- [ ] **D4 — TODO / Backlog v2** (PDF) — link →
- [ ] **D5 — Test Plan Report** (PDF) — link →
- [ ] **D6 — TODO / Backlog v3** — `docs/HorusEye-TODO-Backlog-v3.md` (export to PDF)
- [ ] **D7 — Final Report** — `docs/HorusEye-Final-Report-skeleton.md` (fill, then export to PDF)
- [ ] **D8 — TODO / Backlog v4** — `docs/HorusEye-TODO-Backlog-v4.md` (export to PDF)
- [ ] **D9 — Presentation slides + demo recording** — see `docs/HorusEye-Presentation-Plan.md`
- [ ] PRD master matrix (PRD-000) — confirm all interface versions match shipped code

## 2. Code + repositories

- [ ] GitHub repo URL + access for the supervisor — `https://github.com/kursattoz/HorusEye`
- [ ] Tag the final commit on `main` — proposal: `v1.0.0-final`
- [ ] Latest production deploy SHA — fill from CI run page
- [ ] Latest CI run + Deploy run links

## 3. Environments

- [ ] **Portal (production)** — `https://horuseye.app` running
- [ ] **Portal (staging)** — `https://staging.horuseye.app` running
- [ ] **Supabase project** — Horus Eye (`lvannuajbkrbwamzussh`) — confirm RLS audit is clean
- [ ] **AWS account** — handed off / kept on TEDU billing? Decide and document.
- [ ] **AI service Docker image** — pushed somewhere durable; document the run command in README

## 4. Hardware / loaned equipment

- [ ] IP cameras (if loaned)
- [ ] Tripods / mounts
- [ ] Demo laptop / Raspberry Pi / Jetson (if used)
- [ ] Adapters, cables, power strips
- [ ] Sample exam booklets / props for the demo recording

## 5. Datasets + artefacts

- [ ] Sample student CSV — `docs/sample-students.csv`
- [ ] Demo video clips (raw + edited) — Drive folder link →
- [ ] YOLOv8n weights file (`models/yolov8n.pt`) — note the file ships baked into the Docker image
- [ ] Any PII in datasets has been anonymised before submission

## 6. Accounts handed off

- [ ] Supabase team access list reviewed — owner stays Kürşat post-graduation, others removed if requested
- [ ] AWS IAM users reviewed
- [ ] GitHub team access reviewed
- [ ] Domain (`horuseye.app`) renewal / transfer plan documented

## 7. Final sanity checks (the day before)

- [ ] `/api/health` returns 200 in production
- [ ] `npm run build` succeeds locally on a fresh clone
- [ ] `docker compose up` brings up the AI service with no manual fixes
- [ ] Sample exam can be created end-to-end in <2 minutes
- [ ] Recording URL plays without auth in an incognito window
