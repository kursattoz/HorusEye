---
title: "HorusEye Dataset Geliştirme Planı v2.1 (Final)"
subtitle: "Sınav Gözetleme AI — Sprint 11/12 Sonrası Nihai Yol Haritası"
author: "HorusEye Team"
date: "2026-05-13"
lang: tr
---

<div class="page-break"></div>

# Yönetici Özeti

HorusEye, **çoklu kamera tabanlı bir sınav gözetleme AI sistemidir**. Mayıs
2026 itibarıyla **Sprint 11 ve Sprint 12 production'a alınmakta** —
behavior pattern detection (BL-228), risk tile (BL-230), evidence ZIP
export + SHA-256 manifest (BL-242), PDF e-posta raporları (BL-240),
audit-trail testleri (BL-245) canlıya çıktı.

Buna rağmen iki **kritik açık** var:

1. **Reliability:** Kamera pair WebSocket'i mobile cihazlarda ~10 frame
   sonra koparıyor. AWS temiz; sorun YOLO lazy-load + receive loop'ta
   sessiz exception + frontend backpressure eksiği. Bu giderilmeden hiçbir
   dataset gerçek sınıfta toplanamaz.
2. **Data:** Sistem yalnızca **3 pre-trained model** ile çalışıyor (COCO
   YOLOv8n stock, MediaPipe Face Mesh, InsightFace Buffalo_L). Mevcut
   `config.yaml` `keyboard`/`laptop`'u `paper_detected` olarak
   haritalıyor; bu mantıksız. Asıl kopya kanalları (kopya kağıdı, akıllı
   saat, kablosuz kulaklık, vücut pozisyonu) hiç tespit edilmiyor.

Bu plan iki açığı tek bir yol haritasında birleştirir:

**6 yeni sprint önerilir (Sprint 13–18, ~470 saat toplam):**

| Sprint | Tema | Çıktı |
|---|---|---|
| **13** | **Live Pipeline Reliability** | **Camera pair drop kök nedenleri P0 düzeltmeleri** |
| 14 | Dataset Pipeline Foundation | İmport/convert/validate/merge gerçekten çalışır + Phase uyumu |
| 15 | Phone & Earbuds & Smartwatch | YOLOv8n custom v1.0 deploy edilir |
| 16 | Kopya Kağıdı & Kalemlik & Hesap Mak. | YOLOv8n v2.0; kontrollü veri toplama |
| 17 | Pose & Davranış & Gaze Refinement | MediaPipe Pose; body-lean, gaze_at_lap, sync_behavior |
| 18 | Multi-Camera Fusion + Face Covering | Cross-cam Re-ID + `face_covering` + LiveMonitor grid |

**Hızlı kazanç önerisi — ilk gün (~9 saat toplam):**

<div class="tier1">

- **BL-13-01 + 13-02 (7h):** YOLO eager init + publish loop safe except →
  mobile drop pattern'i derhal durur
- **BL-14-08 (2h):** `config.yaml`'dan keyboard/laptop sınıflarını **kaldır**;
  sistem sınavda görünmeyecek nesneleri taramayı bırakır → FP düşer, CPU
  kazanır

Bu 9 saatlik müdahale **diğer sprint işlerini bekletmeden** paralel
yapılabilir; mevcut production gürültüsünü anında düşürür.

</div>

**Hedef metrikler (Sprint 18 sonu):**

- Mobile camera pair drop oranı **< %0.5 / saat** (mevcut: ~%80 / 30 sn)
- Phone precision ≥ %90 (mevcut: ~%75)
- Earbuds precision ≥ %75 (mevcut: yok)
- Smart watch precision ≥ %75 (mevcut: yok)
- Paper notes precision ≥ %75 kontrollü, ≥ %65 canlı (mevcut: yok)
- `gaze_at_lap` precision ≥ %75 (gizli telefon erken yakalama)
- `face_covering` precision ≥ %80 (kimlik gizleme)
- Multi-cam onaylı incident precision ≥ %92 (mevcut: tek kamera)

**Versiyon değişiklik geçmişi:**

- **v1.0:** İlk plan — 5 sprint (Sprint 13-17), dataset kataloğu
- **v2.0:** Sprint 13 olarak Live Pipeline Reliability eklendi (eski
  sprintler 14-18'e kaydı); Faz 0-1/2/4 uyum bölümü ve 6 Tasarım Kararı;
  Sprint 14'e 5 alignment BL
- **v2.1 (final):** Coverage kapatma — Sprint 17'ye `gaze_at_lap`,
  `gaze_at_neighbor` calibration, `synchronized_behavior`, L2CS-Net
  fallback eklendi; Sprint 18'e `face_covering` (MaskedFace-Net) eklendi;
  Sprint 15'e Objects365+LVIS fallback augmentation; quick win callout'lar
  Sprint 13/14'e prominentlendi; `water_bottle_with_label` catalog'dan
  çıkarıldı (niş, planı sadeleştirdi)

<div class="page-break"></div>

# Mevcut Durum Analizi

Bu bölüm **gerçek kod üzerinde** doğrulanmıştır. PRD'lerdeki plan değil,
bugün çalışan halini yansıtır.

## Sprint 11 & 12 Kapanış Çıktıları (Live)

### Sprint 11 (Profile + Risk Model)

- **Behavior pattern detection** — chronic phone-checker tespiti
  (commit `1b0aa80`, BL-228) — `ai-service/src/scoring/calibration.py`
- **Risk tile** — `/students` ve `/exams/[id]/sessions` listelerinde risk
  badge (BL-230) — `portal/components/students/`
- **Incident frequency + by-type charts** — recharts AreaChart pattern
  (BL-231)
- **Chronological incidents timeline** UI (BL-227)
- **/students/[id] profile** sayfa + risk card (BL-224)
- **Per-student calibration** — incident threshold per öğrenci
  (`portal/app/api/students/[id]/calibration/` — pending merge)

### Sprint 12 (Review Workflow + Auto-Reports)

- **Evidence ZIP export + SHA-256 manifest** (BL-242) —
  `portal/app/api/exams/[id]/evidence-export/route.ts:1-157`. Her
  dosya için SHA-256, byte count, storage path, proctor decision
  manifest'te
- **PDF e-posta raporları** (BL-240) —
  `portal/app/api/exams/[id]/reports/email/route.ts:1-166`. Tool:
  `@react-pdf/renderer` (puppeteer DEĞİL)
- **Cross-exam analytics dashboard** —
  `portal/app/(protected)/exams/analytics/page.tsx`
- **Audit-trail testleri** (BL-245) —
  `portal/tests/unit/lib/incident-decision-audit.test.ts`,
  `incident-report-pdf.test.ts`

**Plana etkisi:** Bu altyapı **dataset pipeline tarafından korunmalıdır.**
Özellikle SHA-256 manifest'i kırmamak için anonimize training kopyaları
**ayrı bucket/tabloda** yaşar (bkz. Tasarım Kararları §4).

## Bilinen Problem — Camera Pair Drop (P0)

Mobile cihazlarda kamera pair WebSocket'i **~10 frame sonra koparıyor**.
Production'da reproduksible. AWS infra temiz (ECS RUNNING 7+ gün, ALB
healthy, CPU < %50, memory %19, idle_timeout 900s, hiç 5xx yok).

**Kök nedenler (4 katman, sıralı):**

<div class="accent-box"><strong>Layer 2 — AI Service <code>publish_handler.py:342-496</code></strong></div>

- Detection işi ana receive loop'unda **sync** çalışıyor; `_detect_track_score_sync`,
  `write_incident`, `broadcaster.broadcast` herhangi biri Exception
  atarsa **sadece `WebSocketDisconnect` yakalanıyor** → loop dışına
  propagate → uvicorn WS'i sessizce kapatıyor. CloudWatch'ta stack trace
  görünmüyor (FastAPI WS default INFO log seviyesinde)
- **YOLO lazy-load** (`publish_handler.py:149-176`): ilk frame inference'ı
  5–15 sn loop'u bloke ediyor. Bu süre boyunca mobile WS TCP buffer'ı
  şişiyor; 10 frame × ~80KB JPEG ≈ 800 KB → telefon WS send quota'sı
  dolunca **1006 ile koparıyor**

<div class="accent-box"><strong>Layer 3 — Frontend <code>CamPairCapture.tsx</code></strong></div>

- **`ws.bufferedAmount` kontrolü yok** (satır 235-254): backpressure
  algılamıyor, `ws.send(buf)` durdurulmuyor → buffer şişiyor → 1006
- **Visibility-pause yok** (satır 97-106): telefon ekranı sönünce
  `MediaStream` freeze, `setInterval` browser tarafından 1 sn'ye
  throttle'lanıyor → frame yok → server 15 sn idle timeout
- **Otomatik reconnect yok**: `ws.onclose` sadece state set ediyor,
  kullanıcının manuel buton basması gerek
- `setInterval(tick, 200ms)` async tick — tick > 200ms sürerse
  paralel tick'ler başlıyor

