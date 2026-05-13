# PRD-020 — Phase B AI Pipeline & Student Identity Roadmap (Sprint 7-12)
**Versiyon:** 1.0
**Owner:** Taha Kürşat Öztürk (product_owner) + Ali Sahil (ai_backend)
**Bağımlılıklar:** PRD-000, PRD-006, PRD-013, PRD-014, PRD-015, PRD-016, PRD-017, PRD-018, PRD-019
**Blocks:** —
**Durum:** AKTIF (planning)
**Created:** 2026-05-05
**Phase B Window:** 2026-05-26 → 2026-08-17 (12 hafta, 6 sprint × 2 hafta)

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
LogEvent: @1.3
Notification: @1.0
Camera: @1.2
ExamSession: @1.1
SessionCamera: @1.0
CameraHealthEvent: @1.0
Student: @1.2
Incident: @1.1
Sprint: @1.0
BacklogItem: @2.0
-->

## ⚠️ LLM TALİMATI

Bu PRD **Phase B execution plan**'idir; yeni feature spec'i DEĞİL. Tespit
kuralları, eşikler, scoring formülü, multi-sinyal füzyon, face enrollment
detayları **PRD-013'te** (§3.5, §3.9, §6.13, §7.2, §7.3) zaten
tanımlıdır. Custom-trained YOLO için dataset pipeline **PRD-017**'dedir.
PRD-020 sadece bu spec'leri **6 sprint × backlog item granularity**'sinde
parçalar; uygulama sırasında bir LLM bu doc + DB'deki backlog kuyruğunu
ile çalışır.

PRD-013 §7.2'deki TIER-1/2/3 detection kategorileri ve PRD-013 §7.3'teki
multi-sinyal füzyon formülü Phase B'nin **ne** yapacağını tanımlar.
PRD-020 **kim, ne zaman, hangi sprint'te** sorularını cevaplar.

---

## 1. Amaç

Demo'dan (2026-05-22) sonraki **3 aylık sprint planı**: AI service'i COCO
object-detection prototipinden **çoklu-sinyal kopya tespiti + öğrenci
kimlik eşleme + post-exam review** sistemine çevir.

Bugünkü canlı durum (Sprint 1-6 sonu):
- ✅ FastAPI + WebSocket ingest, çoklu kamera publish
- ✅ YOLOv8n COCO inference (person, cell phone, laptop, book, keyboard)
- ✅ ServerFrame fan-out → bbox + label canlı görselleştirme
- ❌ Tracking (BoT-SORT skeleton var, wire değil)
- ❌ Face mesh / gaze / head-pose (skeleton var, MediaPipe paketi yok)
- ❌ Temporal scoring (skeleton var, incident persistence yok)
- ❌ Öğrenci-track eşleme (face embedding altyapısı yok)
- ❌ Student profile / history / risk model
- ❌ Post-exam review workflow / rapor üretimi

---

## 2. Sprint Zaman Çizelgesi

| Sprint | Tarih | Tema | Çıktı |
|---|---|---|---|
| **Sprint 7** | 2026-05-26 → 06-08 | Tracking + İlk Incident | BoT-SORT canlı, `phone_in_hand` end-to-end persisted, evidence Storage |
| **Sprint 8** | 2026-06-09 → 06-22 | Face Mesh + Gaze | MediaPipe wire-up, `gaze_diversion` + `head_turn` (TIER-2) |
| **Sprint 9** | 2026-06-23 → 07-06 | TIER-1 Tamamlama | `empty_seat`, `unauthorized_person` (Phase A count), `paper_detected`, calibration |
| **Sprint 10** | 2026-07-07 → 07-20 | Student Identity | pgvector + ArcFace embedding, yoklama enrollment, track↔student eşleme |
| **Sprint 11** | 2026-07-21 → 08-03 | Profile + Risk | /students/[id] sayfa, risk skoru modeli, behavioral pattern detection |
| **Sprint 12** | 2026-08-04 → 08-17 | Review + Reports | Post-exam review akışı, decision workflow, PDF rapor üretimi |

**Toplam tahmini iş:** ~445 saat / 6 sprint = ~74 saat/sprint.
**Ekip kapasitesi:** Sprint başına 5 dev × 14 gün × 1.5 saat/gün = ~105 saat → headroom var.

