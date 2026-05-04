# HorusEye — TODO / Backlog v3 (D6)

**Project:** HorusEye — AI-Based Exam Proctoring System
**Course:** TED University CMPE 492 — Senior Project
**Document version:** v3
**Snapshot date:** 2026-05-04
**Maintainer:** Çağla Abazaoğlu (project_coordinator)

---

## 1. Executive Summary

| Metric | Value |
|---|---|
| Total tracked items (BL-#) | 168 |
| Sprints completed | Sprint 1 ✅, Sprint 2 ✅ |
| Sprint in progress | Sprint 3 (active) — 7 / 8 done |
| Sprint upcoming | Sprint 4 — 71 items, 451 h estimated |
| Unassigned backlog | 29 items, 123 h |
| Estimated remaining (S3+S4 only) | 454 h |

Sprint 1 ve Sprint 2 başarıyla tamamlandı. Sprint 3, Camera/AI modülünün veri ve servis altyapısını kurmak için **8 öncü item**'a daraltılarak yeniden ölçeklendi. Tüm 7 yazılım item'ı tamamlandı; geriye sadece bu doküman (D6) kaldı. Sprint 4, hem PRD-013 Phase A wrap-up hem de final teslimleri (D7-D10, sunum, demo) içerir ve önceliklendirme zorunluluğu vardır.

---

## 2. Sprint Snapshot

| Sprint | Tarih aralığı | Status | Done / Total | Est. h | Aktüel h |
|---|---|---|---|---|---|
| 1 — LLD v2 & Core Features | 2026-03-22 → 2026-04-04 | completed | 31 / 31 | 92 | 48 |
| 2 — Test Plan & Notification Wiring | 2026-04-05 → 2026-04-18 | completed | 29 / 29 | 109 | 0 |
| 3 — Camera Module & AI Backbone | 2026-04-19 → 2026-05-08 | active | 7 / 8 | 57 | 14 |
| 4 — Final Report, Presentation & Polish | 2026-05-09 → 2026-05-22 | planning | 0 / 71 | 451 | 0 |
| Backlog (unassigned) | — | — | 0 / 29 | 123 | 0 |

**Not — actual hours:** Sprint 1 ve 2'de bireysel "actual_hours" kayıtları seyrek tutuldu (Sprint 2 = 0 h logged). Velocity hesabı için Sprint 3'ten itibaren her commit ile güncellenecek (otomasyon: `backlog_activity.hours_logged`).

---

## 3. Deliverable Takvimi (PRD-015)

| Kod | Başlık | Deadline | Status | Owner |
|---|---|---|---|---|
| D1 | Low-Level Design Report (v1) | 2026-03-20 | ✅ completed | Çağla |
| D2 | TODO / Backlog (v1) | 2026-03-20 | ✅ completed | Çağla |
| D3 | Low-Level Design Report (v2) | 2026-03-27 | pending | Çağla |
| D4 | TODO / Backlog (v2) | 2026-03-27 | pending | Çağla |
| D5 | Test Plan Report | 2026-04-10 | pending | Çağla |
| **D6** | **TODO / Backlog (v3)** | **2026-04-10** | **completed (this doc)** | Çağla |
| D7 | Final Report | 2026-05-15 | pending | Çağla + ekip |
| D8 | TODO / Backlog (v4) | 2026-05-15 | pending | Çağla |
| D9 | Presentation & Demo (25 dk) | 2026-05-22 | pending | Çağla + ekip |
| D10 | Return of Materials | 2026-05-22 | pending | Çağla |

**Risk:** D3, D4, D5 nominal deadline'ları (Mart-Nisan) geçti. Snapshot tarihinden bakıldığında pratikte D7/D8/D9/D10 final dönemine kümelenmiş durumda. Sprint 4 capacity buna göre ayarlanmalı.

---

## 4. Sprint 3 — Aktif Sprint Detayı

**Hedef:** PRD-013 Phase A için "AI Backbone" — exam yönetimi DB'si, incident DB'si, student CSV import, AI service WS protokolü, RTSP capture ve YOLOv8n inference pipeline'ı kurmak.

| BL | Title | Pri | PRD | Owner | Status | Est | Aktüel |
|---|---|---|---|---|---|---|---|
| 30 | TODO/Backlog v3 — prepare & upload (D6) | crit | PRD-015 | Çağla | **completed** ← bu doküman | 3 | 1.0 |
| 42 | [Phase A] AI pipeline — YOLOv8n COCO pre-trained | crit | PRD-013 | Ali | done | 16 | 4.0 |
| 49 | [Phase A] Camera RTSP stream ingestion | crit | PRD-013 | Taha | done | 8 | 3.0 |
| 130 | [Phase A] Exam management DB schema | crit | PRD-013 | Gizem | done | 10 | 1.5 |
| 120 | [Phase A] AI service — WebSocket message protocol | high | PRD-013 | Ali | done | 4 | 1.5 |
| 122 | [Phase A] Student management — DB schema + bulk upload | high | PRD-013 | Gizem | done | 8 | 2.5 |
| 129 | [Phase A] Incident DB schema + detection categories | high | PRD-013 | Gizem | done | 6 | 1.0 |
| 138 | [Phase A] Camera module env vars (SSM + CDK + .env) | med | PRD-013 | Taha | done | 2 | 0.5 |

### 4.1 Kapsam Dışına Alınanlar (Sprint 3 → Sprint 4 / Backlog)

Sprint 3 başlangıcında 58 item vardı; 7 öncü item korundu, geri kalanlar dağıtıldı:

**Sprint 4'e roll edildi (22 item):**
- Exam mgmt UI/API: BL-124, 144, 134, 161, 140, 131, 145, 136
- Incident & Student UI: BL-121, 123
- AI Phase A.1: BL-48, 149, 156, 41, 147
- WS relay & deploy: BL-55, 166, 165, 135
- Testing: BL-50, 51, 52

**Backlog'a düşürüldü (29 item):**
- Phase B/C (multi-cam, fusion, OCR, LSTM): BL-119, 126, 146, 151-155, 157-158, 162-164, 168
- Inline annotation: BL-100, 101, 102, 105, 106
- Polish/low-pri: BL-54, 93, 94, 96, 107
- Monitor/PWA polish: BL-43-46, 53, 95, 97, 98, 99
- Diğer medium-pri: BL-40, 47, 103, 104, 132, 143, 148

---

## 5. Sprint 4 — Final Sprint Plan

**Tarih:** 2026-05-09 → 2026-05-22 (14 gün)
**Capacity (5 kişi × ~25 h/hafta × 2 hafta):** ~250 h
**Estimated content:** 451 h ← **fazla scope.** Aşağıda 3 öncelik kuşağına ayrıldı.

### 5.1 Final teslim "P0" — must-have (mezuniyet için zorunlu)

| BL | Title | Pri | Owner | h |
|---|---|---|---|---|
| 67 | Final Report — write & submit (D7) | crit | Çağla | 12 |
| 68 | Final Report — her üye kendi bölümünü | crit | Çağla + ekip | 15 |
| 56 | TODO/Backlog v4 (D8) | crit | Çağla | 3 |
| 62 | Presentation & Demo — 25 dk recording (D9) | crit | Çağla + ekip | 10 |
| 66 | Return of Materials (D10) | crit | Çağla | 2 |
| 117 | [Phase A] Live monitoring page — single cam + alerts | crit | Taha | 12 |
| 167 | [Phase A] Demo day preparation checklist | crit | Taha | 4 |
| **P0 toplam** | | | | **58 h** |

### 5.2 "P1" — should-have (demoyu güçlendirir)

| BL | Title | Pri | Owner | h |
|---|---|---|---|---|
| 124 | [Phase A] Exam CRUD API routes | high | Gizem | 8 |
| 144 | [Phase A] Exam creation wizard — 5-step | high | Taha | 12 |
| 121 | [Phase A] Incident API + evidence upload | high | Gizem | 6 |
| 55 | [Phase A] WebSocket relay — AI ↔ Portal | high | Taha | 6 |
| 118 | [Phase A] Live video overlay — bbox + risk | high | Taha | 8 |
| 41 | [Phase A] Rule-based incident scoring | high | Ali | 6 |
| 48 | [Phase A] BoT-SORT single-camera tracking | high | Ali | 8 |
| 50 | E2E tests — full user journeys | high | Çağla | 10 |
| 65 | Poster — "Genç Beyinler" event | high | Çağla | 6 |
| 63 | Bug fix sprint — final QA pass | high | Hilal | 8 |
| 60 | [Phase A] AI performance report generation | high | Ali | 6 |
| 64 | YOLOv8 fine-tuning on custom dataset | high | Ali | 12 |
| **P1 toplam** | | | | **96 h** |

### 5.3 "P2" — nice-to-have (zaman kalırsa)

Geri kalan ~50 medium/low pri item — exam UI polish, mobile bottom nav, avatar refresh, gaze overlay, fine-tuning UI vb. Bunlar P0+P1 bittikten sonra kalan saatlerle yapılır.

**Tavsiye:** P0+P1 = 154 h ≈ ekibin 2 haftalık nominal kapasitesinin %62'si. Realistic. P2'den ne girer, sprint review'da gün gün karar verilsin.

---

## 6. Tamamlanmış Özellikler (Mezuniyet sunumu için referans)

### Sprint 1 — Çekirdek Platform
- Sprint & Backlog yönetim sistemi (PRD-018) — tablolar, API, Kanban UI, dependency graph, analytics, review workflow (BL-9, 13, 14, 15, 71, 72)
- LLD v2 raporu güncellemesi (BL-18)
- TODO/Backlog v2 dokümanı (BL-19)
- Notification settings + audit logging (BL-8, 4)
- RLS audit + force_password_change middleware + password policy (BL-5, 75, 76)
- ErrorBoundary + color theming + sidebar persistence (BL-73, 74, 77)
- PWA install + offline page (BL-2)
- Husky pre-commit + PRD validator script (BL-78)
- Reports list — kategori kartları, hafta gruplama, dosya yükleme (BL-1, 21, 22)
- E2E tests baz set (BL-12) + Unit tests baz set (BL-6)

### Sprint 2 — Test Plan & Notification Wiring + UX Iyileştirmeleri
- Test Plan Report (D5) (BL-31)
- Notification triggerları: file upload/update/delete, feedback, checklist completion (BL-25, 38, 39, 28)
- Welcome email + email template trigger doğrulamaları (BL-27, 37)
- Forgot password / reset flow (BL-33) — Sprint 3'te /auth/callback ile end-to-end tamamlandı
- API integration tests (BL-34)
- OTP doğrulama tam entegrasyonu (BL-91)
- Page visit tracking + auto-log middleware (BL-35, 89)
- File access link gating (@tedu.edu.tr) (BL-80)
- Trash/recycle UI (BL-23)
- Files tablosu — inline name/category/description edit, drag-reorder, sort (BL-83, 84, 85)
- PDF render error UX (BL-86)
- Public file type filter, public+auth feedback merge view (BL-87, 92)
- Users tab — search/filter, role edit, activate/deactivate, password reset (BL-82, 88)
- Session management UI + session expired modal (BL-79, 29)
- Notification 90-day cleanup cron (BL-26)
- AI service iskeleti — FastAPI, Docker, /health (BL-24)
- Guest session tracking (sessionStorage) (BL-90)

### Sprint 3 — Phase A AI Backbone (kod kısmı)
- **DB:** exams + exam_rooms + cameras + exam_sessions + session_proctors + session_students + students + incidents + incident_rescoring_history (BL-130, 122, 129)
- **API:** /api/students CRUD + /api/students/import (CSV upsert) (BL-122)
- **Types:** PRD-000 §3.9-3.14 interface'ler (Exam, ExamRoom, Camera, ExamSession, Student, Incident @1.1) portal/types/index.ts içine eklendi
- **AI service:** WS protokol v1.0 (TypedDict + TS), handshake + auth + ping/unsubscribe (BL-120)
- **AI service:** RTSP capture orchestrator — async, reconnect with backoff, FPS throttling, queue drop strategy (BL-49)
- **AI service:** YOLOv8n detector + Phase A scoring stub (BL-42, partial — model fine-tuning Sprint 4'te)
- **Infra:** 4 yeni AI service env var × 2 ortam = 8 SSM param (`AI_SERVICE_URL`, `AI_SERVICE_WS_URL`, `NEXT_PUBLIC_AI_SERVICE_WS_URL`, `AI_SERVICE_API_KEY`); CDK service-stack.ts ve .env.example güncellendi (BL-138)

---

## 7. Cross-Review Matrisi (PRD-018 §11)

| Geliştirici | dev_role | Reviewer |
|---|---|---|
| Tuğba Hilal Kırer | portal_frontend | Gizem (portal_backend) |
| Gizem Nur İpek | portal_backend | Tuğba Hilal (portal_frontend) |
| Ali Sahil | ai_backend | Çağla (project_coordinator) |
| Taha Kürşat Öztürk | fullstack / product_owner | Gizem (portal_backend) |
| Çağla Abazaoğlu | project_coordinator | Taha Kürşat (product_owner) |

---

## 8. Açık Riskler & Aksiyonlar

| # | Risk | Etki | Aksiyon | Owner |
|---|---|---|---|---|
| R1 | Sprint 4 estimated 451 h, capacity ~250 h | Final teslimleri kaçırma | P0+P1 = 154 h'a odaklan, P2 stretch | Taha (PO) |
| R2 | actual_hours kayıt boşluğu (S1+S2 = 48+0) | Velocity tahmini bozuk | Sprint 4 boyunca her status değişiminde hours_logged zorunlu | Tüm ekip |
| R3 | YOLOv8 fine-tuning custom dataset (BL-64) gerçek sınıf verisi gerektirir | Demo doğruluğu | Phase A: COCO pre-trained yeterli; fine-tuning post-Sprint 4'e ertelenebilir | Ali |
| R4 | Çağla'da kümelenmiş 5 kritik deliverable (D7-D10 + poster) | Tek kişide darboğaz | Final Report'u BL-68 üzerinden ekibe parçala | Çağla |
| R5 | AI service AWS deploy yok | Live demo'da single point of failure | Phase A: on-prem Docker yeterli; Sprint 4'te BL-165 (CDK ECS task def) yapılırsa bonus | Taha |
| R6 | D3/D4 deliverable'ları "pending" görünüyor (deadline geçti) | Tutarsız kayıt | Eski deadline'lar revize edilip uygun status verilmeli | Çağla |

---

## 9. Versiyon Geçmişi

| Sürüm | Tarih | Notlar |
|---|---|---|
| v1 (D2) | 2026-03-20 | İlk backlog — Sprint 1 başlangıç |
| v2 (D4) | 2026-03-27 | Sprint 1 ortası güncelleme |
| **v3 (D6)** | **2026-05-04** | **Sprint 1 + 2 close, Sprint 3 active, Sprint 4 plan** |
| v4 (D8) | 2026-05-15 | Sprint 4 sonu güncelleme (planlanmış) |

---

*Bu doküman canlı backlog DB'sinden (Supabase `backlog_items`) otomatik üretilmiştir. Numune ID'ler için Sprint Board UI'da `/sprints/{sprint_id}` ya da `/sprints/analytics` görünümlerini kullanın.*
