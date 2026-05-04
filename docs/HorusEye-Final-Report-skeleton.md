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

> Each member owns their section. Aim for ≤ 1 page per member.

### 6.1 Taha Kürşat Öztürk (product_owner / fullstack)
TODO

### 6.2 Tuğba Hilal Kırer (portal_frontend)
TODO

### 6.3 Gizem Nur İpek (portal_backend)
TODO

### 6.4 Ali Sahil (ai_backend)
TODO

### 6.5 Çağla Abazaoğlu (project_coordinator)
TODO

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