---

## 3. Sprint Detayları

### 3.1 Sprint 7 — Tracking + Phone-Detected Incident End-to-End

**Hedef:** Per-person tracking devreye alınsın; ilk gerçek incident type
(`phone_in_hand`) frame'den DB'ye akıp PC'ye broadcast olsun.

**Backlog (12 item, ~80h):**

| BL | Title | dev_role | Hours | PRD ref |
|---|---|---|---|---|
| 7-01 | bytetrack/BoT-SORT dependency + tracker.py wire-up to publish_handler | ai_backend | 8 | PRD-013 §3.2, §4.2 |
| 7-02 | TrackState rolling window data structure (deque[(ts, class_id, bbox)]) | ai_backend | 6 | PRD-013 §3.2 |
| 7-03 | phone_in_hand rule: cell phone bbox + person overlap ≥3 ardışık saniye | ai_backend | 8 | PRD-013 §7.2 TIER-1, §7.3 Phase A |
| 7-04 | AI service Supabase service-role client (incident insert) | ai_backend | 4 | PRD-000, PRD-013 §7.1 |
| 7-05 | Incident evidence JPEG → Supabase Storage `incident-evidence` bucket | ai_backend | 6 | PRD-013 §21.0, PRD-019 |
| 7-06 | ServerIncident WS broadcast (gerçek incident_id, student_id null Phase A) | ai_backend | 4 | PRD-013 §3.2 |
| 7-07 | config.yaml threshold knob'ları (phone_dwell_seconds, severity_levels) | ai_backend | 3 | PRD-013 §7.3 |
| 7-08 | /api/incidents GET pagination, filters (session_id, severity, type) | portal_backend | 6 | PRD-013 §7.1 |
| 7-09 | LiveMonitor: ServerIncident card + evidence thumbnail preview | portal_frontend | 8 | PRD-019 §6.4 |
| 7-10 | /exams/[id]/incidents incident review queue (read-only Sprint 7) | portal_frontend | 10 | PRD-013 §7 |
| 7-11 | Unit tests: tracker, scoring, incident persistence (mocked Supabase) | ai_backend | 8 | PRD-011 |
| 7-12 | Benchmark prosedürü: 150-frame test set + precision/recall script | project_coordinator | 9 | PRD-013 §7.2 son ¶ |

**Schema:** Yeni migration yok — `incidents` tablosu PRD-013 §7.1'de
hazır, AI service ilk kez yazmaya başlayacak.

**AI service değişiklikleri:**
- `src/scoring/track_state.py` (yeni)
- `src/scoring/rules/phone_in_hand.py` (yeni)
- `src/persistence/incident_writer.py` (yeni — Supabase service-role client + Storage uploader)
- `src/api/publish_handler.py` (modifiye — tracker + scoring + incident write hook)

**Test senaryoları:**
- Telefon 3sn elinde → 1 incident insert + ServerIncident broadcast + evidence Storage'da görünür
- Telefon 1sn görünüp kaybolsa → incident YOK
- Aynı telefon 30sn boyunca elde → tek incident (deduplication mantığı)
- 2 ayrı kişi telefon kullansa → 2 ayrı track_id, 2 ayrı incident

**Deliverable bağlantı:** Sprint 7 sonu = ilk gerçek "AI yakaladı" hikayesi
çalışıyor. Demo materyali olarak yeniden çekim yapılabilir.

---

### 3.2 Sprint 8 — Face Mesh + Gaze/Head-Pose Rules