**Plana etkisi:** Bu sorunlar **dataset toplamadan önce** çözülmelidir.
Aksi takdirde:

- Kontrollü senaryo çekimleri yarıda kopar → veri kaybı
- Canlı sınavdan anonimize frame çıkarma pipeline'ı çalışmaz
- Multi-camera fusion (Sprint 18) zaten kararsız tek-cam üzerinde
  inşa edilemez

**Çözüm:** Yeni Sprint 13 (Live Pipeline Reliability) tüm P0/P1
maddeleri kapsar. Detay §6.1.

## Aktif Modeller

### COCO 2017 — YOLOv8n (Stock)

- **Dosya:** `ai-service/src/detection/yolo_detector.py:56`
- **Model path:** `models/yolov8n.pt` (config.yaml:14)
- **Indirme:** Ultralytics tarafından ilk çağrıda otomatik (~6 MB)
- **Dockerfile pre-bake:** `Dockerfile:26`
- **Durum:** Stock; **fine-tune YOK**
- **Filtrelenen sınıflar:** `0 person`, `63 laptop`, `67 cell phone`,
  `73 book`, `76 keyboard` (config.yaml:20)

### MediaPipe Face Mesh — Google Pre-trained

- **Paket:** `mediapipe>=0.10.14` (requirements.txt:24)
- **Kullanım:** `src/scoring/rules/gaze_diversion.py`, head turn
- **Çıktı:** 478 noktalı 3D yüz landmark'ı + yaw/pitch/roll açıları
- **FPS:** 5 (sampling)

### InsightFace Buffalo_L — pre-trained ONNX paketi

- **Paket:** `insightface>=0.7.3` (requirements.txt:31)
- **İçerik:** RetinaFace (detector) + ArcFace ResNet50 (embedder, 512-dim)
- **Dockerfile pre-bake:** `Dockerfile:34–38` (~280 MB)
- **Durum:** Sprint 10 ile pgvector enrollment hazır; canlı match henüz
  geniş kullanımda değil

## Eksik / Yanlış Konfigürasyon

### config.yaml class mapping bozuk

`ai-service/config.yaml:22-26` şu an:

```yaml
incident_class_map:
  'cell phone': phone_detected   # OK
  'laptop':     paper_detected   # YANLIS — laptop kağıt değil
  'book':       paper_detected   # YANLIS — kitap ile kopya kağıdı farklı
  'keyboard':   paper_detected   # YANLIS — sınıfta klavye yok
```

**Etkisi:** Test sırasında biri klavye getirirse `paper_detected` HIGH
incident üretir. Production'a girince `book` doğal masa eşyası `paper`
sayılır → false positive sağanak.

### Boş Klasörler

| Klasör | İçindekiler | Olması Gereken |
|---|---|---|
| `ai-service/models/` | — boş — | Fine-tuned weights |
| `ai-service/test-data/earbuds/` | sadece README + data.yaml | ~150 etiketli görsel |
| `ai-service/test-data/phone_benchmark/` | sadece README + örnek JSON | 150 etiketli benchmark frame |
| `ai-service/data/` | klasör yok | Tüm dataset pipeline'ının kalbi |

### Eksik Tespit Sınıfları

PRD-013 §7.2 "Phase B'de açılacak" diye geçen ama henüz veri yok:

- `earbuds_detected` (custom dataset gerekir)
- `paper_notes` / kopya kağıdı (custom annotation gerekir)
- `unauthorized_material` (kitap, ek kağıt)
- `body_lean_neighbor` (MediaPipe Pose gerekir — Pose henüz entegre değil)
- `hand_in_lap_extended` (MediaPipe Pose + gaze down)
- `object_passing` (multi-track el yakınlaşması)
- `synchronized_behavior` (çoklu öğrenci korelasyonu)

<div class="page-break"></div>

# Faz Uyum & Tasarım Kararları

Bu plan; Faz 0-1 (Foundation), Faz 2 (AI Pipeline, Sprint 12 ile live), Faz
4 (Camera AI, PRD-013/019/020 ile aktif) altyapılarına **eklemler yapar,
yeniden inşa etmez**. Aşağıdaki uyum kararları planın her sprint'inde
geçerlidir.

## Faz 0-1 Uyumu (Foundation)

| Konu | Mevcut | Plan Davranışı |
|---|---|---|
| RBAC | `admin / supervisor / assistant` rolleri, `is_admin()` SQL fn, middleware pattern | Tüm `/api/ai/datasets/*` admin-only; `is_admin()` re-use |
| File storage | `incident-evidence`, `ai-model-weights` bucket'ları + `getPublicUrl`/`createSignedUrl` | Yeni bucket `anonymized-training-frames` aynı pattern |
| Audit logging | `audit_logs` tablosu, event_type taxonomy (`auth.login`, `incident_decision`, `evidence_export`...) | Yeni event_type'lar: `dataset.import / merge / validate / deploy` |
| Dashboard charts | recharts AreaChart pattern (`SuspicionAreaChart.tsx`) | `/admin/datasets` training metric chart'ı **aynı** pattern |
| Routes | `portal/constants/routes.ts:51-56` `ADMIN_ONLY_ROUTES` listesi | `routes.datasets: '/datasets'` eklenir ve listeye girer |
| Sidebar | `portal/components/layout/Sidebar.tsx:53-84` role filter | "Exam Module" group altına Datasets entry |

## Faz 2 Uyumu (Sprint 12 live)

| Konu | Mevcut | Plan Davranışı |
|---|---|---|
| Evidence ZIP + SHA-256 manifest | `portal/app/api/exams/[id]/evidence-export/route.ts:98-108` | Plan bu manifest'e **dokunmaz**; orijinal evidence frame'leri olduğu yerde kalır |
| Anonimize eğitim kopyaları | Yok | **Ayrı bucket + tablo** — manifest integrity korunur |
| PDF üretimi | `@react-pdf/renderer` (`portal/lib/reports/incident-report-pdf.tsx`) | Dataset training raporu da **aynı tool**'la; puppeteer eklenmez |
| Audit-trail testleri | `portal/tests/unit/lib/incident-decision-audit.test.ts` | Yeni dataset event_type'ları **aynı test pattern** ile kapsanır |
| Analytics dashboard | `/exams/analytics` page | `/admin/datasets` ondan ayrı; dataset metrik trendleri orada |

## Faz 4 Uyumu (PRD-013 / 019 / 020)

| Konu | Mevcut | Plan Davranışı |
|---|---|---|
| `ai_models` tablosu | `portal/supabase/migrations/20260505120341_create_ai_models.sql` | `datasets` tablosu FK: `datasets.ai_model_id → ai_models.id` |
| `ai-model-weights` bucket | `20260505121046_create_ai_model_weights_bucket.sql` | Re-use; `finetune_yolo.py` zaten kullanıyor |
| Multi-cam DB | `cameras`, `session_cameras`, `camera_health_events` tabloları (PRD-019) | Sprint 18 bunları kullanır; yeni multi-cam tablosu **eklenmez** |
| LiveMonitor | `portal/components/exams/LiveMonitor.tsx:42` `framesByCamera: Map` var, **"single-session demo"** modunda | Sprint 18 sıfırdan **inşa etmez** — demo flag kaldırma + grid layout |
| Camera pairing | `cam-pair/page.tsx` + token redeem flow canlı | Sprint 17 multi-cam capture için ekibin telefonları **re-use** edilir |
| Fargate config | `infra/bin/infra.ts:60-73` — 2048 CPU / 6144 MB (ArcFace için) | Sprint 17'de 7168 MB (Pose ek yükü); pattern aynı |

<div class="page-break"></div>

## Tasarım Kararları (v2.0 — sabit)

Aşağıdaki kararlar plan boyunca **değişmez**. Her biri gerekçesiyle.

### Karar 1 — Anonimize Frame Storage: Tablo + Bucket

**Karar:** Anonimize eğitim frame'leri için (a) yeni private bucket
`anonymized-training-frames` ve (b) `internal_training_samples` tablosu
oluşturulur.

**Tablo şeması:**

```sql
CREATE TABLE public.internal_training_samples (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_incident_id UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
  anonymized_path      TEXT NOT NULL,    -- "anonymized/{session}/{frame}.jpg"
  sha256               TEXT NOT NULL,    -- bu kopyanın hash'i
  class_id             INTEGER,          -- annotated sınıf (NULL = unlabeled)
  bbox_yolo            FLOAT[4],         -- [xc, yc, w, h] normalized (NULL = unlabeled)
  dataset_id           UUID REFERENCES public.datasets(id),  -- üye olduğu dataset
  annotation_status    TEXT DEFAULT 'pending'
                       CHECK (annotation_status IN ('pending','annotated','skipped','disputed')),
  proctor_decision     TEXT,             -- snapshot: 'clean'|'violation'|'suspicious'
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_its_dataset    ON public.internal_training_samples (dataset_id);
CREATE INDEX idx_its_status     ON public.internal_training_samples (annotation_status);
CREATE INDEX idx_its_class      ON public.internal_training_samples (class_id);
```

