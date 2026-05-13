# PRD-021 — Dataset Geliştirme & Reliability Yol Haritası (Sprint 13–18)
**Versiyon:** 1.0
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000, PRD-013, PRD-017, PRD-018, PRD-019, PRD-020
**Blocks:** —
**Durum:** AKTIF (Sprint 13 başlayınca)
**Feature Flag:** `NEXT_PUBLIC_CAMERA_MODULE_ENABLED=true` (PRD-013 ile paylaşımlı)

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
LogEvent: @1.2
-->

## ⚠️ LLM TALİMATI

Bu PRD; Phase B (Sprint 7–12) bitiminden sonra Sprint 13–18 için **icra
köprüsüdür**. Genişletilmiş tespit kataloğu, dataset kaynak detayları,
kontrollü veri toplama protokolü ve sözlük **bu PRD'de DEĞİL,**
`docs/dataset-plan/dataset-development-plan.md` v2.1'de bulunur.

- PRD-013 = WHAT (ne tespit ediyoruz)
- PRD-017 = HOW (dataset pipeline spec)
- **PRD-021 = WHEN/WHO (sprint sırası + BL atamaları + reliability)**

Spec değişikliği gerekirse: PRD-017'ye (data) veya PRD-013'e (detection
kategorisi) yapılır; PRD-021 yalnızca yeni BL ekler veya kapsamı revize
eder.

---

## 1. Amaç

Mayıs 2026 itibarıyla Sprint 11 ve Sprint 12 production'a alındı. Bundan
sonraki 6 sprint **iki açığı paralel kapatır:**

1. **Live Pipeline Reliability** — mobile kamera pair drop kök
   nedenleri (Sprint 13)
2. **Dataset Excellence** — COCO stock'tan custom modele geçiş; pose,
   gaze, kimlik sinyalleri; multi-camera fusion (Sprint 14–18)

Bu PRD altı sprint'in resmi tanımıdır.

---

## 2. Referanslar

| Doküman | Rol |
|---|---|
| **`docs/dataset-plan/dataset-development-plan.md`** | **Kanonik source-of-truth — narrative, dataset kataloğu, kontrollü senaryo protokolü, sözlük, ekler** |
| `docs/dataset-plan/dataset-development-plan.pdf` | İnteraktif PDF (54+ sayfa, click-through dataset linkleri) |
| PRD-013 §7.2 | Detection categories taxonomy (TIER 1/2/3) |
| PRD-013 §14 | Dataset strategy (üst düzey) |
| PRD-013 §3.8 | Multi-camera coordination |
| PRD-017 §4–13 | Dataset pipeline spec (HOW) |
| PRD-019 | Camera pairing + multi-cam DB |
| PRD-020 | Phase B sprint backlog (Sprint 7–12) |

---

## 3. Sprint Özetleri

### Sprint 13 — Live Pipeline Reliability (~53–65h)

**Tema:** Mobile pair drop kök nedenleri (YOLO lazy-load, sessiz exception,
backpressure eksiği)

**Hızlı kazanç:** BL-13-01 + 13-02 (toplam 7h) — YOLO eager init +
publish loop safe except. Mobile drop pattern derhal sonlanır.

**12 BL** — bkz. `backlog_items` tablosu `sprint_id = (Sprint 13)`.

**Kabul:** 30 dk sustained mobile stream başarısı %100; WS close
events stack trace ile loglanır; YOLO ilk inference < 100ms.

---

### Sprint 14 — Dataset Pipeline Foundation + Faz Uyumu (~85h)

**Tema:** PRD-017'nin gerçek implementation'ı + Faz 0-1/2/4 uyum
altyapısı

**Hızlı kazanç:** BL-14-08 (2h) — `config.yaml`'dan `keyboard` ve
`laptop` sınıflarını çıkar; sınav masasında bulunmayan sınıfların FP'si
durur, CPU kazanılır.

**16 BL** (11 baseline + 5 alignment: anonymized bucket, internal_training_samples
tablosu, audit event_type, route/sidebar, RBAC).

**Kabul:** 100-frame dummy dataset import→validate→merge→export başarılı;
`/admin/datasets` admin-only.

---

### Sprint 15 — Phone & Earbuds & Smartwatch (~79h)

**Tema:** Domain adapte v1.0 — COCO subset + Open Images V7 + Roboflow +
iç-controlled capture → YOLOv8n custom v1.0

**12 BL.**

**Kabul:** Phone precision ≥ %85, earbuds ≥ %70, smart_watch ≥ %75,
person recall ≥ %95.

---

### Sprint 16 — Paper Notes & Kalemlik & Hesap Makinesi (~70h)

**Tema:** Off-the-shelf veri yok — kontrollü iç-veri toplama

**10 BL.**

**Kabul:** paper_notes precision ≥ %75 kontrollü, ≥ %65 canlı; pencil_case
FP < %5.

---

### Sprint 17 — Pose & Davranış & Gaze Refinement (~90–94h)

**Tema:** MediaPipe Pose entegrasyonu + sınıf geometrisine bağlı gaze
sinyalleri + senkronize davranış

**14 BL** (10 baseline + 4 v2.1 gap-closure: gaze_at_lap, neighbor
calibration, synchronized_behavior, L2CS-Net stretch).

**Kabul:** body_lean ≥ %75, standing_up recall ≥ %90, gaze_at_lap ≥ %75,
synchronized_behavior ≥ %70.

---

### Sprint 18 — Multi-Camera Fusion + Face Covering (~77h)

**Tema:** Çoklu kamera precision kilidi + LiveMonitor demo flag kaldırma
+ MaskedFace-Net ile face_covering

**11 BL** (10 baseline + 1 v2.1: face_covering).