**Hedef:** MediaPipe FaceMesh devreye alınsın; bakış kayması ve baş
dönüşü (TIER-2 detection'lar) incident üretsin.

**Backlog (10 item, ~70h):**

| BL | Title | dev_role | Hours | PRD ref |
|---|---|---|---|---|
| 8-01 | mediapipe>=0.10.0 + insightface ön-koşulları, Dockerfile rebuild | ai_backend | 6 | PRD-013 §4.3 |
| 8-02 | FaceMeshExtractor wire-up — per track_id, frame'den landmark + yaw/pitch/roll | ai_backend | 8 | PRD-013 §4.3 |
| 8-03 | gaze_diversion rule: yaw>30° AND sustained>3s AND 5dk'da ≥3 kez | ai_backend | 8 | PRD-013 §7.2 TIER-2, §7.3 |
| 8-04 | head_turn rule: gaze ile birlikte yaw>45° AND komşu koltuk yönü | ai_backend | 6 | PRD-013 §7.2, §3.6 |
| 8-05 | TrackWindow temporal aggregation (5-dk rolling) | ai_backend | 5 | PRD-013 §7.3 |
| 8-06 | Incident.raw_signals JSONB enrichment (yaw_deg, pitch_deg, duration, history) | ai_backend | 4 | PRD-013 §7.1 |
| 8-07 | LiveMonitor: incident detail expand (raw_signals viewer, mini chart) | portal_frontend | 10 | PRD-019 |
| 8-08 | Threshold env override (YAW_THRESHOLD, GAZE_DWELL_S, etc.) | ai_backend | 3 | — |
| 8-09 | Performance: face mesh sampling (per-track, every Nth frame, max 3 yüzde) | ai_backend | 8 | PRD-013 §3.3 |
| 8-10 | Unit + integration tests for face mesh pipeline (mocked mediapipe + real fallback) | ai_backend | 12 | PRD-011 |

**Resource bumping:**
- AI service Fargate task: 1024/2048 → **2048/4096** (CPU + memory)
  — MediaPipe FaceMesh ~30ms/yüz × 3 yüz × 5 FPS ≈ 450ms/saniye CPU
  zamanı. YOLO 50ms × 5 = 250ms. Toplam ~700ms/saniye → 1 vCPU yetmez.

**Test senaryoları:**
- Öğrenci 5sn boyunca komşusuna baksa → gaze_diversion incident
- 3 kez 5dk içinde kısa bakış → kümülatif incident
- Kalem düşürme (kısa <2s glance) → incident YOK
- 2 öğrenci yan yana, biri komşusunun kağıdına baksa + komşu da ona dönse → 2 incident (her track için ayrı)

---

### 3.3 Sprint 9 — TIER-1 Tamamlama + Calibration

**Hedef:** TIER-1 detection seti tam (`empty_seat`, `unauthorized_person`,
`paper_detected`); per-rule precision/recall instrumentation.

**Backlog (10 item, ~70h):**

| BL | Title | dev_role | Hours | PRD ref |
|---|---|---|---|---|
| 9-01 | empty_seat rule: track lost ≥60s (medium) / ≥120s (high) | ai_backend | 6 | PRD-013 §7.2 TIER-1, §7.3 |
| 9-02 | unauthorized_person Phase A: person count > expected (session_students + proctors) | ai_backend | 6 | PRD-013 §7.2 TIER-1 |
| 9-03 | paper_detected rule: book/keyboard bbox + person overlap | ai_backend | 4 | PRD-013 §7.2 |
| 9-04 | Severity calibration table — per-rule confidence aggregation | ai_backend | 6 | PRD-013 §7.3 Phase A |
| 9-05 | Per-rule instrumentation: log precision/recall samples (proctor decision üzerinden) | ai_backend | 8 | PRD-013 §7.2 son ¶ |
| 9-06 | /settings/ai-thresholds admin paneli (yaw, dwell, conf threshold tuning) | portal_frontend | 10 | PRD-013 §7.3 |
| 9-07 | ai_models tablosu: model_version, weights_path, benchmark_results JSONB | portal_backend | 6 | PRD-013 §7.2 |
| 9-08 | Custom YOLO fine-tune workflow başlat (PRD-017 entegrasyon) | ai_backend | 8 | PRD-017 §5,9 |
| 9-09 | earbuds_detected — Phase B custom dataset prep + initial training run | ai_backend | 10 | PRD-013, PRD-017 |
| 9-10 | E2E test: tüm TIER-1 detections sentetik scenario (mock frame stream) | project_coordinator | 6 | PRD-011 |

**Schema:**
```sql
-- 20260623XXXXXX_create_ai_models.sql
CREATE TABLE public.ai_models (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  version           TEXT NOT NULL,
  weights_path      TEXT NOT NULL,        -- Storage path or HF URL
  active            BOOLEAN NOT NULL DEFAULT false,
  benchmark_results JSONB,                -- precision/recall per class
  trained_on        TIMESTAMPTZ,
  deployed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (name, version)
);
```

**Test senaryoları:**
- Boş oturum 90s → empty_seat MEDIUM
- 5 öğrencili sınıfta 6. kişi → unauthorized_person CRITICAL
- Masada kitap → paper_detected (sustained 5+ frame)
- Threshold panel'inde yaw 30°→25° set → live'da gaze rule daha hassas

---

### 3.4 Sprint 10 — Student Identity (pgvector + ArcFace)

**Hedef:** Her track_id sırasında bir student_id'ye eşlensin; bilinmeyen
yüzlerde `unauthorized_person` Phase B (face recognition based) tetiklensin.

**Backlog (10 item, ~80h):**

| BL | Title | dev_role | Hours | PRD ref |
|---|---|---|---|---|
| 10-01 | pgvector extension migration (Supabase) | portal_backend | 2 | — |
| 10-02 | students.face_embedding vector(512), face_embedding_updated_at, face_consent_at | portal_backend | 4 | PRD-013 §6.13 |
| 10-03 | insightface (ArcFace ResNet50) ai-service'e dependency + pre-bake model | ai_backend | 6 | PRD-013 §6.13 |
| 10-04 | FaceEmbedder class — BGR frame → 512-dim embedding | ai_backend | 8 | — |
| 10-05 | /api/students/[id]/face-enroll POST — image upload, embed, store, KVKK consent | portal_backend | 10 | PRD-013 §6.13 |
| 10-06 | Yoklama (attendance) wizard: kamera capture (3-5 frame avg embedding) | portal_frontend | 12 | PRD-013 §6.12, §6.13 |
| 10-07 | Track ↔ student matching: cosine similarity > 0.65, cache per-track | ai_backend | 8 | PRD-013 §3.5 |
| 10-08 | unauthorized_person Phase B: track'in eşleşmesi yok + 30s sustained | ai_backend | 6 | PRD-013 §7.2 |
| 10-09 | KVKK consent modal — enrollment öncesi açık rıza, audit logged | portal_frontend | 8 | PRD-013 §27 (compliance) |
| 10-10 | E2E: 5 öğrenci enroll → sınavda 5 track eşleşir + 6. kişi → Phase B incident | project_coordinator | 10 | PRD-011 |

**Schema:**
```sql
-- 20260707XXXXXX_pgvector_face_embeddings.sql
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS face_embedding vector(512),
  ADD COLUMN IF NOT EXISTS face_embedding_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS face_consent_at TIMESTAMPTZ;

-- HNSW index (Supabase pgvector 0.8+) for sub-ms cosine similarity search
CREATE INDEX IF NOT EXISTS idx_students_face_embedding
  ON public.students USING hnsw (face_embedding vector_cosine_ops);
```

**Resource bumping:**
- ArcFace ResNet50 ~150ms/embedding/CPU. Per-track 1 embedding/lifetime
  (cached) = uygun; per-frame değil. Image bake-time +~200MB.

**Test senaryoları:**
- Yoklama'da 3 frame'le enroll → face_embedding NOT NULL → updated_at güncel
- Sınavda enrolled student kameraya bakar → 30s içinde track eşleşir
- Eşleşmemiş kişi 30s+ → unauthorized_person Phase B incident
- Aynı öğrencinin track_id değişse (occlusion sonrası) → re-match aynı student_id

---

### 3.5 Sprint 11 — Student Profile + Risk Model

**Hedef:** Her öğrenciye geçmiş + risk skoru. Sınava giren yüksek riskli
öğrenci proktora pre-warning gönderir.

**Backlog (10 item, ~75h):**

| BL | Title | dev_role | Hours | PRD ref |
|---|---|---|---|---|
| 11-01 | /students/[id] profile sayfası (demo + risk + past sessions) | portal_frontend | 12 | — |
| 11-02 | Risk score model: weighted incident severities + rolling avg + trend | portal_backend | 10 | PRD-013 §7.3 |
| 11-03 | /api/students/[id]/profile + /api/students/[id]/incidents (paginated) | portal_backend | 6 | — |
| 11-04 | Incidents timeline: chronological feed, severity-colored | portal_frontend | 6 | — |
| 11-05 | Behavior pattern detection: chronic phone-checker, sustained stranger interaction | ai_backend | 8 | PRD-013 §7.3 |
| 11-06 | Pre-session high-risk notification: chief proctor warned (PRD-016) | portal_backend | 6 | PRD-016 |
| 11-07 | Student tile in /exams/[id]/sessions — risk badge | portal_frontend | 5 | — |
| 11-08 | Charts: incident frequency over time, severity distribution (recharts) | portal_frontend | 8 | PRD-018 §6.8 (existing chart patterns) |
| 11-09 | Per-student calibration: thresholds adjust per known fidgety students | ai_backend | 6 | PRD-013 §7.3 |
| 11-10 | Privacy: profile only visible to assigned proctors + admins (RLS check) | portal_backend | 4 | PRD-013 §27 |
| 11-11 | Tests + integration | project_coordinator | 4 | PRD-011 |

**Risk score formülü (PRD-020 v1.0 önerisi):**
```
session_risk(s) = Σ_incidents(s) severity_weight(i) × confidence(i)
   severity_weight: low=0.1, medium=0.3, high=0.6, critical=1.0

student_risk(student) = α × current_session_risk
                      + (1-α) × rolling_avg(last 5 sessions)
   α = 0.7 (recent sessions weigh more)
```

Eşikler: <0.2=clean, 0.2-0.5=watch, 0.5-0.8=high, >0.8=critical.

---

### 3.6 Sprint 12 — Review Workflow + Auto-Reports

**Hedef:** Post-exam, proktor incident'lara karar verir; otomatik PDF
raporlar üretilir + ilgili kişilere gönderilir.

**Backlog (11 item, ~70h):**

| BL | Title | dev_role | Hours | PRD ref |
|---|---|---|---|---|
| 12-01 | /exams/[id]/review post-exam decision sayfası | portal_frontend | 12 | PRD-013 §7.1 (proctor_decision) |
| 12-02 | Decision modal: clean / suspicious / violation + notes + escalate | portal_frontend | 6 | — |
| 12-03 | Bulk decision actions (örn tüm phone_detected'ı violation marka) | portal_frontend | 4 | — |
| 12-04 | Evidence preview: full-res JPEG zoom + ±15s frame buffer (clip) | portal_frontend | 10 | PRD-013 §21.0 |
| 12-05 | PDF rapor üretimi (Puppeteer in API route): per-session, per-student, per-exam | portal_backend | 10 | PRD-015 |
| 12-06 | Rapor email distribution (PRD-014 SMTP) — chief proctor + admin | portal_backend | 6 | PRD-014 |
| 12-07 | Audit trail: every decision → audit_logs + backlog_activity-style row | portal_backend | 4 | PRD-006 |
| 12-08 | Evidence export: zip download (raw JPEG'ler + JSON metadata) — legal hold | portal_backend | 6 | PRD-013 §27 |
| 12-09 | /exams/analytics trends dashboard (cross-exam patterns) | portal_frontend | 8 | PRD-013 §7 |
| 12-10 | Notification: rapor hazır → admin in-app + email (PRD-016) | portal_backend | 4 | PRD-016 |
| 12-11 | Integration tests + manual QA full-cycle (enroll → exam → review → report) | project_coordinator | 8 | PRD-011 |

**Test senaryoları:**
- 3 incident'lı session'da 2'sini violation, 1'ini clean → review tamam
- PDF rapor: incident özeti + thumbnail + decision + audit timestamp
- Bulk action: 10 phone_detected → tek tıkla violation
- Evidence zip: tüm JPEG'ler + decisions.json indirilir
- Rapor mail: chief proctor inbox'ında PDF eki

---

## 4. Cross-Cutting Concerns

### 4.1 Resource Sizing Roadmap

| Sprint | AI service Fargate | Sebep |
|---|---|---|
| Bugün (Sprint 6) | 1024 CPU / 2048 MB | YOLO only |
| Sprint 8 sonu | **2048 CPU / 4096 MB** | + MediaPipe FaceMesh |
| Sprint 10 sonu | **2048 CPU / 6144 MB** | + ArcFace embedding (model RAM) |
| Sprint 12 | Aynı + horizontal scale (2 task) | Production load |

CDK service-stack güncellemeleri her sprint'in son commit'inde yapılır.

### 4.2 Storage Lifecycle

**Incident evidence (`incident-evidence` bucket):**
- Hot tier: ilk 30 gün — proktor review için anlık erişim
- Archive: 30 gün–1 yıl — gerekirse legal hold için saklanır
- Delete: 1 yıl sonra (KVKK retention limit)
- Sprint 7'de bucket + lifecycle policy kurulur

**Face embeddings:**
- Saklanır ama sınav sonrası 6 ay aktif → silinir (KVKK)
- Re-enrollment her dönem zorunlu

### 4.3 KVKK / Compliance

- **Açık rıza:** Yoklama enrollment'ten önce öğrenci rıza modal'ında onay verir (`students.face_consent_at`)
- **Saydamlık:** Öğrenciler `/me/data` sayfasından kendi embedding'ini ve incident'larını görür
- **Silme hakkı:** Öğrenci talep ederse embedding null + incident'lar pseudonymize
- Sprint 10 ve 12'de bu maddeler yer alır

### 4.4 PRD-013 vs PRD-020 Sınırı

PRD-013 = WHAT (ne tespit ediyoruz, hangi eşikler, hangi mimari).
PRD-020 = WHEN/HOW (sprint, atama, sıra, deliverable).

Spec değişiklikleri PRD-013'e yapılır; PRD-020 sprint'lerini güncellemez
(yeni backlog item ekler).

**Phase C Continuation:** Sprint 12 sonrası (Sprint 13-18) **PRD-021**'de
tanımlanmıştır. PRD-020 Sprint 7-12 ile sınırlıdır.

### 4.5 Risk Register

| Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|
| MediaPipe Fargate'te yavaş çalışır | Orta | Yüksek | Sprint 8-09 sampling + N-th frame; gerekirse GPU instance (out of Fargate scope) |
| ArcFace embedding doğruluğu düşük (sınıf ışığı) | Yüksek | Orta | Yoklama'da 3-5 frame avg; sınıf koşulunda benchmark Sprint 10 sonu |
| Storage maliyeti patlar (3GB image × incident) | Düşük | Yüksek | Evidence sadece triggering frame + ±5 frame, max 30s clip |
| KVKK denetimi face embedding'leri reddeder | Düşük | Kritik | Açık rıza + opt-out path + öğrenci talebinde silme |
| Custom YOLO eğitim datası yetersiz | Yüksek | Orta | PRD-017 §11 sınıf-içi auto-collection; demo öncesi initial 5K frame |
| AI service single point of failure | Orta | Yüksek | Sprint 12 horizontal scale (2+ Fargate task) + Redis pub/sub broadcaster |

### 4.6 Performance Budget

Hedef: 5 FPS × 3 kamera × 1 session = 15 frame/sn AI service'te işlenebilir.

| Component | Budget per frame | Status |
|---|---|---|
| YOLO inference | 50ms | ✅ measured |
| BoT-SORT update | 5ms | Sprint 7 measure |
| FaceMesh per face × 3 | 90ms | Sprint 8 measure |
| ArcFace cached → 0 (per-track once) | 0 | Sprint 10 measure |
| Scoring + persistence | 10ms | Sprint 7 measure |
| **Total** | **155ms/frame** | 5 FPS = 200ms budget → ✓ |

Eğer >200ms olursa: per-track sampling (FaceMesh her 2 frame'de bir).

---

## 5. Tip Tanımları (Yeni / Güncellenen)

PRD-020 yeni interface introduce **etmez**; mevcut interface'leri kullanır:
- `Incident @1.1` — PRD-013 (raw_signals, proctor_decision, decided_by, decided_at)
- `Student @1.1` — PRD-013 (Sprint 10'da face_embedding/consent fields eklenirse → `Student @1.2` minor bump, PRD-013'te yapılır)
- `LogEvent @1.2` — PRD-000 (camera.*, ai.*, proctor.* event'leri Sprint 7+ kullanır)

**Sprint 10'da Student @1.2 bump:**
```typescript
// PRD-013 update'te yapılacak
interface Student {
  // ... existing fields ...
  face_embedding: number[] | null;       // 512-dim, null = enrollment yok
  face_embedding_updated_at: string | null;
  face_consent_at: string | null;        // KVKK rıza zaman damgası
}
```

---

## 6. Key Files (sprint başına yeni/değişen)

### Sprint 7
- `ai-service/requirements.txt` — bytetrack
- `ai-service/src/scoring/track_state.py`, `rules/phone_in_hand.py`
- `ai-service/src/persistence/incident_writer.py`
- `portal/app/api/incidents/route.ts`
- `portal/app/(protected)/exams/[id]/incidents/page.tsx`

### Sprint 8
- `ai-service/requirements.txt` — mediapipe
- `ai-service/src/scoring/rules/gaze_diversion.py`, `rules/head_turn.py`
- `infra/lib/ai-service-stack.ts` — cpu/memory bump

### Sprint 9
- `ai-service/src/scoring/rules/empty_seat.py`, `rules/unauthorized_person.py`, `rules/paper_detected.py`
- `portal/supabase/migrations/{ts}_create_ai_models.sql`
- `portal/app/(protected)/settings/ai-thresholds/page.tsx`

### Sprint 10
- `portal/supabase/migrations/{ts}_pgvector_face_embeddings.sql`
- `ai-service/requirements.txt` — insightface
- `ai-service/src/identity/face_embedder.py`
- `portal/app/api/students/[id]/face-enroll/route.ts`
- `portal/components/students/FaceEnrollmentWizard.tsx`

### Sprint 11
- `portal/app/(protected)/students/[id]/page.tsx`
- `portal/lib/risk/risk_score.ts`
- `portal/components/students/StudentRiskBadge.tsx`

### Sprint 12
- `portal/app/(protected)/exams/[id]/review/page.tsx`
- `portal/components/exams/IncidentDecisionModal.tsx`
- `portal/lib/reports/generator.ts` (Puppeteer)
- `portal/app/api/reports/exam/[id]/route.ts`

---

## 7. Migration Order + Dependency Graph

```
Sprint 7  ──[ tracking, scoring, incident write ]──┐
                                                    │
Sprint 8  ─[ mediapipe, gaze, head_turn ]──────────┤
                                                    │
Sprint 9  ─[ tier-1 complete, calibration ]────────┤
                                                    ↓
Sprint 10 ─[ pgvector, face embedding, match ]──→ Sprint 11
                                                    ↓
Sprint 11 ─[ student profile, risk, notifications ]→ Sprint 12
                                                    ↓
Sprint 12 ─[ review, decision, reports ]──────────END
```

Sprint 7-8-9 paraleldir görece (farklı dev_role'lere paslanabilir).
Sprint 10 Sprint 11'i blocker; Sprint 12 hepsini blocker.

---

## 8. Phase B Success Criteria (Sprint 12 sonunda)

✅ AI service production'da:
- Real-time tracking + 6+ incident type tespit eder
- Her incident için evidence Storage'da
- Latency < 200ms/frame ortalama

✅ Öğrenci sistemi:
- Yoklama'da face enroll edilmiş öğrenciler track'lere eşleşir
- Bilinmeyen kişi → unauthorized_person Phase B
- Her öğrencinin profile sayfasında risk skoru + history

✅ Review akışı:
- Proktor post-exam tüm incident'lara karar verebilir
- PDF raporlar otomatik üretilir + email'le dağıtılır
- Audit trail eksiksiz

✅ Operasyonel:
- 3 paralel session × 3 kamera = 9 stream simultane → kasma yok
- Storage maliyeti aylık <$30 (yaklaşık 100 sınav)
- KVKK uyumlu (consent + retention + silme hakkı)

---

## 9. Breaking Changes Geçmişi

| Versiyon | Değişiklik |
|---|---|
| 1.0 | İlk sürüm — Sprint 7-12 detaylı plan, PRD-013 §7 + PRD-017 + PRD-019 entegrasyonu |