**Neden tablo + bucket (path konvansiyonu değil)?**

- "Hangi frame hangi dataset versiyonuna girdi?" sorgusu O(1) olur
- Annotation pipeline (Sprint 16'da paper_notes ~600 frame) status takibi
  için tablo zorunlu
- Sprint 12 evidence manifest'in SHA-256'sından **ayrı bir hash** — manifest
  integrity bozulmaz; KVKK silme talebi geldiğinde
  `original_incident_id` üzerinden cascade silme yapılabilir

### Karar 2 — Bucket Konfigürasyonu

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anonymized-training-frames',
  'anonymized-training-frames',
  false,                          -- private
  52428800,                       -- 50 MB
  ARRAY['image/jpeg','image/png','image/webp']
);

-- RLS: yalnızca service-role ve admin
CREATE POLICY "admin read training frames"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'anonymized-training-frames' AND is_admin());
CREATE POLICY "admin write training frames"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'anonymized-training-frames' AND is_admin());
```

### Karar 3 — Audit Event Type Genişleme

Mevcut `audit_logs.event_type` taksonomisine eklenecek değerler:

| event_type | Tetikleyici | Metadata örneği |
|---|---|---|
| `dataset.import` | Harici/iç-kaynak dataset import edildi | `{source, count, license}` |
| `dataset.merge` | İki+ dataset birleştirildi → yeni versiyon | `{parent_ids, target_id, classes}` |
| `dataset.validate` | Kalite raporu üretildi | `{dataset_id, passed, issues}` |
| `dataset.deploy` | ai_models row aktive edildi | `{model_id, dataset_id, benchmark}` |
| `dataset.annotation_complete` | Bir frame annotate edildi | `{sample_id, class_id, annotator}` |

`portal/lib/audit/dataset.ts` modülü `portal/lib/audit/incident-decision.ts`
pattern'ini birebir takip eder.

### Karar 4 — Tarihler Relative

PRD-020 takvimi (2026-08-17 Sprint 12 sonu) gerçek hıza göre kaymış —
Sprint 11+12 Mayıs'ta kapandı. Plan **mutlak tarih kullanmaz**:

- "Sprint 13 başlangıcı: 2026-08-18" → **silindi**
- Her sprint için sadece **sıra ve tema** verilir
- Gerçek tarihler PRD-018 sprint board UI'sından set edilir (admin
  /sprints sayfası)

### Karar 5 — Detection Worker Pool (P2) Sprint 13'te Stretch

Camera pair drop kök neden listesinde "P2 — Mimari: detection pipeline
ayrı worker'a taşı" maddesi var. Plan kararı: Sprint 13'te **stretch BL**
olarak yer alır (BL-13-10). P0/P1 düzeltmeleri zamanında biterse alınır,
yoksa Sprint 18'e (Multi-cam) eklenir — Cross-cam fusion zaten ayrı
worker queue ister.

### Karar 6 — BL Numaralandırma

PRD-020 konvansiyonu: `{sprint}-{idx}`. Plan'daki tüm BL'ler bu
konvansiyona uyar: Sprint 13 → `13-01..13-12`, Sprint 14 → `14-01..14-16`,
vb.

<div class="page-break"></div>

# Genişletilmiş Tespit Hedefleri

Sistem üç kategoride sinyal üretmelidir. Hiçbir kategori tek başına "kopya
çekti" kararı vermez; **şüphe skoru** üretir ve gözetmen onayına gider
(PRD-013 §7.2 tasarım prensibi).

## Kategori A — Nesne Tespiti (YOLO fine-tune)

<div class="tier1"><strong>TIER 1 — Yüksek Güven</strong>
Tek başına alert üretebilir; yanlış pozitif oranı düşük olmalı.
</div>

| Sınıf | Kullanım Senaryosu | Mevcut COCO? |
|---|---|---|
| `phone` | Telefonun masada / elde / kucakta görünmesi | Var (zayıf domain) |
| `earbuds_wireless` | AirPods, Galaxy Buds tarzı kablosuz kulak içi | **Yok** |
| `earbuds_wired` | Kablolu kulaklık (kablo da sinyal) | **Yok** |
| `smart_watch` | Akıllı saat — mesaj/kopya notu görüntüleyebilir | **Yok** |
| `paper_notes` | Avuç içi kopya kağıdı, sleeve'e gizlenmiş not | **Yok** |
| `pencil_case` | Kalemlik (içinde gizli not olabilir) | **Yok** |

<div class="tier2"><strong>TIER 2 — Orta Güven</strong>
Bağlamla birlikte değerlendirilir; başka bir sinyalle birleşince severity
yükselir.
</div>

| Sınıf | Kullanım Senaryosu |
|---|---|
| `calculator` | Programlanabilir hesap makinesi (sınav kuralına bağlı) |
| `book` | Yasak kitap masada (kuralla beraber) |

## Kategori B — Vücut Pozisyonu / Hareket

<div class="accent-box"><strong>Pose Sinyalleri</strong>
MediaPipe Pose (33 keypoint) + zaman serisi analizi.
</div>

| Davranış | Sinyal |
|---|---|
| `body_lean_neighbor` | Torso açısı > 20° komşu koltuk yönüne, sustained 3s |
| `standing_up` | Omuz/kalça y-koord %30+ delta, sustained 2s |
| `hand_under_desk` | El keypoint y > masa segment y, sustained 5s |
| `hand_to_ear_mouth` | El-yüz mesafesi < 50px, sustained 2s |
| `object_passing` | İki track el yakınlaşması, sustained 1–3s |
| `gaze_at_neighbor` | Mevcut head-pose + komşu yön kalibrasyonu |
| `gaze_at_lap` | Pitch açısı aşağı (kucağa) + sustained 5s |

## Kategori C — Kimlik & Yüz

| Davranış | Sinyal |
|---|---|
| `face_covering` | Maske / cap ile yüz örtme — kimlik doğrulanamaz |
| `identity_swap` | Aynı koltukta farklı kişi (face embedding mismatch) |
| `unauthorized_person` | Enrolled olmayan yüz, sustained 30s+ |

<div class="page-break"></div>

# Dataset Kaynak Kataloğu

Bu bölüm her kaynak için **lisansı, içeriği, erişim yöntemini, projedeki
kullanımını** dokümante eder. Tüm linkler tıklanabilirdir.

## Nesne Tespit Datasetleri

### COCO 2017 (Common Objects in Context)

- **Kaynak:** [cocodataset.org](https://cocodataset.org/)
- **İçerik:** 80 sınıf, 330K görsel, 1.5M nesne bbox'u
- **Lisans:** CC-BY 4.0 (görsel) / Creative Commons (annotations)
- **Bizim için yararlı sınıflar:** `person`, `cell phone`, `book`
- **Erişim:** FiftyOne kütüphanesi üzerinden subset
- **Komut:**

```bash
python -c "
import fiftyone.zoo as foz
ds = foz.load_zoo_dataset(
    'coco-2017', split='train',
    label_types=['detections'],
    classes=['cell phone', 'book'],
    max_samples=2000)
"
```

- **Sınırlama:** COCO'daki `cell phone` ofis/sokak ortamından — sınıf
  domain'ine adaptasyon (fine-tune) gerekir

### Open Images V7 (Google)

- **Kaynak:** [storage.googleapis.com/openimages](https://storage.googleapis.com/openimages/web/index.html)
- **İçerik:** 600+ sınıf, ~9M görsel, ~16M bbox
- **Lisans:** Görseller CC-BY 2.0 (Flickr), annotation CC-BY 4.0
- **Bizim için yararlı sınıflar ve mevcut görsel sayıları (yaklaşık):**

| Open Images Sınıfı | Görsel Sayısı | Bizim Hedefimiz |
|---|---|---|
| Mobile phone | ~10000 | `phone` augmentation |
| Headphones | ~5000 | `earbuds_wired` (filtreli) |
| Watch | ~3000 | `smart_watch` (filtreli) |
| Pencil case | ~500 | `pencil_case` |
| Calculator | ~1500 | `calculator` |
| Pen | ~2000 | Yardımcı augmentation |
| Book | ~8000 | `book` |

- **Erişim:** FiftyOne `foz.load_zoo_dataset('open-images-v7', ...)`
- **Önemli:** "Headphones" sınıfı over-ear büyük kulaklığı da içerir —
  bizim hedefimiz in-ear; **manuel filtreleme zorunlu**

### Roboflow Universe

- **Kaynak:** [universe.roboflow.com](https://universe.roboflow.com/)
- **İçerik:** Topluluk tarafından paylaşılan binlerce dataset; kalite
  değişken
- **Lisans:** Her dataset'in kendi lisansı — CC-BY-4.0 veya daha açık
  filtrele
- **Önerilen arama terimleri:**

| Arama | Beklenen | Hedef Sınıfımız |
|---|---|---|
| `"earbuds detection"` | 5–15 dataset, 500–5000 görsel | `earbuds_wireless` |
| `"airpods detection"` | 3–10 dataset | `earbuds_wireless` |
| `"smartwatch detection"` | 2–5 dataset | `smart_watch` |
| `"phone detection classroom"` | 1–3 dataset (varsa altın) | `phone` domain |
| `"cheat sheet detection"` | nadir | `paper_notes` (varsa) |
| `"exam cheating detection"` | 3–8 dataset | mixed |

- **Erişim:** Web UI export (YOLOv8 format) veya CLI:

```bash
pip install roboflow
roboflow download --workspace WORKSPACE --project PROJECT \
    --version VERSION --format yolov8
