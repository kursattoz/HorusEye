# Post-Sync Iyileştirme Planı — Canlı İzleme, Dataset, Sidebar, Yoklama

**Tarih:** 2026-05-15
**Yazar:** AI analiz + verification (Claude Code)
**Durum:** PLAN — implementasyon **bu oturumda yapılmayacak**
**Önkoşul:** Aşağıdaki "Branch Sync" adımı tamamlanmadan implementasyona başlanmayacak.

---

## 0. Önkoşul — Branch Sync (HEMEN, başka adımdan önce)

Implementasyona başlamadan önce sürdürülen tüm dal değişiklikleri `develop`'a, oradan `main`'e (production'a) eşitlenecek. Bu plan ancak production = develop = local olduktan sonra hayata geçer.

**Yapılacak (ayrı oturumda):**
1. Açık tüm feature branch'leri gözden geçir, mergeable olanları `develop`'a merge et
2. `develop` → `main` PR aç, CI/CD yeşil → staging dumanı (`staging.horuseye.app`) doğrula
3. `main` deploy'unun `horuseye.app`'e gittiğini doğrula
4. Bu plan dokümanı `main`'de mevcut olunca implementasyon oturumuna geçilir

**Neden:** Sidebar yeniden yapılandırması, attendance ekranı eklenmesi gibi UI değişiklikleri kullanıcıların gördüğü her ortamda eşit olmalı. Yarım merge edilmiş branch üstüne yeni iş binince merge çatışmaları katlanır.

---

## 1. Bağlam

Bu plan iki ayrı analiz turunun (canlı izleme + dataset gap analizi ve evidence/face match verification) çıktısını birleştirir. Bulgular:

- **Canlı izleme:** WebSocket akışı + YOLO-World + incident worker çalışıyor. Evidence kaydında **atomicity hatası** var (orphan kayıt riski).
- **Face matching:** InsightFace `buffalo_l` + pgvector HNSW + 0.65 cosine threshold ile **uçtan uca çalışıyor**. Ancak **sınav öncesi yoklama (attendance) ekranı yok** — sadece runtime izleme aktif.
- **Sidebar:** Custom React component, role-based filter var, ancak **collapsible/accordion grup yok**. Project Management sidebar'da üstte, Exam Module altta.
- **Dataset:** Sprint 14 altyapısı (importer/validate/merge/anonymize scriptleri + tablo + bucket) kuruldu, fakat **özel model eğitilip register edilmedi**, drift/quality observability yok, Sprint 17–18 davranış/füzyon kuralları eksik.

---

## 2. Verification Bulguları (Read-only)

### 2.1 Canlı İzleme Evidence Recording — Durum: ⚠ Kısmi

**Çalışan:**
- `ai-service/src/api/publish_handler.py:280-406` — incident worker queue (BL-248) doğru kurulu, non-blocking put
- `ai-service/src/persistence/incident_writer.py:69-93` — JPEG → `incident-evidence` bucket, path `{session_id}/{incident_id}.jpg`
- `portal/supabase/migrations/20260504102900_create_incident_evidence_bucket.sql` — bucket **private**, RLS ile authenticated kullanıcılar kendi evidence'larına erişebiliyor
- `portal/app/api/incidents/[id]/evidence/route.ts:97` — 5 dakika expiry signed URL
- `LiveMonitor.tsx` + `IncidentCard.tsx:34-68` — live overlay + signed URL fetch + preview çalışıyor

**Bozuk / Eksik:**
- **Atomicity yok** (`incident_writer.py:77-93`): Storage upload fail olursa `evidence_path=None` ama DB insert yine olur → orphan DB row. DB insert fail olursa storage'daki JPEG kalır → orphan dosya. İki write arasında transaction yok.
- **Queue overflow** (`_INCIDENT_QUEUE_MAXSIZE=100`, satır 298): Burst sırasında incident drop ediliyor, sadece log'lanıyor.
- **Multi-evidence UI yok:** `evidence_paths` array olsa da `IncidentCard` sadece ilkini gösteriyor.
- **`signed_url_expiry` DB alanı yok:** `types/index.ts` referans veriyor ama schema'da kolon yok.
- **Audit log yok:** Hangi proctor hangi incident'i ne zaman gördü — kayıt yok.
- **Orphan cleanup yok:** Storage'da artık DB'de karşılığı olmayan dosyalar için cron temizlik yok.

### 2.2 Face Matching — Durum: ✓ Çalışıyor (Kısmi)

**Çalışan:**
- DB şeması: `students.face_embedding vector(512)`, HNSW cosine index (`20260505133152_add_face_embedding_to_students.sql`)
- KVKK consent: `face_consent_at` (BL-222)
- Model: InsightFace `buffalo_l` (RetinaFace + ArcFace ResNet50), 512-dim L2-normalized — `ai-service/src/identity/face_embedder.py` (BL-217)
- Enrollment UI: `FaceEnrollmentWizard.tsx` (BL-219) → `/api/students/[id]/face-enroll` → AI service `/embed` → DB
- Runtime match: `ai-service/src/identity/student_matcher.py` (BL-220) — per-track bbox → embedding → pgvector RPC, threshold 0.65, 30s miss cooldown, track cache
- Match fail davranışı: 30s sustained yoksayma sonrası `unauthorized_person_phase_b` CRITICAL incident
- E2E test: `test_pipeline_face_match_e2e.py` — 5 enrolled + 1 intruder senaryosu geçiyor

**Eksik:**
- **Pre-exam attendance UI yok** — face match yalnızca runtime'da; sınav başlamadan önce öğrenci "kameraya bak, doğrula" akışı yok
- **Liveness check yok** — fotoğraf/ekran/3D maske attack koruması mevcut değil (anti-spoofing)
- **Enrollment tek frame:** Sprint 11'de 3-5 frame burst planı var ama uygulanmamış
- **Benchmark veri minimal:** Test sadece sentetik ortogonal vektör

### 2.3 Sidebar Mevcut Yapı

Dosya: `portal/components/layout/Sidebar.tsx` + `BottomNav.tsx` (mobile)

```
- Dashboard
- Project Management        ← şu an ÜSTTE, hep açık
  - Sprints
  - Calendar
  - Reports
  - Files
  - Trash
  - Team
  - Feedback
- Exam Module               ← şu an ALTTA, hep açık
  - Exams
  - Analytics
  - Students
  - Rooms
  - Datasets
  - Cam Overlap
- Monitor
- [Coming Soon]
  - Live Monitoring
  - Devices
- Settings
- Theme Toggle
```

- Custom component, shadcn/ui Tooltip entegrasyonlu
- Collapse/expand whole-sidebar var (localStorage persist)
- **Per-grup collapsible/accordion yok** — yapılacaklar listesindeki ana değişiklik bu
- Role-based filter mevcut (admin/supervisor/assistant)

---

## 3. Yapılacaklar — Detaylı Spec

### A. Sidebar Yeniden Yapılandırma (UI)

**Hedef ağaç:**

```
- Dashboard
- Exam Module               ← ÜSTTE, default AÇIK, collapsible
  - Exams
  - Analytics
  - Students
  - Rooms
  - Datasets
  - Cam Overlap
  - Attendance (YENİ — bkz §3.D)
- Project Management        ← ALTTA, default KAPALI, collapsible
  - Sprints
  - Calendar
  - Reports
  - Files
  - Trash
  - Team
  - Feedback
- Monitor
- [Coming Soon]
  - Live Monitoring
  - Devices
- Settings
- Theme Toggle
```

**Davranış:**
- Her grup başlığı tıklanabilir; chevron icon yönü açık/kapalı'yı gösterir
- "Project Management" default `collapsed: true`; kullanıcı açarsa localStorage'da kullanıcı tercihini sakla (`sidebar.pm.open = true`)
- "Exam Module" default `collapsed: false`
- Reduce motion uyumlu animasyon (Tailwind `transition-all duration-200`)
- Mobile (`BottomNav`) etkilenmez — orada zaten flat tab var

**Touched files:**
- `portal/components/layout/Sidebar.tsx` — grup ordering swap + accordion state
- Yeni utility (opsiyonel): `portal/lib/sidebar-prefs.ts` — localStorage helper
- `portal/components/layout/AppShell.tsx` (varsa) — değişiklik gerekmeyebilir

**Kabul kriterleri:**
- [ ] Exam Module Project Management'ın üstünde
- [ ] Project Management default kapalı, açılıp localStorage'a yazılıyor
- [ ] Exam Module default açık
- [ ] Klavye erişimi: Tab + Enter ile grup toggle
- [ ] Aria attrs: `aria-expanded`, `aria-controls`

---

### B. Evidence Recording Sağlamlaştırma

**B1. Storage ↔ DB atomicity**

`ai-service/src/persistence/incident_writer.py:69-93` refactor:

1. **Upload-first, sonra DB insert** — sıralama doğru ama hata yolu eksik:
   - Storage upload başarısız → incident'i **drop et**, retry queue'ya at, `evidence_path=None` ile DB'ye yazma
   - DB insert başarısız → upload edilmiş JPEG'i **rollback** (storage delete) veya `pending_cleanup` tablosuna kaydet
2. Alternatif (önerilen): **Outbox pattern**
   - Local SQLite/Postgres `incident_outbox` tablosu: pending incidents
   - Background worker outbox'tan okur → atomic transaction içinde storage + DB yazar
   - Crash recovery built-in

**B2. Queue overflow politikası**

`_INCIDENT_QUEUE_MAXSIZE=100` çok düşük olabilir. Burst sırasında veri kaybı kabul edilemez:
- Max size 1000'e çıkar VEYA
- Overflow durumunda disk-backed fallback (Redis veya local file queue)
- Metric ekle: `incident_queue_dropped_total` Prometheus counter

**B3. Multi-evidence UI**

`IncidentCard.tsx:34-68` — `evidence_paths` array'in tümünü göster:
- Birden fazla varsa thumbnail strip
- Tıklayınca tam ekran modal + sonraki/önceki

**B4. Audit log**

Yeni tablo `incident_views`:
```sql
CREATE TABLE incident_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id),
  viewer_id UUID REFERENCES auth.users(id),
  viewed_at TIMESTAMPTZ DEFAULT now(),
  evidence_path TEXT  -- hangi snapshot açıldı
);
```
- RLS: kullanıcı sadece kendi view'larını okur; admin tümünü
- API: signed URL fetch öncesi insert

**B5. Orphan cleanup cron**

`ai-service/scripts/cleanup_orphan_evidence.py`:
- Storage'daki tüm path'leri listele
- `incidents.evidence_paths` ile karşılaştır
- 24 saatten eski orphan'ları sil (24h grace period yeni incident'lerin DB write race'i için)
- ECS scheduled task günde 1 kez

**Kabul kriterleri:**
- [ ] Storage fail → DB row yazılmıyor (test: storage'ı down-mock et)
- [ ] DB fail → Storage'daki dosya temizleniyor
- [ ] Queue overflow → drop yerine disk fallback
- [ ] `IncidentCard` tüm evidence'ları gösteriyor
- [ ] `incident_views` audit kaydı var
- [ ] Orphan cleanup cron staging'de doğrulandı

---

### C. Live Monitoring Dataset Pipeline Eksiklikleri (önceki analizden)

**Kritiklik sırasına göre, ayrı ticket'lar halinde:**

| # | İş | Tahmini Efor | Sprint Bağı |
|---|---|---|---|
| C1 | **Drift detector** — weekly batch precision/recall, alert | 20h | 13-18 |
| C2 | **Dataset quality observability** — `validate_dataset.py` pipeline'a otomatik bağla, `dataset_quality_reports` tablosu | 16h | 14-18 |
| C3 | **Class alias config doldur** (`config.yaml`) — "wireless earphone"→"earbuds" vb. | 2h | 14-15 |
| C4 | **Model train + register endpoint** — `POST /api/ai/train/{dataset_id}` + `ai_models` register | 40h | 15-18 |
| C5 | **Pose scoring üretim kuralları** — body_lean kalibrasyon buffer, gaze cross-check, multi-student sync | 24h | 17 |
| C6 | **Multi-camera fusion endpoint** — consensus logic + `incidents.fusion_*` migration | 20h | 18 |
| C7 | **face_covering iç-veri retraining** — CC-BY-NC riskini kapat | 16h | 18 |
| C8 | **Admin /admin/datasets derinleşt.** — quality, version, deploy log | 12h | 14+ |
| C9 | **CD/CD blue-green** — `MODEL_PATH` SSM, canary | 16h | 18+ |
| C10 | **KVKK audit & retention** — anonimizasyon log, raw frame retention cron | 8h | 19+ |

**Detaylar için:** Önceki analiz raporu ([bu dokümanın §5'inde](#5-detayl%C4%B1-dataset-bo%C5%9Fluklar%C4%B1-referans)).

---

### D. Pre-Exam Attendance (Yoklama) Ekranı — YENİ

**Amaç:** Sınav başlamadan önce her öğrencinin kameraya bakıp kayıtlı yüzüyle eşleştirildiği bir kontrol akışı. Şu an face match sadece runtime'da; bu ekran proctor'a "kim hazır, kim eksik, kim doğrulanamadı" net görünürlüğü sağlar.

**Konum:**
- URL: `/exams/[id]/attendance`
- Sidebar: Exam Module altında "Attendance" linki (sadece sınav rolüne erişimi olanlar)
- Sınav başlamadan önce proctor manuel açar; "Start Exam" butonu attendance ≥ N% olmadan disabled

**UI Akışı:**

```
┌─ Sınav: Final - CMPE-491 (06.06.2026 10:00) ─────────────┐
│                                                            │
│  Yoklama Durumu: 18/24 doğrulandı  [ ▓▓▓▓▓▓▓░░ ]          │
│                                                            │
│  ┌──────────────┬──────────────┬──────────────┐           │
│  │ ✓ Ali Yılmaz │ ✓ Ayşe K.    │ ⏳ Burak D.   │          │
│  │  sim: 0.91   │  sim: 0.87   │  bekliyor    │           │
│  ├──────────────┼──────────────┼──────────────┤           │
│  │ ✗ Cem Ö.     │ ⚠ Deniz A.   │ ✓ Elif M.    │          │
│  │  no match    │  sim: 0.62   │  sim: 0.83   │          │
│  │  [ Retry ]   │  [ Manual ✓] │              │          │
│  └──────────────┴──────────────┴──────────────┘           │
│                                                            │
│  [ Refresh ]  [ Start Exam (disabled: 6 missing) ]        │
└────────────────────────────────────────────────────────────┘
```

**Statüler:**
- `pending` — öğrenci henüz kameraya bakmadı
- `verified` — face match similarity ≥ 0.75 (runtime threshold'undan biraz daha sıkı)
- `low_confidence` — 0.65–0.75 arası; manuel onay gerekir
- `failed` — 0.65 altı 3 deneme; manuel onay veya proctor not'u

**Veri akışı:**

1. Öğrenci kendi cihazından (veya sınav salon kamerasından) `/exams/[id]/attendance/check-in` proxy sayfasına gider
2. Camera permission alındıktan sonra 5 frame burst capture
3. AI service `/embed` ile her frame'in embedding'i alınır, en yüksek confidence olan kullanılır
4. `match_face_embedding` RPC ile pgvector search
5. Sonuç `attendance_records` tablosuna yazılır

**Yeni tablo: `attendance_records`**

```sql
CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES exams(id),
  student_id UUID NOT NULL REFERENCES students(id),
  status TEXT NOT NULL CHECK (status IN ('pending','verified','low_confidence','failed','manual_override')),
  similarity FLOAT,
  attempts INT DEFAULT 0,
  first_check_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  manual_override_by UUID REFERENCES auth.users(id),
  manual_override_reason TEXT,
  evidence_path TEXT,  -- check-in snapshot, KVKK retention 90gün
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (exam_id, student_id)
);

-- RLS: öğrenci kendi kaydını okur; proctor sınavının tümünü okur+yazar; admin her şey
```

**Yeni route'lar:**
- `POST /api/exams/[id]/attendance/check-in` — öğrenci tarafı, frame upload + match
- `POST /api/exams/[id]/attendance/[recordId]/override` — proctor manual approval
- `GET /api/exams/[id]/attendance` — proctor list
- Sayfa: `portal/app/(protected)/exams/[id]/attendance/page.tsx`
- Sayfa: `portal/app/(public)/exams/[id]/check-in/page.tsx` (öğrenci self-service)

**Liveness korumalı versiyon (faz 2):**
- Şu an için sadece face match — yeterli (proctor'un gözü var)
- Sprint 19+ için: MediaPipe blink detection + head turn challenge ("sağa bak", "sola bak")
- Anti-spoofing PRD'si ayrı yazılacak

**Kabul kriterleri:**
- [ ] Proctor `/exams/[id]/attendance` sayfasından öğrenci listesini + status'leri görüyor
- [ ] Öğrenci `/exams/[id]/check-in`'den self-service yoklama yapabiliyor
- [ ] Match similarity ≥ 0.75 → otomatik verified
- [ ] 0.65–0.75 → low_confidence, proctor manuel onaylar
- [ ] 3 başarısız deneme → failed, proctor manuel override'la geçirebilir
- [ ] "Start Exam" butonu attendance < 100% olduğunda warning ile (block etmez ama uyarır)
- [ ] `attendance_records` tablosu CSV export desteği var (post-exam report için)
- [ ] Evidence snapshot 90 gün sonra otomatik silinir (KVKK)

---

## 4. Sıra & Bağımlılıklar

```
┌─ 0. Branch sync (develop → main, ayrı oturum) ─┐
│                                                 │
└─→ 1. Sidebar reorder + collapsible (A)         │ ← UI-only, hızlı kazanım
    └─→ 2. Attendance screen (D)                  │ ← Sidebar linkini eklemeden önce A bitsin
        │
        ├─→ 3. Evidence atomicity fix (B1, B2)    │ ← Production reliability, attendance'tan bağımsız
        │
        └─→ 4. Dataset pipeline iyileştirmeleri (C) ← Uzun vadeli, paralelde gidebilir
            C3 → C1 → C2 → C4 → C5 → C6 → C7 → C8 → C9 → C10
```

**Paralelizasyon notu:**
- A (sidebar) ve B (evidence atomicity) bağımsız, paralel gidebilir
- D (attendance) sidebar bittikten sonra link bağlanır, ama backend route'ları sidebar'dan bağımsız
- C dizisi kendi içinde sıralı; C1–C3 hızlı kazanım, gerisi sprint planına göre

---

## 5. Detaylı Dataset Boşlukları (Referans)

Önceki analiz turundan, kritiklik sırasında özet (tam metin geçmiş analiz raporunda):

| Eksik | Kritiklik | Kaynak |
|---|---|---|
| Drift detection yok | KRİTİK | PRD-017 §13.2 yazılı, kod yok |
| Dataset quality observability | KRİTİK | `validate_dataset.py` pipeline'a bağlı değil |
| Class alias config boş | DÜŞÜK ama hızlı | `yolo_detector.py:54` |
| Özel YOLO modeli register edilmedi | YÜKSEK | Hâlâ `yolov8n.pt` stock + YOLO-World |
| Sprint 17 pose kuralları | YÜKSEK | pose extract OK, kural eksik |
| Sprint 18 multi-cam fusion | YÜKSEK | per-camera izole, consensus yok |
| face_covering CC-BY-NC riski | ORTA | İç-veri retraining yapılmadı |
| Model CD/CD blue-green | ORTA | `MODEL_PATH` static ENV |
| Admin /admin/datasets sığ | ORTA | 25 satır, quality panel yok |
| KVKK audit & retention | DÜŞÜK | anonimizasyon scripti var, audit yok |

---

## 6. Açık Sorular (implementasyon öncesi netleşmeli)

1. **Attendance threshold:** 0.75 verified, 0.65 low_confidence — bu eşikler runtime threshold (0.65) ile uyumlu mu, yoksa daha sıkı mı olmalı? Karar verilecek.
2. **Attendance self-service vs proctor-driven:** Öğrenci kendi cihazından mı (BYOD risk) yoksa sınav salon kamerası mı? PRD-013'te kararlaştırılmalı.
3. **Evidence retention:** Şu an `incident-evidence` bucket için retention politikası net değil. KVKK 90 gün mü, 1 yıl mı? Hukuk ile teyit.
4. **Outbox pattern vs synchronous transaction:** §B1'de iki seçenek; performans/karmaşıklık trade-off'u tartışılmalı.
5. **Sidebar localStorage key:** Mevcut sidebar collapse zaten localStorage kullanıyor; yeni accordion state'leri için ayrı key mi (`sidebar.groups.pm.open`) yoksa tek nested object mi?

---

## 7. Implementasyon Notu

**Bu doküman SADECE plandır.** Hiçbir kod değişikliği yapılmadı. Implementasyon:

1. Önce `develop` → `main` sync (ayrı oturum, ayrı taahhüt)
2. Production deploy doğrulandıktan sonra
3. Bu dokümandaki §3 başlıklarından §4 sırasına göre, her biri ayrı PR olarak

Her PR için:
- İlgili PRD güncellemesi (PRD-000 master matrix dahil)
- Local migration dosyası (DB değişikliği varsa) — CLAUDE.md kuralı
- Staging'de manuel test + screenshot
- Acceptance criteria checklist (yukarıda § A–D)

---

**EOF**