**Kabul:** Multi-cam onaylı incident precision ≥ %92; tek-cam vs 2-cam
fark ≥ %10 precision artışı; face_covering precision ≥ %80.

---

## 4. Tasarım Kararları (Sabit)

Tüm kararların gerekçesi `docs/dataset-plan/` §4'te. Özet:

1. **Anonimize frame storage:** tablo (`internal_training_samples`) + bucket
   (`anonymized-training-frames`) — path konvansiyonu **değil**
2. **Bucket:** 50MB limit, admin-only RLS
3. **Audit event_type genişleme:** `dataset.{import,merge,validate,deploy,annotation_complete}`
4. **Tarihler relative:** mutlak tarih yok; admin /sprints UI'sından set
5. **Detection worker pool:** Sprint 13 stretch (BL-13-10) → fallback
   Sprint 18 (BL-18-10)
6. **BL numaralandırma:** `{sprint}-{idx}` PRD-020 konvansiyonu

---

## 5. Faz Uyum Garantileri

| Faz | Uyum Mekanizması |
|---|---|
| Faz 0-1 (Foundation) | Mevcut RBAC `is_admin()`, audit pattern, recharts, file storage bucket pattern re-use |
| Faz 2 (Sprint 12 live) | SHA-256 evidence manifest **kırılmaz** — anonimize kopyalar ayrı bucket/tablo; PDF üretimi `@react-pdf/renderer` aynı |
| Faz 4 (PRD-013/019/020) | `ai_models`, `cameras`, `session_cameras` tabloları re-use; LiveMonitor `framesByCamera` Map zaten mevcut, sadece demo flag kaldırılır |

Detay: `docs/dataset-plan/` §3.

---

## 6. KPI Tablosu

| Metrik | Mevcut | Sprint 18 Hedef |
|---|---|---|
| Mobile pair drop oranı | ~%80 / 30 sn | < %0.5 / saat |
| Phone precision | ~%75 | ≥ %90 |
| Earbuds precision | yok | ≥ %75 |
| Smart watch precision | yok | ≥ %75 |
| Paper notes precision | yok | ≥ %75 kontrollü, ≥ %65 canlı |
| `gaze_at_lap` precision | yok | ≥ %75 |
| `face_covering` precision | yok | ≥ %80 |
| Multi-cam onaylı incident precision | tek-cam | ≥ %92 |

---

## 7. Risk Register (Özet)

Tam risk register `docs/dataset-plan/` §9'da.

| Top-5 Risk | Mitigation |
|---|---|
| MaskedFace-Net CC-BY-NC ticari kısıtlama | Geliştirmede OK; production öncesi iç-veri ile değiştir |
| Mobile visibility pause iOS Safari'de tutarsız | `freeze`/`resume` page lifecycle fallback (Sprint 13) |
| paper_notes için yeterli negatif örnek yok | S6 negatif senaryolar (kontrollü senaryo §5.2.6) |
| Sprint 12 evidence manifest'i yanlışlıkla bozma | Anonimize copies ayrı bucket; CI regression test |
| Cross-camera Re-ID cross-domain düşer | MSMT17 / CUHK03 fallback fine-tune |

---

## 8. İlişkili Migrations

Bu PRD'nin yarattığı/yarattıracağı migrations:

| Migration | İçerik | Sprint |
|---|---|---|
| `20260513_seed_sprint_13_18_backlog.sql` | 6 sprints + ~65 backlog_items | 13 (kick-off) |
| `*_create_anonymized_training_frames_bucket.sql` | Bucket + RLS | 14 (BL-14-12) |
| `*_create_internal_training_samples.sql` | Tablo + indexler | 14 (BL-14-13) |
| `*_create_datasets_table.sql` | PRD-017 §10 tablo | 14 (BL-14-01) |

---

## 9. Test Senaryoları

| Senaryo | Sprint | Source |
|---|---|---|
| 30 dakika sustained mobile stream (ekran kapalı + network switch) | 13 | BL-13-11 |
| 100-frame dummy dataset E2E (import→merge→export) | 14 | BL-14-11 |
| 150-frame phone benchmark, 3 aydınlatma | 15 | BL-15-08 |
| paper_notes 600 frame controlled capture validation | 16 | BL-16-02/03 |
| body_lean + standing_up + hand_under_desk pose suite | 17 | BL-17-06/07 |
| 2-camera split view + cross-cam Re-ID benchmark | 18 | BL-18-05/09 |

---

## 10. Klasör Yapısı (Yeni)

```
docs/
└── dataset-plan/
    ├── dataset-development-plan.md     # Kanonik kaynak (v2.1 final)
    ├── dataset-development-plan.pdf    # İnteraktif PDF
    ├── dataset-development-plan.html   # Bonus tarayıcı görünümü
    └── style.css                       # PDF/HTML stili
```

Mevcut PRD klasörü:

```
PRD/
├── PRD-013-camera-ai-analysis.md       # WHAT
├── PRD-017-dataset-training-pipeline.md  # HOW (Implementation note: bkz §11)
├── PRD-018-sprint-backlog.md           # Sprint board sistemi
├── PRD-019-camera-pairing.md           # Multi-cam pairing
├── PRD-020-phase-b-ai-pipeline.md      # Sprint 7-12 (live)
└── PRD-021-dataset-roadmap.md          # BU — Sprint 13-18 köprü
```

---

## Changelog

| Versiyon | Tarih | Değişiklik |
|---|---|---|
| 1.0 | 2026-05-13 | İlk versiyon — `docs/dataset-plan/` v2.1'i PRD/sprint sistemine bağlar; 6 sprint + ~65 BL özet tablosu; faz uyum garantileri; KPI tablosu |