```

- **Kalite filtre kriterleri (PRD-017 §4.2):**
  - Health Check ≥ %70
  - Toplam görsel ≥ 500
  - Lisans CC-BY veya daha açık
  - Class başına minimum 200 görsel

### Objects365 V2

- **Kaynak:** [objects365.org](https://www.objects365.org/)
- **İçerik:** 365 sınıf, 600K+ görsel, 10M+ bbox
- **Lisans:** CC-BY 4.0
- **Kullanım:** Daha çeşitli arka plan; augmentation kaynağı olarak
  COCO'yu tamamlar

### LVIS v1 (Large Vocabulary Instance Segmentation)

- **Kaynak:** [lvisdataset.org](https://www.lvisdataset.org/)
- **İçerik:** COCO görselleri + 1200 long-tail sınıf
- **Lisans:** CC-BY 4.0
- **Yararlı sınıflar:** `earbuds`, `eraser`, `pen`, `pencil`, `wristwatch`
- **Sınırlama:** Long-tail — bazı sınıflarda 50'den az örnek

## Pose / Action Recognition Datasetleri

### COCO Keypoints

- **Kaynak:** [cocodataset.org](https://cocodataset.org/) (annotations alt seti)
- **İçerik:** 17 vücut keypoint'i, 200K kişi
- **Kullanım:** MediaPipe Pose zaten dahili modele sahip; gerekirse
  YOLOv8-pose fine-tune için referans

### AVA Actions v2.2 (Atomic Visual Actions)

- **Kaynak:** [research.google.com/ava](https://research.google.com/ava/)
- **İçerik:** 80 atomic action, ~430 film, ~1.6M action label
- **Lisans:** CC-BY 4.0
- **Yararlı sınıflar:** `stand`, `bend/bow`, `hand pass object`, `lift
  person`, `give/serve object`
- **Sınırlama:** Film sahneleri — sınıf ortamına direk uygulanmaz; ön
  eğitim (pretrain) için iyi

### Kinetics-700-2020

- **Kaynak:** [deepmind.com/kinetics](https://www.deepmind.com/open-source/kinetics)
- **İçerik:** 700 sınıf, 650K YouTube klibi, 10s her biri
- **Lisans:** CC-BY 4.0 (annotation), video YouTube ToU
- **Kullanım:** Action classifier (SlowFast, X3D) pretrain için

### NTU RGB+D 120

- **Kaynak:** [rose1.ntu.edu.sg](https://rose1.ntu.edu.sg/dataset/actionRecognition/)
- **İçerik:** 120 sınıf, 114K klip, skeleton + RGB + depth
- **Lisans:** Akademik kullanım (form imzalama)
- **Kullanım:** Skeleton-based action recognition (ST-GCN, MS-G3D)
  — pose-based body_lean/object_pass modeli için doğal taban

### HaGRID (HAnd Gesture Recognition Image Dataset)

- **Kaynak:** [github.com/hukenovs/hagrid](https://github.com/hukenovs/hagrid)
- **İçerik:** 552K görsel, 18 el jesti, 34K kişi
- **Lisans:** CC-BY-SA 4.0
- **Yararlı sınıflar:** `call` (kulağa el), `mute`, `ok`, `stop`
- **Kullanım:** `hand_to_ear_mouth` ve `hand_under_desk` detector
  pretrain

## Gaze Datasetleri

### Gaze360

- **Kaynak:** [gaze360.csail.mit.edu](http://gaze360.csail.mit.edu/)
- **İçerik:** 238 subject, 360° gaze, indoor/outdoor
- **Lisans:** Akademik
- **Kullanım:** Sınıf gibi geniş açılı sahnelerde benchmark

### ETH-XGaze

- **Kaynak:** [ait.ethz.ch/xgaze](https://ait.ethz.ch/projects/2020/ETH-XGaze/)
- **İçerik:** 1.1M görsel, 110 subject, geniş aydınlatma çeşitliliği
- **Lisans:** Akademik (registration)
- **Kullanım:** Aydınlatma varyasyonuna dayanıklı gaze modeli

### MPIIGaze / MPIIFaceGaze

- **Kaynak:** [perceptualui.org](https://www.perceptualui.org/research/datasets/MPIIGaze/)
- **İçerik:** 213K görsel, 15 subject, laptop ön kamerası
- **Lisans:** Araştırma kullanımı
- **Kullanım:** Klasik baseline

### L2CS-Net (Pretrained Model)

- **Kaynak:** [github.com/Ahmednull/L2CS-Net](https://github.com/Ahmednull/L2CS-Net)
- **İçerik:** Gaze360 üzerinde eğitilmiş drop-in inference modeli
- **Lisans:** MIT
- **Kullanım:** MediaPipe Face Mesh yetmezse direkt gaze çıkışı

## Yüz & Maske Datasetleri

### MaskedFace-Net

- **Kaynak:** [github.com/cabani/MaskedFace-Net](https://github.com/cabani/MaskedFace-Net)
- **İçerik:** 137K masked yüz (sentetik), FFHQ tabanlı
- **Lisans:** CC-BY-NC-SA 4.0 (**ticari kullanımda dikkat**)
- **Kullanım:** `face_covering` detector

### WIDER FACE

- **Kaynak:** [shuoyang1213.me/WIDERFACE](http://shuoyang1213.me/WIDERFACE/)
- **İçerik:** 32K görsel, 393K yüz, geniş çeşitlilik
- **Lisans:** Araştırma
- **Kullanım:** InsightFace RetinaFace zaten bu üzerinde eğitilmiş

## Person Re-Identification (Çoklu Kamera)

### Market-1501

- **Kaynak:** [zheng-lab.cecs.anu.edu.au](https://www.kaggle.com/datasets/pengcw1/market-1501)
- **İçerik:** 32K görsel, 1501 kişi, 6 kamera (üniversite ortamı)
- **Lisans:** Akademik
- **Kullanım:** Cross-camera person matching baseline

### MSMT17

- **Kaynak:** [pkuvmc.com](https://www.pkuvmc.com/dataset.html)
- **İçerik:** 126K görsel, 4101 kişi, 15 kamera, 4 zaman dilimi
- **Lisans:** Akademik
- **Kullanım:** Daha modern, geniş kapsamlı Re-ID

### CUHK03

- **Kaynak:** [www.ee.cuhk.edu.hk](http://www.ee.cuhk.edu.hk/~xgwang/CUHK_identification.html)
- **İçerik:** 14K görsel, 1467 kişi, 5 kamera çifti
- **Lisans:** Akademik
- **Kullanım:** Ek pretrain verisi

> **Önemli not:** DukeMTMC-ReID dataset'i 2019'da gizlilik gerekçesiyle
> orijinal yazarları tarafından geri çekildi. Bu plan onu **kullanmaz**.

## Cheating-Specific (Akademik / Topluluk)

Sınava özel kapsamlı bir public dataset **YOKTUR**. Mevcut kaynaklar:

- **Roboflow** topluluğunda "student cheating" / "exam cheating" başlıklı
  ~3–8 dataset; kalite değişken, çoğu 500 görselin altında
- Akademik makaleler ekinde küçük (50–200 görsel) datasetler — referans
  olarak değer; eğitime kafi değil

**Sonuç:** Sınav-spesifik sinyaller (kopya kağıdı, komşu kağıdına bakma,
kalemlik içi gizli not) için **kontrollü iç-veri toplama zorunludur**.

<div class="page-break"></div>

# Veri Toplama Metodolojisi

## Pipeline Genel Akışı

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  HARİCİ      │    │  KONTROLLÜ   │    │  CANLI       │
│  Kaynaklar   │    │  İç-Veri     │    │  Sınav (KVKK)│
│ (COCO, OID,  │    │ (gönüllüler) │    │ (anonimize)  │
│  Roboflow)   │    │              │    │              │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │
       ▼                   ▼                   ▼
   ┌───────────────────────────────────────────────┐
   │       data/raw  (orijinal format)              │
   └─────────────────────┬─────────────────────────┘
                         ▼
   ┌───────────────────────────────────────────────┐
   │       data/converted  (YOLO format)            │
   └─────────────────────┬─────────────────────────┘
                         ▼
   ┌───────────────────────────────────────────────┐
   │       Quality validation (PRD-017 §6)          │
   └─────────────────────┬─────────────────────────┘
                         ▼
   ┌───────────────────────────────────────────────┐
   │       data/merged  (versiyonlu)                │
   └─────────────────────┬─────────────────────────┘
                         ▼
   ┌───────────────────────────────────────────────┐
   │       Train / Val / Test split (0.7/0.2/0.1)   │
   └─────────────────────┬─────────────────────────┘
                         ▼
   ┌───────────────────────────────────────────────┐
   │       YOLOv8 fine-tune (Colab T4)              │
   └─────────────────────┬─────────────────────────┘
                         ▼
   ┌───────────────────────────────────────────────┐
   │       Benchmark + A/B + Deploy                 │
   └────────────────────────────────────────────────┘
```

## Kontrollü Veri Toplama Protokolü

Off-the-shelf dataset olmayan sınıflar (`paper_notes`, `pencil_case` içi,
`body_lean`, `hand_under_desk`) için **kontrollü senaryolar**.

### Genel Kurallar

- **Ortam:** Gerçek sınıf, gerçek kamera setup'ı, gerçek koltuk
  konfigürasyonu
- **Katılımcılar:** Gönüllü ekip üyeleri (yazılı rıza alınmış —
  PRD-017 §18.4)
- **Aydınlatma:** En az 3 koşul (sabah pencere, öğle dengesi, akşam
  floresan)
- **Açı:** En az 2 kamera (önden + yandan üst)
- **Çözünürlük:** 720p minimum, 1080p önerilen
- **Frame rate:** 5 FPS yakalama (ürün ile aynı)

### Senaryo Şablonları

#### S1 — Kopya Kağıdı (paper_notes)

6 alt-senaryo, her biri 3 kişi × 3 aydınlatma = 9 clip × 6 = **54 clip**

| Alt-senaryo | Açıklama | Süre |
|---|---|---|
| S1.1 | Kopya kağıdı avuç içinde | 8s |
| S1.2 | Kalemlik içinde, açıp bakma | 10s |
| S1.3 | Sıranın altında kucakta | 10s |
| S1.4 | Manşet/kol içinde gizli | 8s |
| S1.5 | Su şişesi etiketine yazılı | 12s |
| S1.6 | Sıra altına yapıştırılmış | 10s |

#### S2 — Telefon Kullanımı (phone — domain adaptasyon)

| Alt-senaryo | Açıklama |
|---|---|
| S2.1 | Telefon masa üstünde 5s |
| S2.2 | Kucakta ekrana bakma 10s |
| S2.3 | Sıra altında gizli kullanım 5s |
| S2.4 | Cep'ten hızlıca çıkarıp bakma 3s |

#### S3 — Kulaklık (earbuds)

| Alt-senaryo | Açıklama |
|---|---|
| S3.1 | İki kulakta wireless, otururken |
| S3.2 | Saç ile gizlenmiş tek kulaklık |
| S3.3 | Wired, kablo görünür |
| S3.4 | Masaya bırakılmış kulaklık |

#### S4 — Akıllı Saat (smart_watch)

| Alt-senaryo | Açıklama |
|---|---|
| S4.1 | Saate hızlı bakma |
| S4.2 | Sağ kola gizleme (kola dönüşle) |
| S4.3 | Saati uzun süre kontrol (10s+) |

#### S5 — Vücut Pozisyonu (body_lean / standing / hand-under-desk)

| Alt-senaryo | Açıklama |
|---|---|
| S5.1 | Yan komşuya gövde eğme (5s) |
| S5.2 | Ayağa kalkma + oturma |
| S5.3 | Masa altına el sokma 8s |
| S5.4 | İki öğrenci arası eşya alışverişi (3s) |
| S5.5 | El kulağa götürme (whisper simülasyonu) |

#### S6 — Negatif Örnekler (meşru davranışlar, FP önleme)

Pozitiflerle eşit sayıda yakalanmalı — model "yanlış pozitif" sürmenin
neye benzediğini öğrenmeli.

| Alt-senaryo | Açıklama |
|---|---|
| S6.1 | Normal sınav çözme, baş eğik |
| S6.2 | Düşünme — yukarı bakma, geriye yaslanma |
| S6.3 | Kalem düşürme + eğilme + alma |
| S6.4 | Saat (kol saati) kontrol, normal |
| S6.5 | Gergi — boyun, omuz hareketleri |
| S6.6 | Yanındaki öğrenciye normal yan-bakış (kısa < 1s) |

### Annotation

- **Tool:** [CVAT](https://www.cvat.ai/) (self-hosted, açık kaynak) veya
  [Roboflow Annotate](https://roboflow.com/annotate) (web, ücretsiz 10K
  görsel/ay)
- **Yarı-otomatik:** YOLOv8 stock ile pre-label → annotator düzeltir
  (%70 hız kazancı)
- **Çift-pass kalite kontrol:** Rastgele 50 örnek için 2 ayrı annotator
  → IoU ≥ %95 agreement gerekli

### Privacy / KVKK

- Tüm "internal" frame'ler `anonymize_frame.py` üzerinden geçer
  (Gaussian blur yüz, PRD-017 §18.3)
- Yüz tespitiyle ilgili sınıflar (`face_covering`, `identity`) için
  ayrı rıza protokolü
- Eğitim hedefi bbox-tabanlı ise yüz blur model performansını
  etkilemez (PRD-017 §18.3 notu)

<div class="page-break"></div>

# Sprint 13–18 Detaylı Planlama

Phase B (Sprint 7–12) live. Sonrası **Phase C — Reliability + Data
Excellence** olarak konumlanır. Sprint 13 reliability foundation;
14–18 dataset eksenidir.

## Sprint 13 — Live Pipeline Reliability

**Tema:** Mobile camera pair drop kök nedenleri ortadan kaldırılır;
gözlemlenebilirlik artırılır

Bu sprint dataset toplamadan ÖNCEKİ ön-koşuldur. Mobile WebSocket'in
kararsız olduğu bir sistemde kontrollü senaryo çekimleri yarıda kopar
ve canlı sınavdan anonimize frame çıkarma pipeline'ı çalışmaz.

<div class="tier1"><strong>Hızlı Kazanç — En Önce Yapılacaklar (~7 saat)</strong>

- **BL-13-01 (3h)** + **BL-13-02 (4h)** birlikte: YOLO eager init +
  publish loop safe except. 7 saatlik iş, **ilk inference 5–15s → < 100ms**
  düşüş ve sessiz WS ölümlerinin **anında** sonu. Sprint 13'ün diğer
  BL'lerinden bağımsız, paralel başlatılabilir.

</div>

### Hedef Metrikler

<div class="tier1">

- Mobile pair drop oranı **< %0.5 / saat** (mevcut: ~%80 / 30 sn)
- WS close code stack trace coverage **%100** (mevcut: stack trace yok)
- YOLO ilk inference süresi **< 100 ms** (mevcut: 5–15 sn)
- 30 dakika sustained mobile stream başarısı **%100** (ekran kapalı +
  network anahtarlama altında)

</div>

### Backlog

| BL | İş | dev_role | Saat |
|---|---|---|---|
| 13-01 | **YOLO eager init** — FastAPI startup event'inde `_get_yolo()`; ilk frame beklemiyor (`publish_handler.py:149-176`) | ai_backend | 3 |
| 13-02 | **Publish loop safe except** — `except Exception:` ekle, per-frame error log, loop kapanmasın (`publish_handler.py:388-486`) | ai_backend | 4 |
| 13-03 | **write_incident decouple** — `asyncio.Queue` + background worker; receive loop bekletme | ai_backend | 10 |
| 13-04 | **WS close code/reason structured logging** — publish & detections endpoint'leri; CloudWatch'a stack trace | ai_backend | 4 |
| 13-05 | CloudWatch metric filters: `publish_idle_timeout`, `publish_exception`, `yolo_init_duration_ms` | ai_backend | 3 |
| 13-06 | **Frontend bufferedAmount backpressure** — `if (ws.bufferedAmount > 250_000) return;` (`CamPairCapture.tsx:235-254`) | portal_frontend | 4 |
| 13-07 | **Visibility pause/resume** — `document.visibilityState === 'hidden'` → setStreaming(false); `setInterval` guard | portal_frontend | 4 |
| 13-08 | **Auto-reconnect** — `ws.onclose` → exponential backoff (3 attempt: 1s/2s/4s), telemetri | portal_frontend | 6 |
| 13-09 | CamPairCapture debug overlay — framesSent, bufferedAmount, lastCloseCode (dev-only) | portal_frontend | 3 |
| 13-10 | **Stretch** — Detection worker pool (asyncio.Queue + N=2 workers); P2 madde, zaman kalırsa | ai_backend | 12 |
| 13-11 | E2E reliability test: 30 dk sustained mobile stream + screen-off + 4G/5G/WiFi switching | project_coordinator | 8 |
| 13-12 | Runbook: "Camera Pair Drop Postmortem" — kök neden + fix listesi + monitoring runbook | project_coordinator | 4 |

**Toplam (baseline):** ~53 saat \\
**Toplam (stretch dahil):** ~65 saat

### Kabul Kriterleri

<div class="tier1">

- 30 dakika sustained mobile stream **kopmadan** tamamlanır (Android Chrome + iOS Safari)
- Telefon ekranı kapalı → ekran açık döngüsünde stream **otomatik resume**
- WS close olayları CloudWatch'ta close_code + reason ile **stack trace eşliğinde** görünür
- YOLO ilk inference < 100 ms (eager init)
- Receive loop'ta exception fırlatan frame **skip** edilir, sonraki frame işlenir

</div>

### Risk Notu

- Visibility pause iOS Safari'de tutarsız olabilir — fallback olarak
  `freeze`/`resume` page lifecycle event'leri de bağla
- Detection worker pool (13-10) Sprint 18'de zaten gerekecek; burada
  öteleyebiliriz, kritik değil

---

## Sprint 14 — Dataset Pipeline Foundation

**Tema:** Boru hattını gerçekten kur + Faz uyumu altyapısı

PRD-017 yazıldı ama gerçek implementation yok. Bu sprint dokümandan koda
geçişi sağlar; ayrıca Faz 0-1/2/4 uyum BL'lerini ekler.

<div class="tier1"><strong>Hızlı Kazanç — En Önce Yapılacaklar (~2 saat)</strong>

- **BL-14-08 (2h):** `config.yaml` cleanup — `keyboard` (76) ve `laptop`
  (63) sınıflarını `classes_of_interest`'ten **çıkar**, `paper_detected`
  mapping'ini düzelt. Sınav masasında klavye/laptop olmaz; sistemin bu
  iki sınıfı her frame'de tarayıp gürültü üretmesine gerek yok. Mevcut
  FP'leri **anında** düşürür ve YOLO inference süresini kısaltır.

**Etkilenen kod:**

```yaml
# ai-service/config.yaml — SONRA:
classes_of_interest: [0, 67, 73]  # person, cell phone, book
incident_class_map:
  'cell phone': phone_detected
  'book':       book_detected     # paper_detected DEĞİL — kitap yasak
                                  # materyal kuralı varsa burada eşleşir
# paper_notes class'ı Sprint 16'da custom model ile gelir
```

</div>

### Backlog

| BL | İş | dev_role | Saat |
|---|---|---|---|
| 14-01 | `datasets` tablosu migration + RLS politikaları (PRD-017 §10) | portal_backend | 4 |
| 14-02 | `scripts/import_dataset.py` — Roboflow CLI + FiftyOne wrapper | ai_backend | 8 |
| 14-03 | `scripts/convert_dataset.py` — COCO/VOC/OID → YOLO | ai_backend | 8 |
| 14-04 | `scripts/validate_dataset.py` — quality_report.json (PRD-017 §6.3) | ai_backend | 8 |
| 14-05 | `scripts/merge_datasets.py` — class mapping + stratified split | ai_backend | 8 |
| 14-06 | `scripts/anonymize_frame.py` — Gaussian blur yüzler | ai_backend | 4 |
| 14-07 | `data/` klasör hierarchy + `.gitignore` + Supabase Storage bucket | ai_backend | 2 |
| 14-08 | **`config.yaml` cleanup** — keyboard/laptop çıkar, `paper_detected` mapping düzelt | ai_backend | 2 |
| 14-09 | `/api/ai/datasets` CRUD endpoint'leri (admin-only RBAC) | portal_backend | 8 |
| 14-10 | `/admin/datasets` UI — liste, kalite raporu, merge sihirbazı | portal_frontend | 12 |
| 14-11 | E2E test: 100-frame dummy → import → validate → merge → export | project_coordinator | 6 |
| **14-12** | **`anonymized-training-frames` bucket migration + RLS** (Tasarım Kararı §2) | portal_backend | 3 |
| **14-13** | **`internal_training_samples` tablo migration** (`original_incident_id` FK + indexler — Karar §1) | portal_backend | 4 |
| **14-14** | **Audit event_type taxonomy:** `dataset.{import,merge,validate,deploy,annotation_complete}` + `portal/lib/audit/dataset.ts` | portal_backend | 4 |
| **14-15** | **`routes.ts`** + **`ADMIN_ONLY_ROUTES`** + **`Sidebar.tsx`** "Exam Module" → Datasets entry | portal_frontend | 3 |
| **14-16** | **RBAC sözleşmesi**: planın her yerinde "chief proctor" → `supervisor`, dataset endpoint'leri `is_admin()` guard | full_stack | 1 |

**Toplam:** ~85 saat

### Çıktı

- Dataset boru hattı **gerçekten** çalışır
- BL-14-08: keyboard/laptop yanlış mapping'i kaldırılmış
- Admin UI'dan dataset durumu izlenebilir
- Faz 0-1/2/4 uyum altyapısı (bucket, tablo, audit, route, RBAC) yerinde

### Kabul Kriterleri

- 100-frame test dataset import → `quality_report.json` oluşur
- Merged dataset YOLOv8 `data.yaml` ile valid (ultralytics yükleyebilir)
- Anonymize edilmiş frame'de yüz Gaussian blur uygulanmış (visual doğrulama)
- `internal_training_samples` row'u oluşturulduğunda `audit_logs`'da
  `dataset.annotation_complete` event'i görünür
- `/admin/datasets` sayfası **admin olmayan kullanıcıya 403** döner

---

## Sprint 15 — Phone & Earbuds & Smartwatch Eğitimi

**Tema:** Domain adapte v1.0

### Backlog

| BL | İş | Saat |
|---|---|---|
| 15-01 | COCO subset fetch: `cell phone` 2000, `book` 1000 | 3 |
| 15-02 | Open Images V7 fetch: `Mobile phone` 5000, `Headphones` 3000, `Watch` 3000 | 6 |
| 15-03 | Roboflow scout + indir: 3 earbuds + 2 smartwatch dataset | 8 |
| 15-04 | Open Images "Headphones" → in-ear filter (over-ear'ı çıkar) | 6 |
| 15-05 | İç-controlled capture: S2 (12 clip) + S3 (6) + S4 (3) → 250–400 frame | 12 |
| 15-06 | CVAT annotation server kur + ekibe brief | 4 |
| 15-07 | Annotation: ~700 frame, 4 sınıf | 16 |
| 15-08 | 150-frame phone benchmark (gerçek sınıf, 3 aydınlatma) | 6 |
| 15-09 | Merge `datasets v1.0` → YOLOv8n fine-tune (Colab T4, 50 epoch) | 6 |
| 15-10 | Benchmark + `ai_models` registry yaz; başarılıysa staged | 4 |
| 15-11 | A/B test: stock vs v1.0 — 48h shadow inference | 4 |
| 15-12 | **Fallback augmentation kaynağı** (yetersiz çeşitlilikte tetiklenir): Objects365 V2 + LVIS v1 subset (wristwatch, eraser, pen) | 4 |

**Toplam:** ~79 saat

### Kabul Kriterleri

<div class="tier1">

- Phone precision ≥ %85, recall ≥ %80
- Earbuds precision ≥ %70, recall ≥ %65
- Smart watch precision ≥ %75 (lab + sınıf benchmark)
- Person recall ≥ %95 (regresyon yok)
- Shadow inference: yeni model FP/saat oranı eski modelin altında

</div>

---

## Sprint 16 — Paper Notes & Kalemlik & Hesap Makinesi

**Tema:** Off-the-shelf olmayanlar

<div class="tier3"><strong>Bu Sprint Riskli</strong>
Off-the-shelf veri yok. Tamamen kontrollü iç-veri toplanır. Senaryo
çeşitliliği yetersizse FP patlar.
</div>

### Backlog

| BL | İş | Saat |
|---|---|---|
| 16-01 | Senaryo şartnamesi: S1 6 alt-senaryo + S6 6 negatif | 4 |
| 16-02 | Capture: 3 kişi × 6 senaryo × 3 aydınlatma × 2 kamera = 108 clip | 16 |
| 16-03 | Frame extraction (2 FPS) → ~600 ham frame + pre-label | 14 |
| 16-04 | Pencil case için Open Images V7 (~1500) + iç-veri 200 frame | 4 |
| 16-05 | Calculator için Open Images V7 + Roboflow + iç-veri | 4 |
| 16-06 | Negative mining: meşru "kağıt üzerinde yazma" frame'leri (FP) | 8 |
| 16-07 | Roboflow scout: "cheat sheet", "hidden notes" varsa indir | 4 |
| 16-08 | Merge `datasets v2.0` (+ 3 yeni sınıf) | 4 |
| 16-09 | Fine-tune v2.0; v1.0 ile A/B | 6 |
| 16-10 | Benchmark + admin onayı + staged deploy | 6 |

**Toplam:** ~70 saat

### Kabul Kriterleri

- `paper_notes` precision ≥ %75 (kontrollü), ≥ %65 (canlı sınıf)
- `pencil_case` FP rate < %5 (kalemlikteki normal kalemleri yanlış pozitif
  saymamalı)
- `calculator` precision ≥ %80 (programlanabilir vs basit ayrımı bonus)

---

## Sprint 17 — Pose & Davranış & Gaze Refinement

**Tema:** Bbox'tan davranışa; gaze sinyallerini sınıf geometrisine bağla

### Backlog

| BL | İş | Saat |
|---|---|---|
| 17-01 | MediaPipe Pose extractor (33 keypoint per track) | 6 |
| 17-02 | `body_lean_neighbor` kuralı: torso > 20° + komşu yön kalibrasyonu | 8 |
| 17-03 | `standing_up` kuralı: omuz/kalça y-koord %30+ delta | 6 |
| 17-04 | `hand_under_desk`: el y > masa segment y, sustained 5s | 8 |
| 17-05 | `hand_to_ear_mouth`: el-yüz dist < 50px, sustained 2s | 6 |
| 17-06 | İç-controlled capture S5: 5 davranış × 3 kişi × 2 koltuk = ~30 clip | 10 |
| 17-07 | Annotation (frame-level action labels) | 8 |
| 17-08 | Opsiyonel: AVA Actions subset (`hand_pass_object`) — pose rule yetmezse. **Alternatif:** NTU RGB+D 120 skeleton-action (ST-GCN baseline) veya Kinetics-700 (SlowFast pretrain) | 6 |
| 17-09 | `object_passing`: iki track el yakınlaşması + sustained 1–3s | 6 |
| 17-10 | Fargate resource bump 2048→3072 CPU, 6144→7168 MB + benchmark | 6 |
| **17-11** | **`gaze_at_lap`** — pitch açısı aşağı (kucağa) + sustained 5s + bbox lap region (phone/notes lap'ta görünmüşse severity boost) | 4 |
| **17-12** | **`gaze_at_neighbor` direction calibration** — Sprint 8 generic gaze diversion'u PRD-013 §3.6 koltuk geometrisine bağla; sol/sağ komşu yönüne göre filtre | 6 |
| **17-13** | **`synchronized_behavior`** — multi-track temporal correlation: iki komşu öğrenci 2s içinde aynı yöne, tekrarlı (5dk içinde 3+ kez) | 6 |
| **17-14** | **Stretch — L2CS-Net gaze fallback** — MediaPipe Face Mesh pitch'i kucağa-bakma için yetersizse drop-in inference (Gaze360 pretrained) | 4 |

**Toplam (baseline):** ~90 saat \\
**Toplam (stretch dahil):** ~94 saat

### Kabul Kriterleri

- `body_lean_neighbor` precision ≥ %75
- `standing_up` recall ≥ %90 (kolay sinyal)
- `hand_under_desk` FP < %15 (kalem düşürme/eğilme ile karışmamalı)
- `object_passing` precision ≥ %70 (zor sinyal)
- `gaze_at_lap` precision ≥ %75 (sustained 5s, lap region overlap)
- `gaze_at_neighbor` calibrated FP rate kalibrasyondan önceki **yarıya düşmüş** olmalı
- `synchronized_behavior` precision ≥ %70 (3+ kez 5dk içinde tekrarlanma)

---

## Sprint 18 — Multi-Camera Fusion + LiveMonitor Refactor

**Tema:** Çoklu kamera ile precision kilidi

**Hedef:** Aynı incident farklı kameralarda görünürse severity boost; tek
kameranın gördüğü ama diğerinin görmediği → güven düşür. Mevcut LiveMonitor
"single-session demo" modundan **gerçek multi-cam grid**'e geçer.

**Faz 4 uyum notu:** `cameras`, `session_cameras`, `camera_health_events`
tabloları (PRD-019) **zaten canlı**. Yeni multi-cam tablo eklenmez —
sadece UI ve fusion logic eklenir. LiveMonitor sıfırdan yazılmaz;
`framesByCamera: Map` ve `sessionCameras: SessionCameraRow[]` zaten
mevcut (`portal/components/exams/LiveMonitor.tsx:42,45`); demo flag
kaldırılıp grid layout aktive edilir.

### Backlog

| BL | İş | Saat |
|---|---|---|
| 18-01 | PRD-013 §3.8 multi-cam coordinator gerçek implementation | 10 |
| 18-02 | Cross-camera Re-ID: Market-1501 üzerinde OSNet/TransReID pretrained. **Cross-domain düşerse fallback:** MSMT17 (15-cam) veya CUHK03 (5-cam çift) ile ek fine-tune | 6 |
| 18-03 | Person re-id embedder service (track_id × camera × embedding) | 8 |
| 18-04 | Multi-camera person matcher: cosine sim > 0.7 → unified person_id | 8 |
| 18-05 | İç multi-cam capture: cam-pair token ile 2 telefon, 3 senaryo × 4 kişi = test seti | 8 |
| 18-06 | Severity fusion: tek = original; 2+ onay = +1 severity tier | 4 |
| 18-07 | Kalibrasyon: kamera çakışma bölgesi (overlap zone) UI | 12 |
| 18-08 | **LiveMonitor refactor**: "Pick first session" demo flag kaldır, `framesByCamera` Map'i unlock et, grid layout | 6 |
| 18-09 | Çapraz-doğrulama benchmark: tek-cam vs 2-cam | 7 |
| 18-10 | Detection worker pool (Sprint 13'ten ötelenmişse) — cross-cam fusion zaten queue ister | 8 |
| **18-11** | **`face_covering` (maske/cap ile kimlik gizleme)** — MaskedFace-Net (sentetik, CC-BY-NC: **production'da iç-veri ile değiştir**, geliştirmede OK) + WIDER FACE fine-tune; sustained 30s+ kuralı | 8 |

**Toplam:** ~77 saat (worker pool 18-10 dahil; çıkarılırsa ~69)

### Kabul Kriterleri

- Multi-cam onaylı incident precision ≥ %92
- Tek-cam vs multi-cam fark ≥ %10 precision artışı
- Person re-id cross-camera accuracy ≥ %85 (Market-1501 benchmark + iç-veri)
- `face_covering` precision ≥ %80, recall ≥ %70 (sustained 30s+)

<div class="page-break"></div>

# Doğrulama Kapıları

PRD-017 §13'teki acceptance kriterleri sıkılaştırılmıştır.

## Sprint Sonu Zorunlu Kontroller

<div class="accent-box"><strong>Her Sprint'in Son Commit'inde</strong>

1. Annotation kalitesi: rastgele 50 örnek, 2 annotator ≥ %95 IoU agreement
2. Domain gap testi: harici test metric'i ≥ iç-test metric × 0.85
3. A/B shadow inference: 48h, FP/saat oranı eski modelden yüksekse **promote etme**
4. KVKK gate: `internal/positives`'a giren her frame anonymized (CI lint)
5. Lisans gate: `datasets` row'unda lisans NULL veya CC-BY-NC ise prod deploy bloklu

</div>

## Class-Bazlı KPI Tablosu

| Sınıf | Phase A.1 Min | Phase B Hedef | Phase C Olgun |
|---|---|---|---|
| phone precision | %75 | %85 | %90 |
| phone recall | %70 | %80 | %85 |
| earbuds precision | — | %70 | %80 |
| earbuds recall | — | %65 | %75 |
| smart_watch precision | — | %75 | %85 |
| paper_notes precision | — | %75 | %85 |
| paper_notes recall | — | %65 | %75 |
| body_lean precision | — | %75 | %85 |
| standing_up recall | — | %90 | %95 |
| person recall | %95 | %95 | %98 |
| mAP@0.5 toplam | 0.65 | 0.75 | 0.85 |
| FP/saat | < 6 | < 3 | < 1 |

## Benchmark Set Yapısı

Her sınıf için iki ayrı test seti tutulur:

1. **Lab test set** — kontrollü, ideal koşul (model overfit miydi kontrolü)
2. **Field test set** — gerçek sınıf, anonimize, çok kameralı (gerçek
   precision)

**Promote kuralı:** Yeni model **her iki test setinde** önceki versiyonu
geçmelidir.

<div class="page-break"></div>

# Risk Register

## Reliability Riskleri (Sprint 13 Kapsamı)

| Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|
| YOLO eager init başlangıç süresini Fargate health-check'in altına itmez | Düşük | Orta | health-check `start-period` 10s → 30s; cold-start telemetri |
| Visibility pause iOS Safari'de tutarsız | Yüksek | Orta | `freeze`/`resume` page lifecycle event fallback; manual reconnect butonu |
| Auto-reconnect backoff sırasında frame kaybı | Orta | Düşük | Reconnect sırasında lokal frame buffer (max 5 frame); recovery sonrası flush |
| Detection worker pool latency artırır | Orta | Orta | Sprint 13'te stretch; metric karşılaştırmadan promote etme |

## Dataset Riskleri (Sprint 14–18 Kapsamı)

| Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|
| Roboflow datasetleri kalitesiz çıkar | Orta | Orta | PRD-017 §4.2 katı filtre; ilk 3-5 sonucu manuel önizle |
| İç-controlled capture'de senaryo çeşitliliği az | Yüksek | Yüksek | En az 3 kişi × 3 aydınlatma × 2 açı zorunlu; negatif örnek pozitiflerle eşit |
| `paper_notes` için yeterli FP-negatif yok → FP patlar | Yüksek | Yüksek | S6 negatif senaryolar; canlı shadow 48h öncesi promote etme |
| Open Images Headphones over-ear'ı kapsar | Yüksek | Orta | Manuel filtre; in-ear only |
| MaskedFace-Net CC-BY-NC → ticari deploy riski | Orta | Yüksek | Sadece `face_covering` için kullan; production'da iç-veri ile değiştir |
| Annotation maliyeti budget'i aşar | Orta | Orta | Pre-label + manuel düzelt (%70 hız); CVAT batch UI |
| Multi-cam kalibrasyon başarısız | Orta | Yüksek | Sprint 18'de overlap zone UI; manuel marker pin |
| Person Re-ID cross-domain düşer | Yüksek | Orta | Market-1501 + iç-veri fine-tune; sınıf ortamı pretrain |
| Fargate CPU yetmez (Pose ek yükü) | Orta | Orta | Sprint 17'de 2048→3072 bump; pose sampling Nth frame |
| Anonymize copies tablo şişer (her sınav 100+ row) | Orta | Düşük | Auto-archive (12 ay sonra status='archived'); query indexes |
| Sprint 12 evidence manifest'ine yanlışlıkla dokunma | Düşük | Yüksek | Anonymize copies **ayrı bucket + ayrı sha256**; CI test: manifest hash regression check |
| KVKK denetimi öğrenci verisi ile eğitimi reddeder | Düşük | Kritik | Anonimizasyon zorunlu; rıza formu; opt-out path |

<div class="page-break"></div>

# Sözlük (Öğrenme için)

mAP (mean Average Precision)
:   Object detection metriği. mAP@0.5 = IoU eşiği 0.5 iken ortalama AP. mAP@0.5:0.95 = 10 farklı IoU eşiğinde ortalama (daha sıkı).

IoU (Intersection over Union)
:   İki bbox'un örtüşme oranı. Doğru tespit kabul için genelde ≥ 0.5.

Precision
:   Tespit edilenlerin kaçı gerçekten doğru. TP / (TP + FP).

Recall
:   Gerçek nesnelerin kaçı yakalandı. TP / (TP + FN).

F1
:   Precision ve recall'un harmonik ortalaması. 2PR / (P + R).

Fine-tune
:   Önceden eğitilmiş modeli (pretrained), kendi dataset'inle daha az epoch'la özelleştirme.

Domain gap / Domain bias
:   Eğitim verisi ile production verisi farklı dağılımdan geliyorsa oluşan performans düşüşü. Sokak/ofis ortamında eğitilmiş COCO modelinin sınıfta daha kötü çalışması bunun örneği.

Pretrain
:   Büyük genel dataset üzerinde modeli baştan eğitmek (örn: ImageNet, COCO). Fine-tune'un başlangıç noktası.

Stratified split
:   Train/val/test ayrımında her split'te sınıf dağılımının orijinal ile aynı kalmasını sağlama.

Hard negative mining
:   Modelin yanlış pozitif ürettiği örnekleri özellikle yeni eğitim turuna ekleme — FP'yi azaltır.

Pose estimation
:   Bir kişinin vücut keypoint'lerini (omuz, dirsek, diz, kalça, vs.) tespit etme. MediaPipe Pose 33 keypoint çıkarır.

Re-Identification (Re-ID)
:   Bir kişiyi farklı kameralarda veya farklı zamanlarda aynı kişi olarak tanıma — yüz tanımadan farklı (giysi, boy, yürüyüş kullanır).

Confidence threshold
:   Modelin tespit kabul ettiği minimum güven skoru. Düşürürsen recall artar (daha çok yakalar) ama FP artar; yükseltirsen tersi.

Confusion matrix
:   Doğru/yanlış pozitif/negatif sayılarını gösteren tablo. Her hata türünü görmek için temel.

Sustained detection
:   Bir sinyalin belirli süre boyunca devam etmesi gerekliliği. "1 frame'lik yanlışı" filtrelemek için kullanılır.

Shadow inference
:   Yeni modeli production trafiği üzerinde çalıştır ama kararları kullanma — sadece logla. A/B'ye geçmeden önce güvenlik kontrolü.

<div class="page-break"></div>

# Ekler

## Ek A — Yararlı Komutlar

### FiftyOne ile COCO subset

```bash
pip install fiftyone
python -c "
import fiftyone.zoo as foz
import fiftyone as fo
ds = foz.load_zoo_dataset('coco-2017',
    split='train',
    label_types=['detections'],
    classes=['cell phone', 'book'],
    max_samples=2000,
    dataset_name='coco_phone_book')
ds.export(export_dir='./data/raw/coco_subset/',
    dataset_type=fo.types.YOLOv5Dataset)
"
```

### Open Images V7 selective download

```bash
python -c "
import fiftyone.zoo as foz
import fiftyone as fo
ds = foz.load_zoo_dataset('open-images-v7',
    split='train',
    label_types=['detections'],
    classes=['Mobile phone', 'Headphones', 'Watch', 'Pencil case'],
    max_samples=5000)
ds.export(export_dir='./data/raw/oid_v7/',
    dataset_type=fo.types.YOLOv5Dataset)
"
```

### Roboflow CLI ile dataset indirme

```bash
pip install roboflow
python -c "
from roboflow import Roboflow
rf = Roboflow(api_key='YOUR_KEY')
proj = rf.workspace('WORKSPACE').project('PROJECT')
ds = proj.version(1).download('yolov8')
"
```

### YOLOv8 fine-tune

```bash
cd ai-service
python -m scripts.finetune_yolo \
    --data data/merged/v1_phone_earbuds/data.yaml \
    --weights yolov8n.pt \
    --epochs 50 \
    --imgsz 640 \
    --batch 16 \
    --output runs/v1-001 \
    --register \
    --model-name yolov8n-horuseye \
    --model-version v1.0
```

### CVAT self-hosted (Docker)

```bash
git clone https://github.com/opencv/cvat
cd cvat
docker compose up -d
# http://localhost:8080
```

## Ek B — Lisans Hızlı Bakış

| Lisans | Kullanılabilir mi? |
|---|---|
| CC0 (Public Domain) | ✓ Sınırsız |
| CC-BY 4.0 | ✓ Kaynak göstererek |
| CC-BY-SA 4.0 | ⚠ Türetilen aynı lisansla paylaşılmalı |
| CC-BY-NC | ⚠ Üniversite projesi gri; ticari deploy bloklu |
| Apache 2.0 / MIT | ✓ |
| GPL / AGPL | ⚠ Modeli paylaşıyorsan source paylaşımı gerekebilir |
| Belirsiz / Yok | ✗ Kullanma |

## Ek C — Referans Kodları (PRD ve Sprint backlogu)

- [PRD-013](../../PRD/PRD-013-camera-ai-analysis.md) — Camera AI Analysis
  (WHAT)
- [PRD-017](../../PRD/PRD-017-dataset-training-pipeline.md) — Dataset
  & Training Pipeline (HOW)
- [PRD-018](../../PRD/PRD-018-sprint-backlog.md) — Sprint Backlog
  System
- [PRD-020](../../PRD/PRD-020-phase-b-ai-pipeline.md) — Phase B Roadmap

## Ek D — Versiyon Geçmişi

| Versiyon | Tarih | Değişiklik |
|---|---|---|
| 1.0 | 2026-05-13 | İlk versiyon — Sprint 13-17 planlama, dataset kaynak kataloğu, kontrollü veri toplama protokolü |
| 2.0 | 2026-05-13 | Sprint 11/12 live; Sprint 13 olarak Live Pipeline Reliability eklendi (camera pair drop fix); eski sprintler 14-18'e kaydı; Faz 0-1/2/4 uyum bölümü; 6 Tasarım Kararı; Sprint 14'e 5 alignment BL; Sprint 18 LiveMonitor refactor olarak revize; reliability risk satırları |
| **2.1 (final)** | **2026-05-13** | **Coverage kapatma: Sprint 17'ye 4 BL (17-11 gaze_at_lap, 17-12 neighbor calibration, 17-13 synchronized_behavior, 17-14 L2CS-Net stretch); Sprint 18'e BL-18-11 face_covering (MaskedFace-Net+WIDER FACE); Sprint 15'e 15-12 fallback augmentation (Objects365+LVIS); BL-17-08'e NTU RGB+D / Kinetics alternative notu; BL-18-02'ye MSMT17/CUHK03 fallback notu; Sprint 13/14'e Hızlı Kazanç callout'ları; water_bottle_with_label catalog'dan çıkarıldı; toplam saat ~445 → ~470** |

<br><br>

<div style="text-align:center; color:#94a3b8; margin-top: 2cm;">
HorusEye Team • 2026
</div>
