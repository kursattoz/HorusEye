# PRD-013 — Kamera Modülü & AI Analiz Pipeline
**Versiyon:** 2.3
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000, PRD-001, PRD-006, PRD-007, PRD-016
**Blocks:** —
**Durum:** DRAFT → AKTIF (Phase A başladığında)
**Feature Flag:** `NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false`

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
LogEvent: @1.3
HealthStatus: @1.0
Notification: @1.0
ExamSession: @1.1
Camera: @1.2
Incident: @1.1
Student: @1.2
ExamRoom: @1.0
-->

## ⚠️ LLM TALİMATI
Bu modül `NEXT_PUBLIC_CAMERA_MODULE_ENABLED` feature flag'i ile korunur. Flag `false` iken:
- Kamera health card `/dev/monitor`'da "Not yet active" gösterir
- Kamera route'ları aktif değildir
- Dashboard'daki SuspicionAreaChart/SuspicionRadarChart mock veri gösterir

Flag `true` yapılmadan ÖNCE PRD-000'daki interface contract'lar güncellenmelidir.
Interface bağımlılıkları INTERFACE_DEPS bloğunda declare edilmiştir.

---

## 1. Amaç

Sınav odalarındaki fiziksel kameraları bağlayarak video akışı almak, AI tabanlı davranış tespiti yapmak (telefon, bakış sapması, kafa dönüşü vb.) ve sonuçları proctor dashboard'unda gerçek zamanlı göstermek.

---

## 2. Feature Flag

```env
NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false
```

| Flag | Davranış |
|------|----------|
| `false` | Tüm kamera route'ları devre dışı, monitor card placeholder, mock chart'lar |
| `true` | Tüm bu PRD'deki özellikler aktif |

---

## 3. Sistem Mimarisi

### 3.1 Genel Akış

```
Fiziksel Kamera (IP/USB)
    ↓ RTSP stream
AI Servis (Python — FastAPI + WebSocket)
    ├── Frame Ingestion (configurable FPS)
    ├── YOLOv8n Object Detection (person + phone + earbuds + paper)
    ├── BoT-SORT Multi-Object Tracking (persistent student_track_id)
    ├── MediaPipe Face Mesh (gaze vector + head pose)
    └── Rule-based RiskScorer → Incident
    ↓ WebSocket push (JSON)
Next.js Backend (WebSocket relay)
    ↓ real-time push
Proctor Dashboard (React)
    ├── Canlı kamera grid
    ├── Alert panel (severity bazlı)
    ├── Öğrenci bazlı incident timeline
    └── Push notification + sesli uyarı
    ↓ persist
Supabase PostgreSQL
    ├── incidents
    ├── exam_sessions
    ├── exam_rooms
    ├── cameras
    ├── students
    └── Evidence clips (Supabase Storage)
```

### 3.2 AI Pipeline Dizisi (Phase A — tek kamera)

> **Phase A kamera politikası:** Phase A resmi olarak **1 birincil kamera** destekler. Admin birden fazla kamera yapılandırırsa, AI servisi yalnızca `is_active=true` olan ilk kamerayı işler; diğerleri dashboard'da canlı feed gösterir ama AI analizi yapılmaz. Tam çoklu kamera füzyonu Phase B'dedir (§9).
>
> **Phase A / A.1 tespit kapsamı:**
> - **Phase A:** Sadece YOLOv8n COCO pre-trained → `phone_detected` + `empty_seat` (person detection'ın tersi). MediaPipe kullanılmaz. Bu MVP en hızlı deploy'dur.
> - **Phase A.1:** MediaPipe Face Mesh eklenir → `gaze_diversion` + `head_turn` aktif olur. Benchmark sonrası (§14.3) aktif edilir.

```
Frame (JPEG/raw @ 5-10 FPS)
    ↓
[YOLOv8n ObjectDetector]
    → BBox list: persons + objects (phone, earbuds, paper)
    → CPU inference: ~61 FPS (YOLOv8n nano)
    ↓
[BoT-SORT StudentTracker]
    → Her kişiye persistent track_id atar
    → Occlusion sonrası re-identification (ByteTrack'ten üstün)
    → Ultralytics built-in: model.track(tracker="botsort.yaml")
    ↓
[Per-student crop loop]
    → Her track_id için ROI extract
    ↓
[MediaPipe Face Mesh]
    → 468 3D landmark → gaze vector, head yaw/pitch/roll
    → Iris tracking ile bakış yönü tespiti (~25 FPS CPU)
    → Output: gaze_diversion: bool, head_turn_angle: float
    ↓
[Context Analyzer] ← YENİ — bağlam farkındalığı katmanı
    → Rol tanıma: bu kişi öğrenci mi, gözetmen mi? (bkz: §3.9)
    → Eylem bağlamı: ayağa kalkma, eğilme, gözetmen yakınlığı
    → Süpresyon: meşru hareketleri filtrele
    → Output: contextual_events[] (sadece gerçek şüpheli olanlar)
    ↓
[Rule-based RiskScorer]
    → Inputs: contextual_events + gaze events (per track_id, time window)
    → Rules: phone_detected=high, repeated_gaze_diversion(n>3/5min)=medium
    → Süpresyon kuralları aktif: gözetmen yanındayken alert üretme
    → Output: risk_score (0.0–1.0) + triggered_rules[]
    ↓
[IncidentFactory]
    → risk_score > threshold → Incident kaydı oluştur
    → Evidence: frame snapshot Supabase Storage'a kaydet
    → WebSocket alert kanalına push
    → Push notification + sesli uyarı tetikle (severity'ye göre)
```

### 3.3 Frame Processing Stratejisi

RTSP kameralar 25-30 FPS çıkış verir. AI pipeline'ı tüm frame'leri işleyemez. Strateji:

**Frame Sampling:** Her N. frame alınır (configurable, default: her 5. frame = 5-6 FPS effective).

**Per-Student Gaze İşleme Ölçekleme Sorunu:**
- 40 öğrencili sınıf × MediaPipe ~40ms/yüz = 1.6s/frame → 5 FPS hedefini aşar
- **Çözüm: Seçici + Round-Robin hibrit**

| Strateji | Açıklama |
|----------|----------|
| **Seçici işleme** | Son 30s'de object detection (telefon, kağıt vs.) olan öğrencilere her frame'de MediaPipe uygula |
| **Round-robin** | Diğer öğrenciler için: her frame'de 8-10 öğrenci işle, 4-5 frame'de tüm sınıfı tara |
| **Risk-bazlı öncelik** | risk_score > 0.5 olan öğrenciler her frame'de, düşük riskliler round-robin'e düşer |

```
Frame N → YOLOv8 (tüm oda) → BoT-SORT (tüm track'ler)
          → MediaPipe: yüksek riskli öğrenciler (her frame)
          → MediaPipe: round-robin grubu (frame N mod 4 == 0 olan batch)
          → Geri kalan: skip (sonraki tur)
```

**Config:** Tüm frame processing parametreleri §18.7.1 AI Servis Konfigürasyon Şeması'nda tanımlanmıştır (`frame_sampling` ve `inference_pipeline` bölümleri). Round-robin algoritmasının detaylı pseudo-code'u §18.7.3'te yer alır.

### 3.4 Kamera Bağlantı Tipleri

Sistem 3 farklı kamera tipini destekler:

#### A) IP Kamera (RTSP Stream)
- Profesyonel güvenlik kameraları (Hikvision, Dahua vb.)
- Doğrudan ağ üzerinden RTSP stream verir
- **Stream URL formatı:** `rtsp://user:pass@192.168.1.100:554/stream1`
- En stabil ve kaliteli seçenek
- Dezavantaj: kurulum maliyeti, her sınıfta olmayabilir

#### B) Telefon Kamera (HTTP/RTSP via App)
- Android: "IP Webcam" veya "DroidCam" uygulaması → telefonu IP kameraya çevirir
- iOS: "DroidCam" veya "EpocCam" uygulaması
- **Stream URL formatı:**
  - IP Webcam (Android): `http://192.168.1.50:8080/video`
  - DroidCam: `http://192.168.1.50:4747/video`
- Telefon ve bilgisayar aynı WiFi ağında olmalı
- **Avantaj:** Herkesin cebinde var, ücretsiz, hızlı kurulum
- **Dezavantaj:** Pil tüketimi (şarjda kullanılmalı), WiFi bağımlı, ısınma
- **Önerilen kullanım:** Tripod veya telefon tutacağı ile sabitlenmiş, şarja bağlı

**⚠️ Dikkat:** Telefon kameralar WiFi'ye bağımlıdır. WiFi kesintisinde tüm phone kameralar kopar. **Birincil kamera olarak kullanılmamalıdır** — sadece yedek veya ek açı olarak önerilir. Birincil kamera ethernet bağlantılı IP kamera olmalıdır.

#### C) USB Webcam (Relay Agent)
- Bilgisayara bağlı USB webcam
- Bilgisayarda çalışan küçük bir relay agent → RTSP/HTTP stream çıktısı verir
- **Relay seçenekleri:**
  - FFmpeg: `ffmpeg -f v4l2 -i /dev/video0 -f mpjpeg http://0.0.0.0:8080/stream`
  - OBS Studio (Virtual Camera + RTSP output plugin)
  - GStreamer pipeline
- **Avantaj:** Ucuz ($10-30 webcam), güvenilir
- **Dezavantaj:** Bilgisayar gerekli, kablo mesafesi sınırlı

#### Kamera Kurulum Akışı (UI)
1. Admin `/rooms/[id]` sayfasında "Kamera Ekle" tıklar
2. Kamera tipini seçer (IP Kamera / Telefon / USB Webcam)
3. Tipi seçince otomatik talimat gösterilir:
   - **IP Kamera:** "RTSP URL'nizi girin (örn: rtsp://...)"
   - **Telefon:** "1. IP Webcam uygulamasını açın 2. Aynı WiFi ağında olduğunuzdan emin olun 3. Gösterilen URL'yi buraya yapıştırın"
   - **USB Webcam:** "1. FFmpeg kurun 2. Şu komutu çalıştırın: ... 3. Oluşan URL'yi buraya yapıştırın"
4. "Bağlantıyı Test Et" butonu → AI servise stream test isteği gönderir
5. Başarılı ise canlı önizleme gösterilir, kamera kaydedilir

#### Kamera Tanımı Güncelleme (DB)
`cameras` tablosuna ek alan:
```sql
ALTER TABLE public.cameras ADD COLUMN camera_type TEXT NOT NULL DEFAULT 'ip_camera'
  CHECK (camera_type IN ('ip_camera', 'phone', 'usb_webcam'));
```

### 3.5 Öğrenci-Track Eşleştirme Stratejisi

**Problem:** BoT-SORT `track_id` (kişi #3, #7...) verir ama bu kişinin hangi öğrenci olduğunu bilmez.

**Phase A Çözümü: Oturma Planı Bazlı + Manuel Override**

```
Sınav Başlangıcı:
1. Admin oturma planını yükler (koltuk → öğrenci eşleştirmesi)
2. Eşleştirme session boyunca sürekli çalışır. İlk 30 saniyede toplu eşleştirme yapılır (tüm mevcut track'ler → en yakın koltuklar). Sonrasında yeni track algılandığında (geç gelen öğrenci) otomatik nearest-seat match denenir
3. Dashboard'da eşleştirme haritası gösterilir
4. Proctor yanlış eşleştirme görürse tıklayarak düzeltir
5. Eşleştirme incident'lara otomatik yansır
```

**İlk 30s dashboard davranışı:** Eşleştirme tamamlanana kadar dashboard'da öğrenci isimleri yerine track numaraları gösterilir (örn: "Track #5"). Üst banner: "Öğrenci eşleştirmesi devam ediyor... (%60)". Eşleştirme tamamlanınca isimler otomatik güncellenir. Bu sürede oluşan incident'lar track_id ile kaydedilir, eşleştirme sonrası student_id'ye dönüştürülür (§7.1).

**Eşleştirme mantığı:**
```
Koltuk Grid (oda planı):
  [S-01] [S-02] [S-03] [S-04]
  [S-05] [S-06] [S-07] [S-08]

Track Pozisyonları (frame'den):
  Track#1 @ (0.15, 0.3) → en yakın koltuk: S-01
  Track#2 @ (0.35, 0.3) → en yakın koltuk: S-02
  Track#5 @ (0.15, 0.7) → en yakın koltuk: S-05
```

**Veritabanı ek alanları:**
```sql
-- Koltuk-öğrenci eşleştirmesi (session bazlı)
CREATE TABLE public.seat_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.students(id),
  seat_number   TEXT NOT NULL,
  position_x    FLOAT,             -- Normalized koltuk pozisyonu (0.0-1.0)
  position_y    FLOAT,
  track_id      INTEGER,           -- AI tarafından atanan track (null ise henüz eşleşmemiş)
  confirmed     BOOLEAN DEFAULT false, -- Proctor onayladı mı?
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_seat_assign_session_seat ON public.seat_assignments (session_id, seat_number);
CREATE INDEX idx_seat_assign_session ON public.seat_assignments (session_id);
```

**Proctor düzeltme UI'ı:** Canlı izleme sayfasında (`/exams/[id]/sessions/[sid]`) her öğrenci bounding box'ına tıklanınca dropdown açılır: öğrenci listesinden doğru isim seçilir. Düzeltme anında `seat_assignments.student_id` güncellenir ve `audit_logs`'a kaydedilir.

**Çakışma çözümü:** İki track aynı koltuğa eşlenirse → Dashboard'da sarı uyarı: 'Koltuk A5: 2 öğrenci eşleşti — proctor düzeltmesi gerekli'. Proctor, her track'i doğru koltuğa manuel atar. Çözülene kadar her iki track için de incident oluşturulmaz (false alarm önleme).

**Track kaybı ve geri dönüş:** Öğrenci koltuktan kalkıp geri oturduğunda BoT-SORT yeni track_id atayabilir. Sistem bunu şöyle çözer: (1) Face embedding varsa (Phase B) → eski track'e bağla, (2) Face yoksa → koltuk pozisyonuna en yakın eski track'i bul (5 saniye tolerans), (3) Eşleşme bulunamazsa → yeni track olarak kaydet, proctor uyarısı.

**⚠️ Leave+Return Politikası (Phase A — CRITICAL):**

Öğrenci sınıftan çıkıp geri döndüğünde (>5 dakika ayrılma):
1. Çıkışta proctor checkout onaylar → AI takibi durur, track_id sona erer
2. Geri dönüşte proctor 'Geç gelen öğrenci ekle' akışını başlatır (§6.20)
3. Sistem yeni track oluşturur → proctor öğrenciyi listeden seçer → yeni eşleştirme
4. Eski ve yeni track aynı öğrenciye bağlanır ama **ayrı track_id'ler** olarak kalır
5. Raporda: 'Öğrenci [isim] sınıftan ayrıldı (14:20-14:35, 15dk) ve geri döndü' notu otomatik eklenir

**Kısa ayrılma (<5 dakika):**
- Checkout yapılmamışsa → empty_seat alert tetiklenir (§7.2)
- Öğrenci aynı koltuğa oturduğunda BoT-SORT genellikle aynı track_id'yi korur (5s tolerans)
- Track kaybolursa → nearest-seat re-match denenir
- Eşleşme başarısız → proctor uyarısı + manuel düzeltme

**Otomasyon yerine güvenlik:** Phase A'da leave+return tamamen proctor kontrolündedir. Otomatik re-identification Phase B'de (face embedding ile) aktif edilir.

**Phase B Çözümü:** Homografi kalibrasyon + yüz tanıma ile tam otomatik eşleştirme (bkz: §3.6).

### 3.6 Kamera Kalibrasyonu & Birleşik Koordinat Sistemi

Her odanın tek bir **normalized koordinat sistemi** (0,0)-(1,1) vardır. Tüm kameralar kendi piksel koordinatlarını bu sisteme dönüştürür.

#### Phase A: Manuel Koltuk İşaretleme

Admin kamera feed'ini görür, her koltuğu tıklar, piksel koordinatı kaydedilir:

```
Kalibrasyon UI (/rooms/[id] → Kamera Kalibrasyonu tab):

┌──────────────────────────────────────────────────────┐
│  Kamera: CAM1-FRONT_WIDE — Koltuk İşaretleme       │
│                                                       │
│  Sol: Kamera Feed (canlı)    Sağ: Oda Planı          │
│  ┌─────────────────────┐    ┌───────────────────┐    │
│  │                     │    │ [A1][A2][A3][A4]  │    │
│  │  ×A1  ×A2  ×A3 ×A4 │    │                   │    │
│  │                     │ ↔  │ [B1][B2][B3][B4]  │    │
│  │  ×B1  ×B2  ×B3 ×B4 │    │                   │    │
│  │                     │    │ [C1][C2][C3][C4]  │    │
│  │  ×C1  ×C2  ×C3 ×C4 │    │                   │    │
│  └─────────────────────┘    └───────────────────┘    │
│                                                       │
│  Mod: ○ Koltuk İşaretle  ● Homografi (4 nokta)       │
│  İşaretlenen: 12/12 koltuk  [✓ Kalibrasyonu Kaydet] │
└──────────────────────────────────────────────────────┘
```

1. Admin kamera görüntüsünde koltuğun merkezine tıklar
2. Sistem tıklanan pikseli ilgili koltukla eşler
3. Sınav sırasında: person bbox merkezi → en yakın koltuk pikseli → öğrenci

**Kalibrasyon UX iyileştirmeleri:**
- **Grid oluşturucu:** Admin 'Otomatik grid' butonuna tıklar → satır×sütun girer (örn: 5×8) → sistem eşit aralıklı koltuk noktaları oluşturur → admin sadece düzeltme yapar (40 tıklama yerine 5-10)
- **Undo/Redo:** Son 20 işlem geri alınabilir (Ctrl+Z / Ctrl+Y)
- **Koltuk etiketi:** Her tıklanan noktaya koltuk numarası atanır (A1, A2, B1...) ve görsel olarak gösterilir
- **Test modu:** Kalibrasyon sonrası 'Test' butonuna tıkla → kamera feed üzerinde koltuk noktaları overlay gösterilir → proctor doğrular

#### Sınıf Geometri Kalibrasyonu

Gaze tespitinin doğru çalışması için koltuk koordinatlarının yanı sıra sınıf geometrisi de tanımlanmalıdır:

**Admin kalibrasyon sırasında şunları işaretler:**
- **Tahta/ekran pozisyonu:** Öğrencinin normalde bakması gereken yön (x,y normalized)
- **Komşu koltuk mesafesi:** Otomatik hesaplanır (koltuk grid'inden)
- **Pencere yönü:** Güneş ışığı yönü (aydınlatma kompanzasyonu için)

**Gaze yön yorumlama:**
```
suspicious_gaze = açı(bakış_yönü, tahta_yönü) > threshold
  VE açı(bakış_yönü, komşu_koltuk_yönü) < 15°

// Tahta yönüne bakış → normal (herhangi bir açıda)
// Komşu koltuğa doğru bakış → şüpheli (sadece sürekli ise)
// Aşağı bakış (sınav kağıdı) → normal
// Yukarı bakış (tavan/düşünme) → normal
```

Bu sayede '30° sapma' mutlak değil, **kontekstüel** olarak değerlendirilir. Tahta 45° solda olan öğrenci için sola bakış normaldir.

#### Mid-Exam Recalibration

Kamera sınav sırasında oynamışsa:
1. Proctor canlı izleme ekranında 'Kalibrasyon' butonuna tıklar
2. O kameranın AI tespiti geçici olarak duraklatılır (pause state)
3. Proctor, yeni kamera pozisyonuna göre koltukları tekrar tıklar (veya grid düzeltir)
4. 'Kaydet & Devam' → kalibrasyon güncellenir, AI tespiti devam eder
5. Duraklatma süresi `audit_logs`'a kaydedilir

**Not:** Recalibration sırasında o kameradan gelen frame'ler işlenmez. Diğer kameralar (varsa) normal çalışmaya devam eder.

**Veritabanı:**
```sql
CREATE TABLE public.camera_calibrations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id     UUID NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  calibration_type TEXT NOT NULL DEFAULT 'manual'
                CHECK (calibration_type IN ('manual', 'homography')),
  -- Manuel: her koltuk için piksel koordinatı
  seat_mappings JSONB DEFAULT '[]',
  -- Örnek: [{"seat_id": "A1", "pixel_x": 120, "pixel_y": 85}, ...]
  -- Homografi: 3x3 dönüşüm matrisi
  homography_matrix FLOAT[],  -- 9 element [h00,h01,h02,h10,h11,h12,h20,h21,h22]
  reference_points  JSONB,    -- Kalibrasyon referans noktaları
  calibrated_at TIMESTAMPTZ DEFAULT NOW(),
  calibrated_by UUID REFERENCES public.user_profiles(id)
);

CREATE UNIQUE INDEX idx_calibration_camera ON public.camera_calibrations (camera_id);
```

#### Phase B: Homografi Kalibrasyon

> **⚠️ Phase B Özelliği.** Phase A'da sadece manuel piksel-koltuk eşleştirmesi kullanılır. Homography kalibrasyonu Phase B'de aktif edilir.

Admin kamera görüntüsünde ve oda planında aynı 4+ noktayı işaretler. Sistem OpenCV `findHomography()` ile 3×3 dönüşüm matrisi hesaplar:

```
pixel_coord = [px, py, 1]
room_coord = H × pixel_coord
→ (room_x, room_y) normalized 0.0-1.0
```

**Avantajlar:**
- Multi-kamera füzyon: tüm kameralar aynı oda koordinat sistemine dönüşür
- Kamera açısı değişiminde sadece 4 nokta güncellenir
- Perspektif bozulmasını düzeltir (arka sıralar kamerada küçük görünür ama doğru koordinata dönüşür)

#### Yüz-Sıra-Öğrenci Kilit Mekanizması (3 Katmanlı Eşleştirme)

Sınav sırasında her tespit edilen kişi için 3 katmanlı eşleştirme çalışır:

```
Person detected → pixel (280, 95) → kalibrasyon → oda coord (0.34, 0.16)

Katman 1: FACE RECOGNITION (en güvenilir, varsa)
  → Yüz embedding'i enrollment DB ile karşılaştır
  → Eşleşme: %92 güven → Ahmet ✓

Katman 2: POZİSYON BAZLI (her zaman çalışır)
  → Oda koordinatı (0.34, 0.16) → en yakın koltuk: A3 at (0.35, 0.15)
  → seat_assignment: A3 = Ahmet ✓

Katman 3: TRACK GEÇMİŞİ (zaman bazlı)
  → track_id #7 son 5 dakikada hep A3 civarında
  → Tutarlılık: ✓

KİLİT: track_id #7 = Ahmet (A3) — 3 katman onaylı
Güven: (face_score × 0.5) + (position_score × 0.3) + (track_consistency × 0.2)
```

**Face enrollment yoksa** (KVKK reddi veya Phase A):
- Sadece Katman 2 + 3 çalışır
- Pozisyon bazlı eşleme + track tutarlılığı yeterli (tek kamerada %90+ doğruluk)

### 3.7 Kamera Kayma Algılama & Otomatik Re-kalibrasyon

> **⚠️ Phase B Özelliği.** Phase A'da kamera sabit montajlanır ve drift algılama yapılmaz. Kamera oynaması şüphesi durumunda proctor manuel olarak kalibrasyonu yeniden başlatır (§3.6). Otomatik drift detection Phase B'de eklenecektir.

#### Problem
Sınav ortasında kamera kayabilir (gözetmen çarpar, telefon kayar, tripod gevşer). Kalibrasyon geçersiz olur, tüm koltuk eşleştirmeleri çöker.

#### Çözüm: Referans Frame + Anchor Noktaları

```
İlk kalibrasyon sırasında (§3.6):
1. Referans frame kaydedilir (JPEG snapshot)
2. Odadaki sabit noktalar otomatik tespit edilir (OpenCV feature detection):
   - Duvar köşeleri, kapı çerçevesi, tahta kenarları, pencere
   - Bu noktalar "anchor" olarak saklanır (ORB/SIFT features)
3. Anchor'ların piksel pozisyonları referans olarak tutulur
```

#### Sürekli İzleme (her 5 saniyede)

```
Runtime loop:
1. Mevcut frame'de aynı anchor'ları ara (feature matching)
2. Anchor kaymasını hesapla (ortalama piksel deplasmanı)
3. Duruma göre aksiyon:

   KAYMA < 5px (STABLE):
   └── Normal, hiçbir şey yapma

   KAYMA 5-30px (DRIFT):
   ├── Uyarı: kamera hafif kaydı
   ├── Otomatik düzeltme dene:
   │   → Anchor pozisyon farkından yeni homografi/offset hesapla
   │   → Mevcut kalibrasyonu güncelle (soft update)
   │   → Proctor'a sarı uyarı göster: "Kamera hafif kaydı — otomatik düzeltildi"
   └── Monitoring devam eder

   KAYMA > 30px (SHIFT):
   ├── Alarm: kamera ciddi kaydı
   ├── Bu kameranın tespitlerini DURAKLAT (yanlış eşleştirme riski)
   ├── Proctor'a kırmızı modal göster:
   │   ┌────────────────────────────────────┐
   │   │  ⚠️ Kamera Kaydı Algılandı        │
   │   │                                    │
   │   │  CAM1 (FRONT_WIDE) konumunu        │
   │   │  kaybetti. Tespitler duraklatıldı. │
   │   │                                    │
   │   │  [Hızlı Re-kalibrasyon]            │
   │   │  [Kamerayı Devre Dışı Bırak]      │
   │   └────────────────────────────────────┘
   ├── Diğer kameralar monitoring'e devam eder
   └── Bu kameranın kapsadığı koltuklarda coverage gap uyarısı
```

#### Hızlı Re-kalibrasyon (30 saniye)

Proctor "Hızlı Re-kalibrasyon" tıkladığında:

```
┌──────────────────────────────────────────────────┐
│  Hızlı Re-kalibrasyon — CAM1                    │
│                                                   │
│  Sol: Mevcut Görüntü     Sağ: Oda Planı          │
│  ┌───────────────────┐  ┌───────────────────┐    │
│  │                   │  │                   │    │
│  │   [Canlı feed     │  │   [A1][A2][A3]    │    │
│  │    gösteriliyor]   │  │   [B1][B2][B3]    │    │
│  │                   │  │   [C1][C2][C3]    │    │
│  └───────────────────┘  └───────────────────┘    │
│                                                   │
│  📌 Kamera görüntüsünde 4 köşe noktası işaretle  │
│  İşaretlenen: 2/4                                │
│                                                   │
│  ████████░░░░░░░░ Kalibrasyon hesaplanıyor...     │
│                                                   │
│  [İptal]                    [Kalibrasyonu Uygula] │
└──────────────────────────────────────────────────┘
```

- Phase A: 4 koltuk noktası tıkla → yeni piksel mapping
- Phase B: 4 referans noktası tıkla → yeni homografi matrisi hesapla
- ~30 saniyede tamamlanır, monitoring hemen devam eder

#### Veritabanı

```sql
-- camera_calibrations tablosuna ek alanlar:
ALTER TABLE public.camera_calibrations
  ADD COLUMN reference_frame_path TEXT,         -- Referans JPEG snapshot (Supabase Storage)
  ADD COLUMN anchor_features      JSONB,        -- ORB/SIFT feature descriptors
  ADD COLUMN drift_threshold      FLOAT DEFAULT 30.0,  -- Piksel, bu üzerinde SHIFT
  ADD COLUMN last_drift_check     TIMESTAMPTZ,
  ADD COLUMN drift_status         TEXT DEFAULT 'stable'
             CHECK (drift_status IN ('stable', 'drifting', 'shifted', 'recalibrating'));
```

### 3.8 Çoklu Kamera Koordinasyonu & Kapsama Alanı

#### Oda Kurulumunda Kamera Pozisyonu Planlama

Admin sınıf ortamını kurarken, kuşbakışı oda planı üzerinde kamera pozisyonlarını belirler:

```
Oda Planı (kuşbakışı) — Kamera Yerleşim Editörü:

┌──────────────────────────────────────────────────┐
│  Lab A — Kamera Yerleşimi                        │
│                                                   │
│          [TAHTA]                                  │
│  📷1                                      📷2    │
│  (FRONT_WIDE)                      (FRONT_CLOSE) │
│   ↘ ╲───────────────────────╱ ↙                  │
│       [A1] [A2] [A3] [A4]                        │
│       [B1] [B2] [B3] [B4]                        │
│       [C1] [C2] [C3] [C4]                        │
│       [D1] [D2] [D3] [D4]                        │
│   ↗ ╱───────────────────────╲ ↘                  │
│  📷3                                      📷4    │
│  (SIDE_LEFT)                       (SIDE_RIGHT)  │
│                                                   │
│  Her kameranın kapsama alanı (FOV) gösterilir    │
│  Üst üste binen alanlar: daha yüksek güvenilirlik│
│  Kapsanmayan alan: kırmızı vurgu (uyarı)        │
└──────────────────────────────────────────────────┘
```

**Kapsama alanı hesaplama:**
- Her kameranın FOV açısı (varsayılan: 90° wide, 60° close) ve oda plandaki pozisyonu biliniyor
- Sistem otomatik olarak hangi kameranın hangi koltukları gördüğünü hesaplar
- Üst üste binen alanlar: multi-kamera füzyon bölgesi (daha güvenilir tespit)
- Kapsanmayan alanlar: kırmızı ile vurgulanır → admin uyarılır

**Veritabanı:**
```sql
-- cameras tablosuna ek alanlar:
ALTER TABLE public.cameras
  ADD COLUMN fov_angle    FLOAT DEFAULT 90.0,     -- Kamera görüş açısı (derece)
  ADD COLUMN direction    FLOAT DEFAULT 0.0,       -- Kameranın baktığı yön (0=kuzey, 90=doğu, derece)
  ADD COLUMN coverage_seats TEXT[] DEFAULT '{}';   -- Bu kameranın kapsadığı koltuklar ["A1","A2","B1",...]
```

#### Koltuk Sahipliği (Primary Camera)

Her koltuk bir "birincil kamera"ya atanır — o koltuktaki kişinin ana tespiti bu kameradan yapılır:

```
Atama kuralları:
1. Koltuğu gören kameralardan en yakın (en büyük piksel alanı kaplayan) birincil olur
2. Diğer kameralar "yedek" (secondary) — onay/füzyon için kullanılır
3. Birincil kamera kaydığında veya çöktüğünde → secondary otomatik devralır

Örnek:
  Koltuk A1 → Primary: CAM1 (FRONT_WIDE), Secondary: CAM3 (SIDE_LEFT)
  Koltuk A4 → Primary: CAM2 (FRONT_CLOSE), Secondary: CAM4 (SIDE_RIGHT)
  Koltuk D1 → Primary: CAM3 (SIDE_LEFT), Secondary: CAM1 (FRONT_WIDE)
```

**Failover senaryosu:**
```
CAM1 kaydı → CAM1 duraklatıldı
  → A1, A2, A3, B1, B2 koltukları CAM1'e bağlıydı
  → Sistem otomatik secondary kameraları devreye alır:
    A1 → CAM3 (secondary) devralır
    A2 → CAM3 devralır
    A3 → CAM4 devralır (en yakın secondary)
  → Proctor bilgilendirilir: "CAM1 devre dışı, 5 koltuk yedek kameraya geçti"
  → Coverage kalitesi düşebilir (uyarı gösterilir)
```

#### Multi-Kamera Yapılandırma Tablosu

```sql
CREATE TABLE public.seat_camera_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES public.exam_rooms(id) ON DELETE CASCADE,
  seat_id       TEXT NOT NULL,              -- "A1", "B3" vb.
  primary_camera_id   UUID NOT NULL REFERENCES public.cameras(id),
  secondary_camera_ids UUID[] DEFAULT '{}', -- Yedek kameralar (öncelik sırasıyla)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_seat_camera_room_seat ON public.seat_camera_assignments (room_id, seat_id);
```

### 3.9 Context-Aware Detection (Bağlam Farkındalığı)

Sınav ortamında pek çok hareket meşrudur. Sistem bunları kopya şüphesinden ayırmalıdır.

#### Rol Tanıma: Öğrenci mi, Gözetmen mi?

Gözetmenler sınıfta dolaşır, öğrencilerin yanına gelir, eğilir. Bunlar alarm tetiklememelidir.

**Gözetmen tanıma stratejisi:**

| Yöntem | Phase | Nasıl |
|--------|-------|-------|
| **Koltuk-dışı pozisyon** | A | Oturma planındaki hiçbir koltuğa eşleşmeyen track → muhtemelen gözetmen |
| **Hareket paterni** | A | Sürekli hareket eden track (sıralar arası dolaşma) → gözetmen |
| **Enrollment** | A | Sınav başında gözetmenler kameraya tanıtılır (track_id kilitlenir) |
| **Yüz tanıma** | B | Gözetmen user_profiles'tan face matching → otomatik tanıma |

**Gözetmen enrollment akışı (sınav başında):**
```
1. Sınav başlatılır → AI servisi aktif
2. Gözetmen kamera önünde durur
3. Proctor dashboard'dan "Ben gözetmenim" tıklar
4. Sistem mevcut frame'deki koltuk-dışı track'i gözetmen olarak işaretler
5. Bu track_id → "PROCTOR" rolü atanır → tüm alert'lerden muaf
```

**Veritabanı:**
```sql
-- track_roles: sınav sırasında track'lerin rol ataması
CREATE TABLE public.track_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  track_id    INTEGER NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('student', 'proctor', 'visitor', 'unknown')),
  assigned_by TEXT NOT NULL CHECK (assigned_by IN ('auto', 'manual')),  -- Otomatik veya gözetmen ataması
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

#### Meşru Hareket Kataloğu (Süpresyon Kuralları)

Bu hareketler tespit edilse bile alarm **üretmez**:

| Durum | Algılama | Neden Meşru | Süpresyon |
|-------|----------|-------------|-----------|
| **Öğrenci ayağa kalktı** | empty_seat + person near exit | Çıkış talebi veya wc | Çıkış onayı varsa süpres; yoksa 30s bekle, dönmezse alert |
| **Gözetmen yanına geldi** | Proctor track öğrenci track'ine yaklaştı | Soru sorma, evrak kontrolü | Gözetmen yakınlığında (< 2m) iken öğrencinin tüm alert'leri 60s askıya alınır |
| **Öğrenci eğildi** | Face lost / gaze down | Kalem düşürdü, çanta | 5s'den kısa face_lost → süpres; > 5s → low alert |
| **Öğrenci saatine baktı** | Gaze diversion (kısa, kol yönü) | Saat kontrolü | < 2s gaze diversion → süpres |
| **Öğrenci gerindi/uzandı** | Head turn + body movement | Fiziksel rahatlama | Tek seferlik, < 3s → süpres |
| **Gözetmen sınıfta dolaşıyor** | Moving track, no seat match | Gözetim | PROCTOR rolü → tamamen muaf |
| **Kapıdan biri girdi** | New track, near door | Geç gelen veya ziyaretçi | 30s boyunca yeni track'ler → otomatik unknown, alarm yok |
| **Sınav kağıdı dağıtılıyor** | Çoklu hareket, gözetmen aktif | Sınav başlangıcı | Sınav başlangıç fazı (ilk 5dk) → tüm alert'ler LOW'a düşürülür |
| **Sınav kağıdı toplanıyor** | Çoklu hareket, gözetmen aktif | Sınav sonu | Son 5dk → tüm alert'ler LOW'a düşürülür |

#### Bağlamsal Zaman Dilimleri

Sınav süresinin farklı dilimlerinde farklı hassasiyet:

```
Sınav Süresi: 120 dakika

  0-5 dk:   BAŞLANGIÇ FAZI
             → Kağıt dağıtımı, öğrenciler yerleşiyor
             → Hassasiyet: ÇOK DÜŞÜK (sadece telefon = high)
             → Diğer tüm tespitler → log only, alert yok

  5-30 dk:  ERKEN DÖNEM
             → Öğrenciler soruları okuyor, çok hareket normal
             → Hassasiyet: DÜŞÜK
             → Gaze threshold: 5 sapma/5dk (normalde 3)

  30-90 dk: ANA DÖNEM
             → Tam hassasiyet (Normal preset)
             → Tüm kurallar aktif

  90-115 dk: GEÇ DÖNEM
             → Öğrenciler bitirmeye başlıyor, huzursuzluk artabilir
             → Hassasiyet: NORMAL ama süpresyon eşikleri biraz gevşek
             → Ayağa kalkma = muhtemelen çıkış

  115-120 dk: BİTİŞ FAZI
             → Kağıt toplama, herkes hareket halinde
             → Hassasiyet: ÇOK DÜŞÜK
             → Sadece kritik tespitler (telefon + communication)
```

**Konfigürasyon (exams.settings JSONB'ye ek):**
```json
{
  "context_rules": {
    "startup_phase_minutes": 5,
    "ending_phase_minutes": 5,
    "proctor_proximity_radius": 0.08,
    "proctor_suppression_seconds": 60,
    "brief_gaze_threshold_seconds": 2,
    "face_lost_grace_seconds": 5,
    "new_track_grace_seconds": 30,
    "standing_grace_seconds": 30
  }
}
```

#### Gözetmen Yakınlık Süpresyonu (Detay)

```
Gözetmen track pozisyonu: (0.45, 0.60)
Öğrenci A3 pozisyonu:     (0.35, 0.55)
Mesafe: sqrt((0.1)² + (0.05)²) = 0.112

proctor_proximity_radius = 0.08

Mesafe 0.112 > 0.08 → süpresyon YOK, normal izleme

---

Gözetmen A3'ün yanına gelir:
Gözetmen: (0.37, 0.56)
Mesafe: sqrt((0.02)² + (0.01)²) = 0.022

Mesafe 0.022 < 0.08 → SÜPRESYON AKTİF
→ A3 için sonraki 60s boyunca:
  - gaze_diversion → süpres (gözetmenle konuşuyor olabilir)
  - head_turn → süpres (gözetmene bakıyor)
  - phone_detected → SÜPRES DEĞİL (telefon her zaman alert)
  - paper_detected → süpres (gözetmen kağıt gösteriyor olabilir)
```

**Asla süpreslenmeyen tespitler:**
| Tespit | Neden |
|--------|-------|
| `phone_detected` | Telefon hiçbir bağlamda meşru değil |
| `earbuds_detected` | Kulaklık hiçbir bağlamda meşru değil |
| `unauthorized_communication` (uzun süreli) | 30s+ karşılıklı iletişim meşru değil |

#### Confidence Decay (Güven Erozyon Modeli)

Tek seferlik bir olay düşük güven skoru alır, tekrarlanan olaylar artan skor alır:

```
Olay 1: gaze_diversion → base_score × 0.3 = 0.09 (çok düşük, muhtemelen doğal)
Olay 2: gaze_diversion (2dk sonra) → base_score × 0.5 = 0.15
Olay 3: gaze_diversion (1dk sonra) → base_score × 0.8 = 0.24
Olay 4: gaze_diversion (30s sonra) → base_score × 1.0 = 0.30 → ALERT

Formül: event_score = base_score × min(1.0, event_count × frequency_factor)
frequency_factor = 1 / (time_since_last_event_seconds / 60)
```

Bu sayede:
- Tek bir bakış sapması → neredeyse sıfır skor (herkes bakar)
- 5 dakikada 4 kez aynı yöne bakış → yüksek skor (pattern)
- 30 dakikada 4 kez bakış → düşük skor (uzun aralık, doğal)

#### Alert Karar Ağacı (Decision Tree)

```
Tespit geldi
    ↓
Bu track PROCTOR mu? ──YES──→ LOG ONLY, alert üretme
    ↓ NO
Bu track UNKNOWN mu? ──YES──→ new_track_grace aktif mi? ──YES──→ SÜPRES
    ↓ NO                                                    ↓ NO
                                                         LOW alert
Sınav hangi fazda?
    ↓
BAŞLANGIÇ/BİTİŞ ──→ Sadece phone/earbuds = alert, diğerleri LOG ONLY
    ↓
ANA DÖNEM
    ↓
Gözetmen yakınında mı? ──YES──→ phone/earbuds hariç SÜPRES (60s)
    ↓ NO
Tespit tipi ne?
    ├── phone_detected ──→ ALWAYS HIGH (süpreslenemez)
    ├── earbuds_detected ──→ ALWAYS HIGH (süpreslenemez)
    ├── gaze_diversion ──→ Confidence Decay hesapla → score'a göre
    ├── head_turn ──→ < 3s tek sefer? SÜPRES : score hesapla
    ├── empty_seat ──→ Checkout var mı? YES→SÜPRES : 30s bekle
    └── face_lost ──→ < 5s? SÜPRES : LOW alert
```

---

## 4. Teknoloji Kararları

### 4.1 Object Detection: YOLOv8n

| Karar | Gerekçe |
|-------|---------|
| **YOLOv8n (nano)** seçildi | 61 FPS CPU, en geniş proctoring araştırma ekosistemi |
| YOLO26 değerlendirilecek (Phase B) | %31 daha hızlı CPU inference ama proctoring için henüz az araştırma |
| **Lisans: AGPL-3.0** | AI servisini izole container'da açık kaynak tutmak veya Enterprise License almak gerekir |

**Tespitler:**
- `phone` (cell phone): COCO pre-trained weights'te mevcut
- `earbuds`, `paper/notes`: Custom training gerekir (annotated dataset)
- DeepSparse runtime ile 525 FPS'e kadar çıkılabilir (Phase B optimizasyonu)

### 4.2 Multi-Object Tracking: BoT-SORT

| Karar | Gerekçe |
|-------|---------|
| **BoT-SORT** seçildi (ByteTrack yerine) | Occlusion sonrası re-identification, +3 IDF1 doğruluk |
| Ultralytics built-in | `model.track(tracker="botsort.yaml")` — ayrı kurulum gereksiz |
| ByteTrack fallback | Performans sıkıntısı olursa |

### 4.3 Face/Gaze: MediaPipe 0.10.x

| Karar | Gerekçe |
|-------|---------|
| **MediaPipe Face Mesh** | 468 landmark, iris gaze, %92.4 doğruluk, <100ms latency |
| CPU-only | GPU gerektirmez |
| Google AI Edge tarafından aktif maintain | Düzenli PyPI release'ler |

### 4.4 Real-time İletişim: FastAPI + WebSocket

| Karar | Gerekçe |
|-------|---------|
| **WebSocket** (SSE yerine) | Bi-directional gerekli: alert + kamera kontrol + threshold ayar |
| Reconnection stratejisi | Exponential backoff + message buffer + last_event_id replay |
| Heartbeat | 30s ping-pong |

### 4.5 Video Storage: Supabase Storage

| Karar | Gerekçe |
|-------|---------|
| **Supabase Storage** (Phase A) | Pro plan'da 100GB dahil, mevcut RLS + signed URL altyapısı |
| S3'e geçiş kriteri | 100GB aşılırsa veya CloudFront CDN gerekirse |
| Evidence format | 5-30 saniyelik JPEG frame snapshot veya kısa MP4 clip |

### 4.6 Deployment

| Faz | Platform | Maliyet |
|-----|----------|---------|
| Phase A | **ECS Fargate CPU-only** (4 vCPU, 8GB) | ~$146/ay |
| Phase B+ | **ECS Managed Instances g4dn.xlarge** (NVIDIA T4) | ~$384/ay |
| Phase B+ (spot) | g4dn.xlarge spot | ~$115/ay (%70 indirim, kesinti riski) |

---

## 5. Öğrenci Yönetimi

### 5.1 Toplu Öğrenci Yükleme

Desteklenen formatlar:
- **CSV:** `student_id, full_name, email` (header zorunlu)
- **Excel (.xlsx):** Aynı sütun yapısı, ilk sheet okunur

> **Not:** PDF import (OCR tabanli) Phase B'de eklenecektir. Phase A'da sadece CSV ve Excel desteklenir.

```
POST /api/students/import
Content-Type: multipart/form-data
Body: file (CSV/XLSX)
Response: { imported: number, updated: number, skipped: number, errors: string[] }
```

**Deduplication kuralı:** Aynı `student_id` zaten varsa: mevcut kayıt güncellenir (upsert), yeni kayıt oluşturulmaz. Güncellenen satırlar `updated` sayacına eklenir.

### 5.2 Tekil Öğrenci Ekleme/Düzenleme

```
POST /api/students          → Yeni öğrenci ekle
PUT  /api/students/[id]     → Öğrenci bilgilerini güncelle
DELETE /api/students/[id]   → Öğrenciyi sil (soft delete)
GET  /api/students          → Öğrenci listesi (?room_id filter)
```

### 5.3 Sınıflar Arası Transfer

```
POST /api/students/transfer
Body: { student_ids: string[], from_session_id: string, to_session_id: string }
Response: { transferred: number }
```

- Toplu transfer desteklenir (çoklu öğrenci seçimi)
- Transfer geçmişi `audit_logs`'a yazılır
- Transfer sadece `scheduled` veya `active` durumundaki oturumlar arasında yapılabilir. Aktif sınav sırasında transfer → onay modal'ı gösterilir ve AI takibi yeniden başlatılır.
- **Kısıtlama:** Aynı anda iki aktif oturumda bulunan öğrenci olamaz.

**Transfer sonrası incident geçmişi:**
- Eski oturumdaki incident'lar arşivlenir (silinmez, `session_id` eski kalır)
- Yeni oturumda öğrenci sıfır incident ile başlar
- Raporda her iki oturumun incident'ları ayrı gösterilir
- Track_id sıfırlanır (yeni oturumda yeni eşleştirme yapılır)
- Transfer kaydı: `audit_logs`'a `student.transfer` event'i + eski/yeni session_id metadata

### 5.4 Veritabanı

```sql
-- Öğrenci havuzu (oda/sınav bağımsız — genel kayıt)
CREATE TABLE public.students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    TEXT NOT NULL UNIQUE,     -- Okul numarası
  full_name     TEXT NOT NULL,
  email         TEXT,
  department    TEXT,                      -- Bölüm (opsiyonel)
  metadata      JSONB DEFAULT '{}',
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_students_student_id ON public.students (student_id);
CREATE INDEX idx_students_department ON public.students (department) WHERE deleted_at IS NULL;
```

**Not:** Öğrenciler artık doğrudan odaya bağlı değil — sınav oturumuna atanır (bkz: §6.5).

---

## 6. Sınav Yönetimi (Exam → Session → Room → Student)

### 6.1 Veri Modeli Hiyerarşisi

```
Exam (sınav)                         "CMPE 492 Final"
  ├── course_code: "CMPE 492"
  ├── scheduled_date: 2026-06-15
  ├── scheduled_start: 14:00
  ├── scheduled_end: 16:00
  ├── duration_minutes: 120
  ├── created_by: admin
  │
  └── Sessions[] (oda başına bir oturum)
      ├── Session 1 → Room "Lab A"
      │   ├── Proctors: [Supervisor Ayşe, Supervisor Mehmet]
      │   ├── Students: [S-001, S-002, ..., S-040]
      │   ├── Seat Assignments: [S-001→Koltuk A1, ...]
      │   └── Cameras: [CAM1-FRONT_WIDE, CAM2-SIDE_LEFT]
      │
      ├── Session 2 → Room "Lab B"
      │   ├── Proctors: [Supervisor Zeynep]
      │   ├── Students: [S-041, S-042, ..., S-080]
      │   └── Cameras: [CAM3-FRONT_WIDE]
      │
      └── Session 3 → Room "Salon 101"
          ├── Proctors: [Supervisor Ahmet, Supervisor Fatma]
          ├── Students: [S-081, ..., S-120]
          └── Cameras: [CAM4, CAM5]
```

### 6.2 Sınavlar (exams)

```sql
CREATE TABLE public.exams (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,               -- "CMPE 492 Final Sınavı"
  course_code       TEXT,                        -- "CMPE 492" (opsiyonel)
  description       TEXT,
  scheduled_date    DATE NOT NULL,               -- Sınav tarihi
  scheduled_start   TIME NOT NULL,               -- Planlanan başlangıç saati
  scheduled_end     TIME NOT NULL,               -- Planlanan bitiş saati
  duration_minutes  INTEGER NOT NULL DEFAULT 120,
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')),
  settings          JSONB DEFAULT '{}',          -- Genel detection ayarları (sessions'a miras)
  created_by        UUID REFERENCES public.user_profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_exams_date ON public.exams (scheduled_date);
CREATE INDEX idx_exams_status ON public.exams (status);
```

### 6.3 Sınav Odaları

```sql
CREATE TABLE public.exam_rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,              -- "Lab A", "Salon 101"
  capacity    INTEGER,
  location    TEXT,                        -- Bina/kat bilgisi
  layout      JSONB DEFAULT '{}',         -- Oturma planı grid tanımı: { rows: 5, cols: 8, seats: [...] }
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.4 Kameralar

```sql
CREATE TABLE public.cameras (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id       UUID NOT NULL REFERENCES public.exam_rooms(id),
  label         TEXT NOT NULL,             -- 'FRONT_WIDE', 'SIDE_LEFT' vb.
  stream_url    TEXT NOT NULL,             -- RTSP URL, HTTP URL (telefon), veya relay URL
  camera_type   TEXT NOT NULL DEFAULT 'ip_camera'
                CHECK (camera_type IN ('ip_camera', 'phone', 'usb_webcam')),
  role          TEXT NOT NULL CHECK (role IN ('front_wide', 'front_close', 'rear_wide', 'side_left', 'side_right')),
  position_x    FLOAT,
  position_y    FLOAT,
  quality_score FLOAT DEFAULT 1.0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cameras_room ON public.cameras (room_id);
```

**Koordinat sistemi:** `position_x` ve `position_y` normalized oda koordinatlarıdır (0.0, 0.0) = oda sol üst köşe, (1.0, 1.0) = oda sağ alt köşe. Aynı koordinat sistemi `seat_assignments` tablosundaki koltuk pozisyonları için de kullanılır.

**RTSP Authentication:**
- `stream_url` formatı: `rtsp://username:password@ip:port/path`
- Credentials URL'de inline tutulur (endüstri standardı)
- DB'de `stream_url` şifrelenmiş saklanır: AES-256-GCM (PRD-014'teki SMTP şifreleme ile aynı `SMTP_ENCRYPTION_KEY` kullanılır)
- API response'da `stream_url` **asla** döndürülmez (admin UI'da sadece `rtsp://***@ip:port` gösterilir)
- USB webcam ve telefon kameralarda auth gerekmez (local stream)

**Kamera Pozisyon Rolleri:**

| Rol | Pozisyon | Birincil Tespit |
|-----|----------|----------------|
| `front_wide` | Oda önü, geniş açı | Genel bakış, koltuk doluluk |
| `front_close` | Ön, dar açı | Yüz/bakış tespiti |
| `rear_wide` | Oda arkası | Arka sıralar, çıkış izleme |
| `side_left` | Sol duvar | Sol taraf, yetkisiz materyal |
| `side_right` | Sağ duvar | Sağ taraf, cihaz kullanımı |

Minimum: 1 `front_wide`. Tam kurulum: 2-5 kamera/oda.

### 6.5 Sınav Oturumları (exam_sessions — oda başına bir)

```sql
CREATE TABLE public.exam_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id     UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  room_id     UUID NOT NULL REFERENCES public.exam_rooms(id),
  started_at  TIMESTAMPTZ,                 -- Gerçek başlama zamanı (admin "Başlat" tıklar)
  ended_at    TIMESTAMPTZ,                 -- Gerçek bitiş zamanı
  status      TEXT NOT NULL DEFAULT 'scheduled'
              CHECK (status IN ('scheduled', 'active', 'paused', 'ended')),
  settings    JSONB DEFAULT '{}',          -- Oturum bazlı override (FPS, thresholds)
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_exam ON public.exam_sessions (exam_id);
CREATE INDEX idx_sessions_room ON public.exam_sessions (room_id);
CREATE INDEX idx_sessions_status ON public.exam_sessions (status);
```

### 6.6 Gözetmen Ataması (session_proctors — çoktan çoğa)

```sql
CREATE TABLE public.session_proctors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.user_profiles(id),
  role        TEXT NOT NULL DEFAULT 'proctor'
              CHECK (role IN ('proctor', 'chief_proctor')),  -- Baş gözetmen / gözetmen
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_session_proctors_unique ON public.session_proctors (session_id, user_id);
```

**Gözetmen Yetki Matrisi:**

| Aksiyon | proctor | chief_proctor |
|---------|---------|---------------|
| Canlı izleme görüntüleme | ✅ | ✅ |
| Incident acknowledge/dismiss | ✅ | ✅ |
| Incident escalate | ❌ | ✅ |
| Öğrenci çıkışını onaylama | ✅ | ✅ |
| Oturum ayarlarını değiştirme | ❌ | ✅ |
| Accommodation ekleme (mid-exam) | ❌ | ✅ |
| Oturumu duraklatma/sonlandırma | ❌ | ✅ |
| Öğrenci transferi | ❌ | ✅ |

### 6.7 Öğrenci-Oturum Ataması (session_students)

```sql
CREATE TABLE public.session_students (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id  UUID NOT NULL REFERENCES public.students(id),
  seat_number TEXT,                         -- Oturma yeri (opsiyonel, oturma planı varsa)
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_session_students_unique ON public.session_students (session_id, student_id);
CREATE INDEX idx_session_students_session ON public.session_students (session_id);
```

### 6.8 Sınav Oluşturma Wizard'ı (Özet)

> **Detaylı wizard akışı §6.15'tedir (5 adımlı).** Bu bölüm kısa özetdir.

**Route:** `/exams/new`

**Adım 1 — Sınav Bilgileri + Kurallar:**
```
┌─────────────────────────────────────────┐
│  Yeni Sınav Oluştur           Adım 1/5 │
│                                         │
│  Sınav Adı:    [CMPE 492 Final Sınavı ] │
│  Ders Kodu:    [CMPE 492              ] │
│  Açıklama:     [Senior Project Final  ] │
│  Tarih:        [📅 15 Haziran 2026    ] │
│  Başlangıç:    [⏰ 14:00             ] │
│  Bitiş:        [⏰ 16:00             ] │
│  Süre:         [120 dakika            ] │
│                                         │
│                     [İleri →]           │
└─────────────────────────────────────────┘
```

**Adım 2 — Sınıf ve Oturum Ataması:**
```
┌─────────────────────────────────────────────────┐
│  Sınıf Ataması                       Adım 2/5  │
│                                                 │
│  [+ Oturum Ekle]                                │
│                                                 │
│  Oturum 1:                                      │
│  ├── Sınıf: [Lab A ▼] (kapasite: 40)           │
│  ├── Gözetmenler: [Ayşe Kaya ×] [Mehmet D. ×]  │
│  │   [+ Gözetmen Ekle]                          │
│  └── Kameralar: CAM1-FRONT ✅, CAM2-SIDE ✅     │
│                                                 │
│  Oturum 2:                                      │
│  ├── Sınıf: [Lab B ▼] (kapasite: 35)           │
│  ├── Gözetmenler: [Zeynep Y. ×]                │
│  │   [+ Gözetmen Ekle]                          │
│  └── Kameralar: CAM3-FRONT ✅                   │
│                                                 │
│              [← Geri]  [İleri →]                │
└─────────────────────────────────────────────────┘
```

**Not:** Wizard'da 'oda seçimi' aslında 'oturum seçimi'dir. Her oturum bir odaya bağlıdır. Öğrenci odaya değil, oturuma atanır (`session_students` tablosu).

**Adım 3 — Öğrenci Listesi:**
```
┌─────────────────────────────────────────────────┐
│  Öğrenci Ataması                     Adım 3/5  │
│                                                 │
│  [📁 CSV/Excel Yükle] [+ Tekil Ekle]           │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ Oturum 1 — Lab A (12/40 öğrenci)        │   │
│  │ ┌────────┬────────────┬──────────┐       │   │
│  │ │ No     │ Ad Soyad   │ Koltuk   │       │   │
│  │ ├────────┼────────────┼──────────┤       │   │
│  │ │ S-001  │ Ali Veli   │ A1       │       │   │
│  │ │ S-002  │ Ayşe Yılm. │ A2       │       │   │
│  │ │ ...    │ ...        │ [otomatik]│      │   │
│  │ └────────┴────────────┴──────────┘       │   │
│  │ [Toplu Ata: Otomatik Koltuk Sırala]      │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ Oturum 2 — Lab B (0/35 öğrenci)         │   │
│  │ [📁 CSV/Excel Yükle] veya               │   │
│  │ [Mevcut Öğrencilerden Seç]              │   │
│  └──────────────────────────────────────────┘   │
│                                                 │
│  ⚠️ 3 öğrenci henüz atanmamış                  │
│                                                 │
│              [← Geri]  [İleri →]                │
└─────────────────────────────────────────────────┘
```

**Adım 4 — Özet ve Onay:**
```
┌─────────────────────────────────────────────────┐
│  Sınav Özeti                         Adım 5/5  │
│                                                 │
│  CMPE 492 Final Sınavı                         │
│  📅 15 Haziran 2026, 14:00–16:00 (120 dk)      │
│                                                 │
│  ┌─────────────┬─────────┬───────┬──────────┐  │
│  │ Oturum      │ Öğrenci │ Göz.  │ Kamera   │  │
│  ├─────────────┼─────────┼───────┼──────────┤  │
│  │ Lab A       │ 40      │ 2     │ 2        │  │
│  │ Lab B       │ 35      │ 1     │ 1        │  │
│  │ Salon 101   │ 45      │ 2     │ 3        │  │
│  ├─────────────┼─────────┼───────┼──────────┤  │
│  │ TOPLAM      │ 120     │ 5     │ 6        │  │
│  └─────────────┴─────────┴───────┴──────────┘  │
│                                                 │
│  Detection Ayarları: Normal (varsayılan)        │
│  [⚙️ Detection Ayarlarını Düzenle]              │
│                                                 │
│        [← Geri]  [Taslak Kaydet]  [Planla ✓]   │
└─────────────────────────────────────────────────┘
```

### 6.9 Sidebar Yapısı

Sidebar üç gruba ayrılır:

```
SIDEBAR:
─────────────────────────────
📊 Dashboard                  → /dashboard

── PROCTORING ───────────────
📝 Exams                      → /exams
📺 Monitoring                 → /monitoring
👨‍🎓 Students                   → /students
🏫 Rooms & Devices            → /rooms

── PROJECT ──────────────────
📁 Files                      → /files
📋 Reports                    → /reports
💬 Feedback                   → /feedback
👥 Team                       → /team

── SYSTEM ───────────────────
🔔 Notifications              → /notifications
⚙️ Settings                   → /settings
🖥️ Monitor                    → /dev/monitor (admin)
🤖 AI Training                → /ai/training (admin)
─────────────────────────────
```

**Görünürlük kuralları:**
- PROCTORING grubu: `CAMERA_MODULE_ENABLED=true` ise görünür
- PROJECT grubu: her zaman görünür (mevcut Faz 0-1 modülleri)
- SYSTEM grubu: her zaman görünür
- AI Training: sadece admin + CAMERA_MODULE_ENABLED=true

### 6.10 Sıra Düzeni Editörü (Room Layout Editor)

**Route:** `/rooms/[id]` → "Sıra Düzeni" tab

Admin her oda için sıra düzenini görsel olarak tasarlayabilir.

#### Desteklenen Düzen Tipleri

| Düzen | Açıklama | Görsel |
|-------|----------|--------|
| `standard` | Normal sınıf: satır × sütun grid | `[A1][A2][A3]...[Aisle]...[A4][A5]` |
| `amphitheater` | Amfi: kademeli yükselen yarım daire | Üst sıralar daha geniş ark |
| `u_shape` | U-şekil: 3 kenarda sıralar | Ortası boş, kenarlar dolu |
| `custom` | Serbest: admin istediği yere koltuk yerleştirir | Drag & drop |

#### Layout Editörü UI

```
┌──────────────────────────────────────────────────┐
│  Lab A — Sıra Düzeni Editörü                    │
│  Düzen: [Standard ▼]  Satır: [5]  Sütun: [8]    │
│  Koridor: [Sütun 4 sonrası ▼]                   │
│                                                   │
│   [Tahta / Ön]                                   │
│                                                   │
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐   ┌──┐ ┌──┐ ┌──┐ ┌──┐   │
│   │A1│ │A2│ │A3│ │A4│   │A5│ │A6│ │A7│ │A8│   │
│   └──┘ └──┘ └──┘ └──┘   └──┘ └──┘ └──┘ └──┘   │
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐   ┌──┐ ┌──┐ ┌──┐ ┌──┐   │
│   │B1│ │B2│ │B3│ │B4│   │B5│ │B6│ │B7│ │B8│   │
│   └──┘ └──┘ └──┘ └──┘   └──┘ └──┘ └──┘ └──┘   │
│   ...                                            │
│                                                   │
│  Kapasite: 40 koltuk  │ [+ Koltuk Ekle]          │
│  [Kaydet] [Önizle]                               │
└──────────────────────────────────────────────────┘
```

- Her koltuk tıklanarak disable/enable edilebilir (bozuk koltuk vs.)
- Drag & drop ile koltuk pozisyonu değiştirilebilir (`custom` modda)
- Amfi modunda satır genişlikleri otomatik artar
- Koridor (aisle) pozisyonu ayarlanabilir

#### Layout Data Model

```sql
-- exam_rooms.layout JSONB yapısı:
{
  "type": "standard",           -- standard | amphitheater | u_shape | custom
  "rows": 5,
  "cols": 8,
  "aisle_after_col": 4,         -- koridor pozisyonu
  "seats": [
    { "id": "A1", "row": 0, "col": 0, "x": 0.05, "y": 0.15, "enabled": true },
    { "id": "A2", "row": 0, "col": 1, "x": 0.15, "y": 0.15, "enabled": true },
    { "id": "A3", "row": 0, "col": 2, "x": 0.25, "y": 0.15, "enabled": false },  -- bozuk
    ...
  ]
}
```

### 6.11 Otomatik Öğrenci Yerleştirme (Smart Placement)

Sınav oluştururken öğrenciler sınıflara ve koltuklara otomatik olarak dağıtılabilir.

**Risk geçmişi hesaplama:** `risk_history_score = max(student_exam_reports.risk_score)` — öğrencinin tüm geçmiş sınavlarındaki en yüksek risk skoru. Geçmişi olmayan (yeni) öğrenciler `risk_history_score = 0.0` ile işlenir.

#### Yerleştirme Algoritması

**Adım 1 — Sınıflara Dağıtım (risk-bazlı):**
```
Girdiler:
  - Toplam öğrenci listesi
  - Mevcut odalar + kapasiteleri
  - Her öğrencinin risk_history skoru (geçmiş sınavlardan)

Algoritma:
  1. Öğrencileri risk_history'ye göre sırala (yüksek → düşük)
  2. Round-robin ile odalara dağıt:
     - 1. en riskli → Oda A
     - 2. en riskli → Oda B
     - 3. en riskli → Oda C
     - 4. en riskli → Oda A
     - ...
  Bu sayede yüksek riskli öğrenciler farklı odalara yayılır.
```

**Adım 2 — Koltuk Ataması (her oda içinde):**
```
Girdiler:
  - Odaya atanan öğrenciler (risk sıralı)
  - Oda sıra düzeni (layout)

Algoritma:
  1. Yüksek riskli öğrencileri kamera görüş alanının en iyi olduğu koltuklara ata
     (front_wide kamerasına en yakın sıralar)
  2. Aynı risk grubundaki öğrencileri yan yana koymamaya çalış
     (checkerboard pattern: riskli-normal-riskli-normal)
  3. Kalan koltuklara rastgele ata
```

**Risk History Skoru:**
```sql
-- students tablosuna ek alan:
ALTER TABLE public.students ADD COLUMN risk_history JSONB DEFAULT '{}';
-- Örnek: { "total_exams": 5, "total_incidents": 3, "avg_risk_score": 0.45, "last_exam_risk": 0.72 }
```

Her sınav bitiminde öğrencinin `risk_history` otomatik güncellenir.

#### Yerleştirme UI (Wizard Adım 3'e entegre)

```
┌─────────────────────────────────────────────────┐
│  Öğrenci Yerleştirme                 Adım 3/5  │
│                                                 │
│  [📁 CSV/Excel Yükle] [+ Tekil Ekle]           │
│  Toplam: 120 öğrenci                            │
│                                                 │
│  Yerleştirme Modu:                              │
│  ○ Manuel (kendin ata)                          │
│  ● Otomatik (risk-bazlı akıllı yerleştirme)    │
│  ○ Rastgele (tamamen random)                    │
│                                                 │
│  [🎲 Otomatik Yerleştir]                        │
│                                                 │
│  Sonuç:                                         │
│  ┌──────────────┬─────────┬─────────┬────────┐  │
│  │ Oda          │ Öğrenci │ Ort.Risk│ Max    │  │
│  ├──────────────┼─────────┼─────────┼────────┤  │
│  │ Lab A (40)   │ 40/40   │ 0.35   │ 0.72   │  │
│  │ Lab B (35)   │ 35/35   │ 0.33   │ 0.68   │  │
│  │ Salon (45)   │ 45/45   │ 0.31   │ 0.65   │  │
│  └──────────────┴─────────┴─────────┴────────┘  │
│  ✅ Risk dengeli dağıtıldı                      │
│                                                 │
│  [Yerleştirmeyi Gör] → oturma planı önizleme    │
│              [← Geri]  [İleri →]                │
└─────────────────────────────────────────────────┘
```

### 6.12 OCR Yoklama & Sıra Eşleme Sistemi

> **⚠️ Phase B Özelliği.** Phase A'da yoklama manuel yapılır: proctor, öğrenci listesinden isim seçerek yoklama alır. OCR yoklama Phase B'de eklenecektir.

Gözetmen sınav başlangıcında telefonundan kimlik/öğrenci kartı tarayarak yoklama alır ve öğrenci-sıra eşleştirmesini yapar.

#### Akış

```
1. Gözetmen /exams/[id]/sessions/[sid] sayfasını telefondan açar
2. "Yoklama Al" butonuna tıklar
3. Başlangıç sırasını seçer (ör: "A1'den başla")
4. Kamera açılır → öğrenci kimliğini/okul kartını tutar
5. OCR motoru kimlikten isim + okul numarası çıkarır
6. Sistem eşleştirir:
   - OCR'dan çıkan öğrenci no → students tablosunda arar
   - Bulunan öğrenci → seçili sıraya (A1) atanır
   - Yoklama: "VAR" olarak işaretlenir
7. Otomatik sonraki sıraya geçer (A2)
8. Gözetmen onaylar veya düzeltir
9. Sonraki öğrenci → tekrar kamera
```

#### OCR Teknoloji

| Seçenek | Avantaj | Dezavantaj |
|---------|---------|------------|
| **Tesseract.js** (client-side) | Ücretsiz, sunucu gerektirmez | Doğruluk düşük (~85%) |
| **Google Cloud Vision API** | Yüksek doğruluk (~98%) | Ücretli ($1.50/1000 req) |
| **Browser MediaDevices API** | Kamera erişimi | Tarayıcı desteği |

**Öneri Phase A:** Tesseract.js (client-side, ücretsiz). Doğruluk düşükse → gözetmen manuel düzeltir.
**Phase B:** Google Cloud Vision API geçişi (daha yüksek doğruluk).

#### Yoklama UI (Mobile-first)

```
┌────────────────────────────┐
│ 📷 Yoklama — Lab A        │
│ Sıra: A3  (3/40)          │
│                            │
│ ┌────────────────────────┐ │
│ │                        │ │
│ │    [Kamera Görüntüsü]  │ │
│ │                        │ │
│ │  ┌──────────────────┐  │ │
│ │  │ Kimlik algılandı │  │ │
│ │  │ No: 2021xxxx     │  │ │
│ │  │ Ad: Ahmet Yılmaz │  │ │
│ │  └──────────────────┘  │ │
│ └────────────────────────┘ │
│                            │
│ Eşleşen: Ahmet Yılmaz ✅  │
│ Sıra: A3                   │
│ Durum: [VAR]               │
│                            │
│ [✓ Onayla & Sonraki]      │
│ [✏️ Düzelt]  [⏭️ Atla]    │
└────────────────────────────┘
```

#### Veritabanı: Yoklama Kaydı

```sql
CREATE TABLE public.attendance_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.students(id),
  seat_number   TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'present'
                CHECK (status IN ('present', 'absent', 'late', 'excused')),
  checked_by    UUID REFERENCES public.user_profiles(id),  -- Yoklamayı alan gözetmen
  checked_at    TIMESTAMPTZ DEFAULT NOW(),
  ocr_data      JSONB DEFAULT '{}',        -- OCR'dan çıkan ham veri (doğrulama için)
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_attendance_session_student ON public.attendance_records (session_id, student_id);
```

### 6.13 Face Enrollment & Otomatik Kilit Eşleştirme

> **⚠️ Phase B Özelliği.** Phase A'da yüz tanıma kullanılmaz. Öğrenci-track eşleştirmesi pozisyon bazlı yapılır (§3.5). Face enrollment Phase B'de eklenecektir.

Yoklama sırasında OCR + kamera ile öğrencinin yüz verisi de kaydedilir (opsiyonel). Bu sayede:
- Aynı sınavda kamera track_id → öğrenci eşleştirmesi otomatik olur
- Sonraki sınavlarda öğrenci tanıma daha kolay olur

#### Akış

```
Yoklama sırasında (§6.12):
1. Gözetmen kimliği tararken kamera hem kimliği hem öğrencinin yüzünü görür
2. Sistem:
   a) OCR → isim + no çıkarır
   b) MediaPipe Face Mesh → yüz embedding'i çıkarır (128-dim vector)
   c) Embedding'i student kaydına bağlar
3. Sınav başladığında:
   a) AI servisi kameradan yüzleri tespit eder
   b) Her yüzün embedding'ini enrollment veritabanı ile karşılaştırır
   c) Eşleşme bulursa → track_id otomatik olarak student_id'ye bağlanır
   d) Eşleşme bulamazsa → seat_assignment'tan pozisyon bazlı eşleme (fallback)
```

#### Veritabanı: Yüz Embedding

```sql
-- students tablosuna ek alan:
ALTER TABLE public.students ADD COLUMN face_embedding FLOAT[];  -- 128-dim vector
ALTER TABLE public.students ADD COLUMN face_enrolled_at TIMESTAMPTZ;
```

**KVKK Notu:** Yüz embedding'i biyometrik veri kapsamındadır. §21 Privacy & KVKK bölümündeki rıza mekanizması zorunludur. Öğrenci rıza vermezse enrollment yapılmaz, pozisyon bazlı eşleme kullanılır.

**Phase B — Yüz Eşleştirme Güven Politikası:**
| Confidence | Aksiyon |
|------------|--------|
| >= %92 | Otomatik eşleştirme (sessiz) |
| %85-%92 | Eşleştirme yapılır ama proctor'a sarı uyarı: 'Düşük güvenli eşleşme — doğrular mısınız?' |
| < %85 | Eşleştirme yapılmaz → pozisyon bazlı fallback (Phase A gibi) |

Bu politika sessiz misidentification riskini ortadan kaldırır. %85 altında sistem yüz tanımayı devre dışı bırakır.

**Yoklama + Yüz Kaydı Akışı (Phase B):**
1. Öğrenci kiosk'a gelir
2. Tablet kamerasına kimlik kartını gösterir → OCR ile student_id çıkarılır
3. **Aynı anda** tablet üst kamerası öğrencinin yüzünü çeker → MediaPipe embedding oluşturulur
4. İki işlem paralel: ID doğrulama + yüz kaydı
5. Her ikisi de başarılıysa → 'Giriş onaylandı'
6. OCR başarısız → proctor manuel onay (student_id girer)
7. Yüz kaydı reddedildi (KVKK) → sadece pozisyon bazlı takip

### 6.14 Sınav Kuralları & Çıkış Politikaları

Sınav oluşturulurken admin çıkış/giriş kurallarını belirler:

```sql
-- exams.settings JSONB'ye eklenen kural alanları:
{
  "exit_rules": {
    "no_exit_first_minutes": 30,       -- İlk 30 dk çıkış yasak
    "no_exit_last_minutes": 30,        -- Son 30 dk çıkış yasak
    "exit_allowed_window": true,       -- Ortadaki zaman diliminde çıkışa izin var
    "max_exit_count": 1,               -- Öğrenci max kaç kez çıkabilir (0 = sınırsız)
    "exit_duration_limit_minutes": 10, -- Dışarıda max süre (aşılırsa uyarı)
    "require_proctor_approval": true   -- Çıkış için gözetmen onayı gerekli mi?
  },
  "detection_settings": {
    "preset": "normal",                -- strict | normal | relaxed | custom
    "confidence_threshold": 0.65,
    "gaze_diversion_angle": 30,
    "gaze_diversion_count": 3,
    "head_turn_threshold": 45,
    "risk_escalation_window_minutes": 5
  }
}
```

**Çıkış UI (Gözetmen — mobil):**
```
┌──────────────────────────────┐
│  Öğrenci Çıkış Talebi       │
│                              │
│  Öğrenci: Ahmet Yılmaz      │
│  Sıra: A3 | Saat: 14:42     │
│                              │
│  ⏱️ Sınav süresi: 42/120 dk │
│  ✅ Çıkış penceresi açık    │
│  (30-90 dk arası)           │
│                              │
│  [✓ Çıkışa İzin Ver]       │
│  [✗ Reddet]                 │
│                              │
│  Not: Çıkış süresi max 10dk │
│  Aşılırsa otomatik uyarı    │
└──────────────────────────────┘
```

**Çıkış takibi:**
- Öğrenci çıktığında `empty_seat` tespiti beklenir (AI)
- Süre aşılırsa proctor'a uyarı gider
- Geri döndüğünde face enrollment ile kimlik doğrulanır (varsa)
- Çıkış/dönüş audit_logs'a yazılır

### 6.15 Sınav Oluşturma Wizard (5 Adım)

```
Adım 1: Sınav Bilgileri + Kurallar
Adım 2: Sınıf & Gözetmen Ataması
Adım 3: Öğrenci Yerleştirme (import + otomatik/manuel/rastgele)
  ↳ Accommodation uyarısı (aşağıya bkz)
Adım 4: Oturma Planı Önizleme (görsel doğrulama + düzenleme)
Adım 5: Özet & Onay
```

**Accommodation uyarısı:** Wizard Step 3'te öğrenci atanırken, accommodation kaydı olan öğrenciler özel ikonla (♿) gösterilir. Atama yapıldığında: 'Bu oturumda 3 accommodation'lı öğrenci var. Threshold'lar otomatik ayarlanacak.' bilgi kartı gösterilir. Admin isterse accommodation'ı bu sınav için devre dışı bırakabilir.

**Adım 1 Detay (güncellenmiş):**
```
┌─────────────────────────────────────────────────┐
│  Yeni Sınav Oluştur                  Adım 1/5  │
│                                                 │
│  ── TEMEL BİLGİLER ──                          │
│  Sınav Adı:    [CMPE 492 Final Sınavı        ] │
│  Ders Kodu:    [CMPE 492                      ] │
│  Tarih:        [📅 15 Haziran 2026            ] │
│  Başlangıç:    [⏰ 14:00 ]  Bitiş: [⏰ 16:00 ] │
│  Süre:         [120 dakika                    ] │
│                                                 │
│  ── ÇIKIŞ KURALLARI ──                         │
│  İlk çıkış yasağı:    [30] dakika              │
│  Son çıkış yasağı:    [30] dakika              │
│  Max çıkış sayısı:    [1 ] (0=sınırsız)        │
│  Max dışarıda süre:   [10] dakika              │
│  Gözetmen onayı:      [✓] gerekli             │
│                                                 │
│  ── DETECTION AYARLARI ──                      │
│  Preset: [Normal ▼]                            │
│  [⚙️ Detaylı Ayarlar]  ← tıklayınca slider'lar│
│                                                 │
│                          [İleri →]              │
└─────────────────────────────────────────────────┘
```

### 6.16 Wizard CRUD & Hata Yönetimi

#### Sınav Güncelleme (Update)

| Sınav Durumu | Güncellenebilecekler | Güncellenemeyecekler |
|-------------|---------------------|---------------------|
| `draft` | Her şey | — |
| `scheduled` | Her şey (gözetmenler bilgilendirilir) | — |
| `active` | Gözetmen ekleme/çıkarma, öğrenci transferi, çıkış kuralları | Tarih, saat, oda değişikliği |
| `completed` | Sadece görüntüleme + incident review | Her şey kilitli |
| `cancelled` | Sadece görüntüleme | Her şey kilitli |

**Güncelleme UI:** `/exams/[id]/edit` — wizard ile aynı adımlar ama mevcut veri dolu gelir.

#### Sınav Silme (Delete)

| Durum | Silme Davranışı |
|-------|----------------|
| `draft` | Kalıcı silme (hard delete) — onay modal |
| `scheduled` | İptal et (status → cancelled) — gözetmenler bilgilendirilir |
| `active` | SİLİNEMEZ — önce bitirilmeli |
| `completed` | Arşivle (soft delete) — 1 yıl sonra otomatik temizlik |
| `cancelled` | Arşivle (soft delete) |

**Silme onay modal:**
```
┌────────────────────────────────────┐
│  ⚠️ Sınavı Sil                    │
│                                    │
│  "CMPE 492 Final" sınavını        │
│  silmek istediğinize emin misiniz?│
│                                    │
│  Bu işlem geri alınamaz.          │
│  3 oturum, 120 öğrenci ataması    │
│  ve tüm konfigürasyon silinecek.  │
│                                    │
│  Onaylamak için sınav adını yazın: │
│  [                              ]  │
│                                    │
│  [İptal]            [Sil]         │
└────────────────────────────────────┘
```

#### Wizard Hata Yönetimi

| Hata Senaryosu | Davranış |
|----------------|----------|
| Oda kapasitesi aşıldı | Adım 3'te kırmızı uyarı: "Lab A kapasitesi 40, 45 öğrenci atandı" |
| Gözetmen çakışması | Adım 2'de uyarı: "Ayşe Kaya aynı saatte başka sınavda gözetmen" |
| Öğrenci çakışması | Adım 3'te uyarı: "5 öğrenci aynı saatte başka sınava kayıtlı" |
| Kamera bağlantısız | Adım 2'de sarı uyarı: "Lab A CAM1 bağlantı yok — sınavdan önce kontrol edin" |
| Oturma planı eksik | Adım 4'te uyarı: "Lab A sıra düzeni tanımlı değil" |
| Tarih geçmiş | Adım 1'de hata: "Geçmiş tarih seçilemez" |
| Süre 0 veya negatif | Adım 1'de validation: "Süre en az 15 dakika olmalı" |
| Ağ hatası (kaydetme) | Toast: "Kaydedilemedi. Lütfen tekrar deneyin." + otomatik retry (3 kez) |
| Wizard'dan çıkış | Onay modal: "Kaydedilmemiş değişiklikler var. Çıkmak istiyor musunuz?" → [Taslak Kaydet] [Çık] |

#### Güvenlik Önlemleri

| Kontrol | Açıklama |
|---------|----------|
| RBAC | Sınav CRUD: sadece admin. Gözetmen: sadece atandığı sınavı görebilir. |
| Çakışma kontrolü | Aynı oda + aynı saat diliminde iki sınav oluşturulamaz |
| Gözetmen limiti | Bir gözetmen aynı anda iki farklı sınava atanamaz |
| Öğrenci limiti | Bir öğrenci aynı saatte iki sınava kaydedilemez |
| Kamera durumu | Sınav başlatılmadan önce tüm kameraların bağlantısı kontrol edilir |
| Audit trail | Tüm wizard işlemleri (oluştur, güncelle, sil) audit_logs'a yazılır |
| Input sanitization | Tüm string input'lar XSS korumalı, SQL injection Supabase RLS ile engellenir |

### 6.17 Sınav Düzenleme

Oluşturulmuş sınavlar düzenlenebilir (status = 'draft' veya 'scheduled' iken):

- Sınav bilgileri (ad, tarih, saat) değiştirilebilir
- Oturum eklenip çıkarılabilir
- Gözetmenler değiştirilebilir
- Öğrenciler eklenip çıkarılabilir veya oturumlar arası transfer edilebilir
- **Aktif sınav sırasında:** sadece gözetmen ekleme ve öğrenci transferi mümkün (tarih/saat/oda değiştirilemez)

### 6.18 Sınav Durumları

```
draft → scheduled → active ⇄ paused → active → completed
                  ↘ cancelled
```

| Durum | Açıklama | Düzenlenebilir? |
|-------|----------|----------------|
| `draft` | Taslak, henüz planlanmadı | Tamamen |
| `scheduled` | Planlandı, gözetmenler bilgilendirildi | Tamamen |
| `active` | En az bir oturum başlatıldı | Sınırlı (gözetmen/öğrenci transfer) |
| `paused` | Oturum geçici olarak duraklatıldı (AI takibi duraklar) | Sadece resume mümkün |
| `completed` | Tüm oturumlar bitti | Sadece görüntüleme |
| `cancelled` | İptal edildi | Sadece görüntüleme |

#### Sınav Erteleme (Reschedule)

`scheduled` durumundaki sınav ertelenebilir:
1. Admin sınav detay sayfasında 'Ertele' butonuna tıklar
2. Yeni tarih/saat seçer
3. Sistem çakışma kontrolü yapar (oda + gözetmen müsaitliği)
4. Onay → tarih güncellenir
5. Atanmış gözetmenlere push notification: 'Sınav [isim] [eski tarih] → [yeni tarih] olarak ertelendi'
6. `audit_logs`'a `exam.update` event'i yazılır

**Kısıtlama:** `active` durumundaki sınav ertelenemez — önce duraklatılmalı veya sonlandırılmalıdır.

#### Sınav İptal Akışı

Admin sınav detay sayfasında 'Sınavı İptal Et' butonuna tıklar:

1. Onay modal: 'Bu sınav iptal edilecek. Tüm oturumlar sonlandırılacak, öğrenciler otomatik checkout yapılacak. Bu işlem geri alınamaz.'
2. Onay → sınav `cancelled` durumuna geçer
3. Aktif oturumlar sonlandırılır (`ended_at = now()`)
4. Tüm checkout yapılmamış öğrenciler: `checkout_type: 'exam_cancelled'`
5. AI takibi durur
6. Incident'lar korunur (silinmez) ama raporda 'İptal edilen sınav' etiketi ile gösterilir
7. Gözetmenlere push notification: 'Sınav [isim] iptal edildi'
8. `audit_logs`'a `exam.delete` event'i (soft cancel, fiziksel silme değil)

### 6.19 Öğrenci Çıkış (Checkout) Sistemi

Öğrenci sınavını tamamlayıp çıkarken kayıt altına alınır ve o öğrenci için AI izleme durdurulur.

#### Çıkış Yöntemleri

**Yöntem 1 — Tablet Kiosk (self-service):**
Sınıfın öğretmen masasında/çıkış kapısında bir tablet kiosk modunda çalışır:

```
┌────────────────────────────────────┐
│                                    │
│     🎓 Sınav Çıkış                │
│                                    │
│  Okul numaranızı girin:           │
│  ┌──────────────────────────────┐  │
│  │  2021                        │  │
│  └──────────────────────────────┘  │
│                                    │
│          [Çıkış Yap]              │
│                                    │
│  veya                              │
│                                    │
│  [📷 Kimlik Tara]                 │
│  (OCR ile okul numarası algıla)   │
│                                    │
└────────────────────────────────────┘

→ Numara girilince / taranınca:

┌────────────────────────────────────┐
│                                    │
│  ✅ Çıkış Onayı                   │
│                                    │
│  Ad: Ahmet Yılmaz                 │
│  No: 20210001                     │
│  Sıra: A3                         │
│  Giriş: 14:00  |  Şimdi: 15:22   │
│  Süre: 1 saat 22 dakika           │
│                                    │
│  ⚠️ Çıktıktan sonra tekrar       │
│  giremezsiniz.                    │
│                                    │
│  [Onayla & Çık]    [İptal]        │
│                                    │
└────────────────────────────────────┘
```

**Tablet kiosk modu:**
- `/exams/[id]/sessions/[sid]/kiosk` route — tam ekran, minimal UI
- Browser'ın adres çubuğu gizli (PWA standalone mode)
- Sadece çıkış işlemi yapılabilir (başka navigasyon yok)
- Gözetmen PIN ile kiosk modunu açar/kapatır (yetkisiz erişim engeli)

**Yöntem 2 — Gözetmen Manuel Çıkış:**
Gözetmen canlı izleme ekranından veya mobil uygulamadan öğrenciyi seçip çıkış işaretler:

```
Canlı izleme → Öğrenci risk haritasında öğrenciye tıkla → "Çıkış Yap" butonu

veya

Gözetmen mobil → "Öğrenci Çıkış" → listeden seç → onayla
```

#### Çıkış Sonrası Otomatik İşlemler

```
Öğrenci checkout yapıldığında:
1. attendance_records → status = 'completed', checkout_at = now()
2. AI servise bildir → bu track_id'yi izlemeyi DURDUR
3. Koltuğu "boş" olarak işaretle (empty_seat tespiti beklenmez)
4. Öğrencinin kişisel sınav raporu arka planda hazırlanmaya başlar:
   ├── Toplam incident sayısı (severity bazlı)
   ├── Risk skoru timeline grafiği
   ├── Flag'lenmiş anlar (evidence snapshot'ları)
   └── Sınav süresi, genel davranış özeti
5. Gözetmene bildirim: "Ahmet Yılmaz (A3) sınavdan çıktı — rapor hazırlanıyor"
```

#### Veritabanı Güncellemesi

```sql
-- attendance_records tablosuna çıkış alanları:
ALTER TABLE public.attendance_records
  ADD COLUMN checkout_at    TIMESTAMPTZ,         -- Çıkış zamanı
  ADD COLUMN checkout_method TEXT                 -- 'kiosk' | 'proctor_manual' | 'auto_timeout'
             CHECK (checkout_method IN ('kiosk', 'proctor_manual', 'auto_timeout'));

-- Bireysel öğrenci raporu:
CREATE TABLE public.student_exam_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.students(id),
  duration_minutes INTEGER,                       -- Sınavda geçirilen süre
  total_incidents  INTEGER DEFAULT 0,
  incident_summary JSONB DEFAULT '{}',            -- { low: 2, medium: 1, high: 0, critical: 0 }
  avg_risk_score   FLOAT,
  max_risk_score   FLOAT,
  risk_timeline    JSONB DEFAULT '[]',            -- [{ time: "14:05", score: 0.1 }, ...]
  flagged_moments  JSONB DEFAULT '[]',            -- [{ time: "14:23", type: "phone", evidence: "path" }]
  status           TEXT DEFAULT 'generating'
                   CHECK (status IN ('generating', 'ready', 'reviewed')),
  reviewed_by      UUID REFERENCES public.user_profiles(id),
  review_note      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_student_report_session ON public.student_exam_reports (session_id, student_id);
```

**Otomatik checkout politikası:**
- `empty_seat` > 5 dakika VE proctor acknowledge etmedi → dashboard'da banner: 'Koltuk [A5] 5 dakikadır boş — otomatik checkout yapılsın mı? [Evet / Hayır / Bekle]'
- Proctor 'Evet' → otomatik checkout, `checkout_type: 'auto_timeout'`
- Proctor 'Hayır' → alert kapatılır, öğrenci takip edilmeye devam eder
- Proctor 'Bekle' → 5 dakika daha beklenir, sonra tekrar sorulur
- Sınav sonunda hala checkout yapılmamış öğrenciler: `checkout_type: 'exam_end_auto'` ile toplu checkout

#### Sınav Sonu — Toplu Çıkış

Sınav süresi dolduğunda veya gözetmen "Sınavı Bitir" tıkladığında:
- Henüz checkout yapmamış tüm öğrenciler otomatik olarak `checkout_method = 'auto_timeout'` ile kaydedilir
- Tüm öğrencilerin bireysel raporları hazırlanmaya başlar
- Sınav genel raporu (`/exams/[id]/sessions/[sid]/report`) oluşturulur

#### API Endpoint'ler

```
POST   /api/sessions/[id]/checkout          → Öğrenci çıkış (kiosk veya proctor)
GET    /api/sessions/[id]/checkout/status    → Kimlerin çıktığı, kimlerin hala içeride
POST   /api/sessions/[id]/checkout/bulk      → Toplu çıkış (sınav sonu)
GET    /api/sessions/[id]/reports            → Öğrenci bireysel raporları listesi
GET    /api/sessions/[id]/reports/[student]  → Tekil öğrenci raporu
```

### 6.20 Geç Gelen Öğrenci Prosedürü

1. Öğrenci sınıfa girer → proctor, canlı izleme ekranından 'Geç gelen öğrenci ekle' butonuna tıklar
2. Öğrenci listesinden isim seçilir (veya yoklama kiosk'unda kendisi giriş yapar)
3. Sistem yeni track algılar → en yakın boş koltuğa otomatik eşleştirir
4. Proctor eşleştirmeyi onaylar veya düzeltir
5. `attendance_records` tablosuna `late_entry: true` ve giriş zamanı kaydedilir
6. AI takibi bu öğrenci için başlar (geçmiş verisi yok, temiz başlangıç)

**Geç giriş süresi:** Sınav kurallarındaki `no_exit_first_minutes` süresi geç giriş için de geçerlidir. Bu süre içinde gelen öğrenci normal katılır. Süre geçtikten sonra geç giriş proctor onayı gerektirir.

---

## 7. Incident (Olay) Yönetimi

### 7.1 Veritabanı

```sql
CREATE TABLE public.incidents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES public.exam_sessions(id),
  student_id      TEXT,                    -- Öğrenci student_id (eşleştirme sonrası) veya 'track:{N}' (eşleştirme öncesi)
  track_id        INTEGER,                 -- BoT-SORT tracking ID
  incident_type   TEXT NOT NULL,           -- Bkz: §7.2
  severity        TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence      FLOAT NOT NULL,          -- AI güven skoru 0.0-1.0
  risk_score      FLOAT,                   -- Bileşik risk skoru
  triggered_rules TEXT[],                  -- Hangi kurallar tetikledi
  camera_ids      UUID[],                  -- Hangi kameralar katkıda bulundu
  evidence_paths  TEXT[],                  -- Supabase Storage path'leri
  is_reviewed     BOOLEAN DEFAULT false,
  reviewed_by     UUID REFERENCES public.user_profiles(id),
  review_note     TEXT,
  occurred_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_incidents_session ON public.incidents (session_id, occurred_at DESC);
CREATE INDEX idx_incidents_severity ON public.incidents (severity);
CREATE INDEX idx_incidents_student ON public.incidents (student_id);
```

**student_id güncelleme politikası:**
- İlk 30s (eşleştirme penceresi): incident'lar `student_id = 'track:{N}'` formatında kaydedilir
- Eşleştirme tamamlandığında: o session'daki tüm `'track:{N}'` student_id'leri gerçek student_id ile batch UPDATE edilir
- Track reassignment (öğrenci koltuk değiştirir): **eski incident'lar güncellenmez** (audit trail korunur). Sadece yeni incident'lar yeni student_id ile kaydedilir
- Raporda: tüm incident'lar student bazlı gruplanır, `'track:{N}'` formatında kalanlar "Eşleştirilememiş" olarak gösterilir

### 7.2 Tespit Kategorileri (Araştırma Tabanlı)

3 güven seviyesinde sınıflandırılmış tespit kategorileri:

#### TIER 1 — Yüksek Güven (tek başına alert üretebilir)

| Tespit | Teknoloji | Doğruluk | FP Oranı | Phase | Açıklama |
|--------|-----------|----------|----------|-------|----------|
| `phone_in_hand` | YOLOv8 (COCO pre-trained) | %92-94 | %5-8 | A | Telefon elde görünür — en güvenilir tek sinyal |
| `unauthorized_person` | Phase A: kişi sayısı > beklenen (YOLOv8 person count), Phase B: face recognition | %95+ | Çok düşük | A/B | Phase A: odadaki kişi sayısı session_students + proctors sayısını aşarsa alert. Phase B: face enrollment ile bilinmeyen kişi tespiti |
| `student_absent` | Person detection (track kayıp) | %98+ | Çok düşük | A | Öğrenci koltuktan ayrıldı (checkout yoksa) |

#### TIER 2 — Orta Güven (bağlam + zaman ile birlikte değerlendirilmeli)

| Tespit | Teknoloji | Doğruluk | FP Oranı | Phase | Tetikleme Koşulu |
|--------|-----------|----------|----------|-------|------------------|
| `sustained_gaze_neighbor` | MediaPipe gaze + head pose | %85-89 | %10-15 | A | Yaw > 30° AND süre > 3s AND 5dk'da 3+ kez |
| `body_lean_neighbor` | MediaPipe Pose (torso açısı) | %80-85 | %12-18 | **B** | Gövde komşuya doğru eğilim + komşudan karşılıklı hareket **(Phase B — MediaPipe Pose gerektirir, Phase A'da devre dışı)** |
| `object_passing` | Multi-person tracking + el tespiti | %78-82 | %15-20 | B | İki öğrenci arası nesne transferi |
| `synchronized_behavior` | Multi-student temporal correlation | %75-80 | %15-20 | B | İki komşu öğrencinin 2s içinde aynı yöne bakması, tekrarlı |
| `hand_in_lap_extended` | MediaPipe Pose + gaze down | %70-78 | %20-25 | B | El kucakta > 5s + bakış aşağı (gizli telefon şüphesi) **(Phase B — MediaPipe Pose gerektirir)** |
| `whispering` | MediaPipe FaceMesh (dudak hareketi) | %70-75 | %20+ | C | Dudak hareketi + komşuya yönelik kafa pozisyonu |

#### TIER 3 — Düşük Güven (yalnızca bilgilendirme, tek başına alert ÜRETMEZ)

| Tespit | Teknoloji | Doğruluk | FP Oranı | Neden Tek Başına Yeterli Değil |
|--------|-----------|----------|----------|-------------------------------|
| `brief_glance` | Head pose | %60-70 | %25-35 | Herkes bakar — kalem düşürme, saat, düşünme |
| `fidgeting` | Pose varyansı | %50-60 | Çok yüksek | ADHD, stres, doğal huzursuzluk |
| `hand_movement_unusual` | MediaPipe Hands | %65-75 | Yüksek | Kaşınma, gözlük düzeltme, saç |
| `face_lost_brief` | Face detection loss | %90 (tespit) | Çok yüksek | Eğilme, kalem alma, gergi |
| `stress_expression` | FaceMesh ifade analizi | <%50 | Kabul edilemez | **ETİK SORUN — kullanılmaz** |

> **⚠️ Tasarım Prensibi:** Sistem **asla** otomatik olarak "kopya çekti" kararı vermez. Tüm tespitler **şüphe skoru** üretir ve **insan incelemesi** için gözetmene iletilir. Bu hem doğruluk hem de hukuki gereklilik gereğidir.

**⚠️ Doğruluk Uyarısı — Gerçekçi Beklentiler:**

Yukarıdaki doğruluk oranları akademik makalelerden (ideal lab koşulları) alınmıştır. **Gerçek sınıf ortamında:**

| Faktör | Lab | Gerçek Sınıf | Etki |
|--------|-----|-------------|------|
| Mesafe | 1-2m | 3-8m | Doğruluk %10-20 düşer |
| Aydınlatma | Kontrollü | Değişken (pencere, floresan) | Doğruluk %5-10 düşer |
| Açı | Frontal | Çeşitli (yan, üst) | Doğruluk %5-15 düşer |
| Örtünme | Yok | Eller, saç, maske | Doğruluk %10-20 düşer |

**Gerçekçi Phase A hedefleri:**

| Tespit | Lab Doğruluğu | Beklenen Gerçek Doğruluk |
|--------|--------------|------------------------|
| phone_detected | %92-94 | **%75-85** |
| gaze_diversion | %85-89 | **%70-80** |
| head_turn | %88-92 | **%80-88** |
| empty_seat | %98+ | **%95+** |

**Zorunlu:** Phase A deploy öncesi, kendi sınıf ortamınızda en az 100 frame'lik benchmark çalıştırın. Gerçek doğruluk hedefin altındaysa threshold'ları ayarlayın.

**Benchmark prosedürü (Phase A deploy öncesi zorunlu):**
1. Sınıfta 3 farklı aydınlatma koşulunda (sabah güneşli, öğlen, akşam floresan) 50'şer frame kaydet = 150 frame
2. Her frame'de manuel etiketle: telefon var/yok, bakış yönü (normal/şüpheli), kişi sayısı
3. YOLOv8 + MediaPipe inference çalıştır → tahmin vs etiket karşılaştır
4. Hesapla: precision, recall, F1 per detection type
5. **Kabul kriterleri:** phone precision > %80, gaze recall > %70, person recall > %95
6. Kriterler karşılanmıyorsa → threshold ayarla (confidence düşür/artır) → tekrar test et
7. Sonuçları `ai_models` tablosuna kaydet: `benchmark_results JSONB`

#### Phase B Tespitleri

Aşağıdaki tespitler Phase A'da aktif değildir:

| Tespit | Teknoloji | Doğruluk | FP Oranı | Phase | Açıklama |
|--------|-----------|----------|----------|-------|----------|
| `unauthorized_material` | YOLOv8 (custom trained — kitap, ek kağıt) | %85-90 | %8-12 | B | Yasaklı materyaller masada görünür |
| `earbuds_detected` | YOLOv8 (custom trained) | %71-80 | %10-15 | B | Kulaklık/işitme cihazı tespiti — custom dataset gerekir |

> **Not:** Bu tespitler custom eğitilmiş YOLOv8 modeli gerektirir. Phase A'da COCO pre-trained model ile sadece telefon ve kişi tespiti yapılır. Phase B'de sınıf ortamından toplanan labeled data ile eğitim sonrası aktif edilir.

### 7.3 Multi-Sinyal Füzyon Puanlama

> **⚠️ Phase B Özelliği.** Phase A'da basit kural tabanlı scoring kullanılır (aşağıdaki 'Phase A Basit Kurallar' bölümüne bkz). Multi-sinyal füzyon Phase B'de aktif edilir.

#### Phase A — Kural Tabanlı Scoring

Phase A'da füzyon formülü kullanılmaz. Basit, deterministik kurallar:

| Algılama | Koşul | Severity |
|----------|-------|----------|
| phone_detected | confidence >= 0.65 | HIGH |
| phone_detected | confidence 0.50-0.65 | MEDIUM (onay bekle) |
| gaze_diversion | >= 3 kez / 5 dakika | MEDIUM |
| gaze_diversion | >= 6 kez / 5 dakika | HIGH |
| head_turn | >= 3 kez / 5 dakika VE gaze ile birlikte | HIGH |
| head_turn | tek başına | LOW |

**Not:** `head_turn ≥3 VE gaze birlikte` kuralında, head_turn yaw > 45° VE gaze komşu koltuğa yönelmiş olmalıdır (§3.6 sınıf geometri kalibrasyonuna göre). Sadece duruş düzeltme (yaw değişimi < 2s, gaze hala tahta/kağıt yönünde) → head_turn sayılmaz.
| empty_seat | > 60 saniye | MEDIUM |
| empty_seat | > 120 saniye | HIGH |

**empty_seat vs kısa süreli hareket ayrımı:**
- Öğrenci kalkıp 10 saniye içinde oturdu → `empty_seat` tetiklenmez (kısa hareket filtresi)
- 10-60 saniye ayakta → `empty_seat` severity: LOG_ONLY (bilgi amaçlı)
- 60+ saniye → `empty_seat` severity: MEDIUM (proctor alert)
- 120+ saniye → `empty_seat` severity: HIGH (öğrenci çıkmış olabilir)
Bu eşikler `exam.settings` JSONB'de yapılandırılabilir.

Risk score = max(aktif incident'ların severity değeri): LOW=0.25, MEDIUM=0.50, HIGH=0.75, CRITICAL=0.90

#### Phase B — Multi-Sinyal Füzyon

Tek sinyal güvenilmez — asıl güç sinyallerin kombinasyonunda:

```
SUSPICION_SCORE =
  w1 × object_detection_score     (0.30)  ← en güvenilir tek sinyal
  + w2 × multi_student_correlation (0.25)  ← iki öğrenci arası senkronizasyon
  + w3 × temporal_pattern_score    (0.20)  ← tekrarlama paterni
  + w4 × head_pose_score           (0.10)  ← kafa yönü
  + w5 × gaze_score                (0.10)  ← bakış yönü
  + w6 × body_pose_score           (0.05)  ← gövde pozisyonu
```

**Ağırlık kaynağı:** Nigam et al. (2021), "Systematic Review of AI-Based Proctoring Systems"

**Eksik sinyal durumu:** Bir sinyal mevcut değilse (örn: tek öğrenci varsa multi_student_correlation hesaplanamaz), o terimin ağırlığı sıfırlanır ve kalan ağırlıklar normalize edilir. Örnek: multi_student_correlation yoksa → 0.25 ağırlık kaldırılır, kalan 0.75 → 1.0'a normalize.

**Örnek senaryolar:**

| Senaryo | Sinyaller | Skor | Karar |
|---------|-----------|------|-------|
| Öğrenci 2s sağa baktı | brief_glance (TIER 3) | 0.05 | LOG ONLY — doğal hareket |
| Öğrenci 5dk'da 4 kez sağa baktı (> 3s) | sustained_gaze × 4 (TIER 2) | 0.35 | MEDIUM alert |
| Telefon elde görüldü | phone_in_hand (TIER 1) | 0.72 | HIGH alert + push |
| 4 kez bakış + komşu da aynı anda baktı | sustained_gaze + synchronized | 0.68 | HIGH alert |
| Telefon + bakış + kafa dönüşü | phone + gaze + head (combo) | 0.92 | CRITICAL alert |
| Öğrenci gerindi, 2s yukarı baktı | brief_glance + fidgeting (TIER 3) | 0.03 | LOG ONLY |
| Gözetmen yanında, öğrenci sağa baktı | gaze BUT proctor proximity | 0.00 | SÜPRES (§3.9) |

### 7.4 Severity Seviyeleri & Bildirim

| Severity | Skor Aralığı | Tetikleyen | Bildirim |
|----------|-------------|------------|----------|
| **log_only** | < 0.15 | TIER 3 tek sinyaller, süpreslenen olaylar | Sadece log, proctor görmez |
| `low` | 0.15 - 0.35 | TIER 3 tekrarlı, TIER 2 tek seferlik | Loglanır, dashboard'da gri |
| `medium` | 0.35 - 0.60 | TIER 2 tekrarlı, TIER 1 düşük güvenli | Dashboard'da sarı alert |
| `high` | 0.60 - 0.85 | TIER 1 tek, TIER 2 çoklu kombinasyon | 🔴 Alert + **push notification** |
| `critical` | > 0.85 | TIER 1 çoklu, TIER 1 + TIER 2 combo | 🔴 Alert + **push + sesli uyarı** + proctor çağrı |

**Escalation kuralları:**
- 5dk'da 3+ `low` → otomatik `medium`'a yükselt
- 5dk'da 2+ `medium` → otomatik `high`'a yükselt
- `high` + farklı tipte `medium` (10dk içinde) → `critical`

**Zaman penceresi:** Tüm escalation kuralları **sliding window** kullanır. Örnek: '5 dakikada 3+ low' = son 300 saniyede (her frame'de kayan pencere).

**De-escalation kuralları:**

| Koşul | Aksiyon |
|-------|--------|
| 5 dakika boyunca yeni incident yok VE risk_score < 0.35 | Severity bir kademe düşer (high → medium) |
| 10 dakika boyunca yeni incident yok | Severity iki kademe düşer (critical → medium) |
| Proctor 'dismiss' tıklarsa | O incident'ın severity'si `dismissed` olur, score'a katkısı sıfırlanır |

De-escalation asla `dismissed`'den daha aşağı düşürmez. Proctor dismiss etmedikçe incident kaydı kalır.

**Kritik Incident Aksiyon Protokolü:**

Admin sınav oluşturma wizard'ında (Step 1) kritik incident politikasını seçer:

| Politika | Davranış |
|----------|----------|
| `alert_only` (varsayılan) | Push + sesli uyarı + dashboard kırmızı flash. Sınav devam eder. |
| `pause_exam` | Yukarıdakiler + oturum otomatik duraklatılır. Chief proctor resume etmelidir. |
| `notify_admin` | Alert + admin'e SMS/email (PRD-014) + dashboard banner. Sınav devam eder. |

Sesli uyarı: `/public/sounds/critical-alert.mp3` (3 saniye, 3 tekrar). Tarayıcı izin gerektirir (ilk çalıştırmada proctor'dan izin istenir).

### 7.5 False Positive Azaltma Stratejileri

Araştırma bulguları (Atoum et al. 2017, Hussain et al. 2021):

| Strateji | FP Azaltma | Açıklama |
|----------|-----------|----------|
| **Temporal filtering** | %40-50 | Tek anlık olayları filtrele, sadece tekrarlı/sürekli olanları al |
| **Multi-signal fusion** | %30-40 | Tek sinyal yerine kombinasyon, ağırlıklı puanlama |
| **Context suppression (§3.9)** | %20-30 | Gözetmen yakınlığı, sınav fazı, meşru hareket kataloğu |
| **Confidence decay** | %15-20 | Seyrek olayları düşük skorla, sık olayları yüksek skorla puanla |
| **Accommodation profili** | Değişken | ADHD/anksiyete öğrenciler için gevşetilmiş threshold'lar |

**Phase A hedefi: < %20 FP oranı** (basit kural tabanlı scoring ile). **Phase B hedefi: < %10 FP oranı** (multi-sinyal füzyon + temporal filtering ile).

Not: Araştırma makalelerindeki FP azaltma oranları (%40, %30, %20) birbirine kümülatif olarak uygulanmaz — çakışma alanları vardır. Gerçekçi bileşik azaltma: %30-40 toplam.

### 7.6 Engelli/Özel Durum Öğrenciler (Accommodation)

> **⚠️ Phase B Özelliği.** Phase A'da accommodation sistemi aktif değildir. Proctor, şüpheli öğrencinin durumunu post-exam review'da değerlendirir.

ADHD, anksiyete bozukluğu veya fiziksel engeli olan öğrenciler daha yüksek FP oranına maruz kalır:

| Durum | Etkilenen Tespitler | Çözüm |
|-------|-------------------|-------|
| ADHD | fidgeting, gaze_diversion (2-3× normal) | Kişisel threshold artırılır |
| Anksiyete | gaze_diversion, body_movement | Kişisel threshold artırılır |
| Fiziksel engel | unusual_posture, body_lean | İlgili tespit devre dışı bırakılır |

#### Accommodation Nasıl Atanır?

**3 farklı zamanda atanabilir:**

**Senaryo 1 — Önceden Atama (ideal):**
```
Admin → /students/[id] → "Accommodation" bölümü → tip seç (ADHD, anksiyete, fiziksel)
→ Threshold'lar otomatik gevşer
→ Bu öğrencinin katıldığı tüm sınavlarda aktif
→ Sınav başlangıcında AI servise bildirilir: "Track #X → relaxed thresholds"
```

**Senaryo 2 — Sınav Esnasında Atama (geç fark edildi):**
```
Gözetmen sınav sırasında fark eder: "Bu öğrenci çok huzursuz, ADHD olabilir"
→ Canlı izleme ekranında öğrenciye tıklar → "Accommodation Ekle" → tip seçer
→ Sistem anında:
  1. Bu öğrencinin threshold'larını gevşetir (o andan itibaren)
  2. GERİYE DÖNÜK RE-SCORING başlatır:
     - Bu öğrencinin sınav başından bu ana kadarki tüm incident'larını yeniden değerlendirir
     - Yeni (gevşek) threshold'larla re-score eder
     - Threshold altına düşen incident'lar → severity düşürülür veya "suppressed_by_accommodation" olarak işaretlenir
     - Proctor'a bildirim: "Ahmet Y. için accommodation uygulandı — 3 incident yeniden değerlendirildi, 2'si düşürüldü"
  3. Dashboard'daki risk skoru ve alert'ler güncellenir
```

**Senaryo 3 — Sınav Sonrası İtiraz:**
```
Öğrenci: "Ben ADHD tanılıyım, haksız flag'lendim"
→ Admin → /exams/[id]/sessions/[sid]/reports/[student] → "Accommodation Uygula (geriye dönük)"
→ Sistem:
  1. Tüm incident'ları yeni threshold'larla re-score eder
  2. Rapor yeniden oluşturulur (persona, risk skoru, flag'ler güncellenir)
  3. Önceki rapor arşivlenir (değişiklik kaydı tutulur)
  4. Admin not ekleyebilir: "ADHD belgesi sunuldu, geriye dönük accommodation uygulandı"
```

#### Re-Scoring Mekanizması

```
Re-score tetikleyicileri:
├── Sınav esnasında accommodation eklendi → anlık re-score
├── Sınav sonrası itiraz → talep üzerine re-score
└── Admin toplu güncelleme → batch re-score

Re-score akışı:
1. Bu öğrencinin tüm incident'larını çek (session_id + student_id) — **dismissed incident'lar hariç** (severity='dismissed' olanlar re-scoring'den muaftır, proctor kararı korunur)
2. Her incident için:
   a. Ham sinyal verilerini al (confidence, duration, frequency)
   b. Yeni threshold'lar ile yeniden değerlendir
   c. Yeni skor < eski severity eşiği → severity düşür
   d. Yeni skor < log_only eşiği → "suppressed_by_accommodation" işaretle
3. Öğrenci risk skorunu yeniden hesapla
4. Persona'yı yeniden sınıflandır
5. Raporu "re-scored" olarak işaretle + değişiklik logu tut
```

**Veritabanı:**

```sql
-- students tablosuna:
ALTER TABLE public.students ADD COLUMN accommodation JSONB DEFAULT NULL;
-- Örnek: {
--   "type": "adhd",
--   "assigned_at": "2026-06-15T14:35:00Z",
--   "assigned_by": "uuid-of-admin-or-proctor",
--   "assigned_during": "exam",  -- "pre_exam" | "exam" | "post_exam"
--   "relaxed_thresholds": {
--     "gaze_diversion_count": 8,
--     "gaze_diversion_angle": 45,
--     "fidgeting": "disabled",
--     "brief_glance_suppression": true
--   }
-- }

-- incidents tablosuna re-scoring desteği:
ALTER TABLE public.incidents
  ADD COLUMN original_severity  TEXT,                -- Re-score öncesi orijinal severity
  ADD COLUMN rescored_at        TIMESTAMPTZ,         -- Ne zaman re-score edildi
  ADD COLUMN rescored_reason    TEXT;                 -- "accommodation_adhd" gibi

-- Re-score audit logu:
CREATE TABLE public.rescore_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES public.exam_sessions(id),
  student_id    UUID NOT NULL REFERENCES public.students(id),
  reason        TEXT NOT NULL,                        -- "accommodation_added", "post_exam_appeal"
  changes       JSONB NOT NULL,                       -- { incidents_affected: 3, severity_lowered: 2, suppressed: 1 }
  performed_by  UUID REFERENCES public.user_profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Raw signal saklama:** Re-scoring'in çalışabilmesi için her incident'ta raw sinyal verileri saklanır:

```sql
ALTER TABLE incidents ADD COLUMN raw_signals JSONB;
-- Örnek: {"object_conf": 0.85, "gaze_conf": 0.72, "gaze_count_5min": 4, "duration_ms": 1200}
```

Bu alan olmadan geriye dönük yeniden puanlama yapılamaz.

**Performans:** Re-scoring async background job olarak çalışır. 50 incident için < 5 saniye. İşlem sırasında `rescore_logs` tablosuna `status: 'in_progress'` yazılır, yeni incident'lar bu öğrenci için kuyrukta bekler (race condition önleme).

#### Preset Accommodation Tipleri

| Tip | Gevşetilen Threshold'lar | Devre Dışı Tespitler |
|-----|------------------------|---------------------|
| **ADHD** | gaze_diversion_count: 3→8, fidgeting: disabled, brief_glance suppression | fidgeting, brief_glance |
| **Anksiyete** | gaze_diversion_count: 3→6, body_movement threshold ×2 | stress_expression (zaten devre dışı) |
| **Fiziksel Engel** | body_lean: disabled, unusual_posture: disabled | body_lean, posture tespitleri |
| **Görme Bozukluğu** | gaze_diversion_angle: 30°→60°, head_turn threshold ×1.5 | — |
| **Custom** | Admin tüm threshold'ları manuel ayarlar | Admin seçer |

---

## 8. Proctor Bildirimleri

### 8.1 Push Notification (PWA Web Push)

**Kurulum:**
1. VAPID key pair oluştur: `npx web-push generate-vapid-keys`
2. Env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` → SSM + CDK + .env.local
3. Service worker'da `push` event handler
4. Client'ta `PushManager.subscribe()` ile izin iste
5. Server'da `web-push` npm paketi ile gönder

**Akış:**
```
Incident oluşur (severity ≥ high)
    ↓
API server → web-push → service worker push event
    ↓
showNotification({
  title: "⚠️ Telefon Tespiti",
  body: "Öğrenci S-042, Salon A, Kamera: FRONT_WIDE",
  icon: "/icons/icon-192.png",
  data: { url: "/exams/{exam_id}/sessions/{session_id}" },
  requireInteraction: true  // Kullanıcı etkileşimine kadar kapanmaz
})
```

**Tarayıcı Desteği:**

| Tarayıcı | Push | Ses |
|----------|------|-----|
| Chrome (Desktop) | ✅ | Sistem varsayılan |
| Chrome (Android) | ✅ | Custom ses destekli |
| Firefox | ✅ | Sistem varsayılan |
| Safari (macOS) | ✅ | Sistem varsayılan |
| Safari (iOS 16.4+) | ✅ (sadece PWA kuruluysa) | Sınırlı |

### 8.2 Sesli Uyarı (In-App Audio Alert)

Push notification'a ek olarak, dashboard açıkken severity'ye göre sesli uyarı:

| Severity | Ses |
|----------|-----|
| `medium` | Kısa "ding" sesi (1 kez) |
| `high` | Alert tonu (2 kez) |
| `critical` | Alarm sesi (tekrarlı, kullanıcı dismiss edene kadar) |

```typescript
// lib/audio/alert-sounds.ts
const ALERT_SOUNDS = {
  medium:   '/sounds/ding.mp3',
  high:     '/sounds/alert.mp3',
  critical: '/sounds/alarm.mp3',
};
```

- Ses dosyaları `public/sounds/` klasöründe
- Kullanıcı ses tercihini `/settings` → `Notifications` tabında ayarlayabilir
- İlk etkileşim olmadan browser ses çalamaz — kullanıcıdan ilk tıklama gerekir (browser policy)

### 8.3 Veritabanı: Push Subscription

```sql
CREATE TABLE public.push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,             -- Client public key
  auth          TEXT NOT NULL,             -- Auth secret
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_push_sub_endpoint ON public.push_subscriptions (endpoint);
CREATE INDEX idx_push_sub_user ON public.push_subscriptions (user_id);
```

---

## 9. Multi-Kamera Füzyon Stratejisi (Phase B)

> **⚠️ Phase B Özelliği.** Phase A'da tek kamera ile çalışılır. Çoklu kamera füzyonu Phase B'de aktif edilecektir. Bu bölümdeki tüm spesifikasyonlar Phase B implementasyonuna yöneliktir.

### 9.1 Mimari: Merkezi İşleme + Koltuk-Bazlı Füzyon

Sınav odası sabit bir ortam — öğrenciler belirli koltuklarda oturur, kameralar hareket etmez. Bu, genel multi-kamera tracking'den çok daha basit bir füzyon stratejisi sağlar.

**Temel prensip:** Açık dünya ReID (re-identification) gerekmez. Koltuk-bazlı uzamsal atama yeterlidir.

```
                ┌──────────┐
                │ Camera 1 │──── RTSP ────┐
                └──────────┘               │
                ┌──────────┐               ▼
                │ Camera 2 │──── RTSP ──► AI Servis (GPU/CPU)
                └──────────┘               │
                ┌──────────┐               │
                │ Camera 3 │──── RTSP ────┘
                └──────────┘
                                           │
                                 ┌─────────┴──────────┐
                                 │                     │
                           ┌─────▼─────┐         ┌────▼─────┐
                           │ Per-Camera │         │Per-Camera│  (paralel)
                           │ Detection  │         │Detection │
                           │ + Tracking │         │+ Tracking│
                           └─────┬─────┘         └────┬─────┘
                                 │                     │
                                 ▼                     ▼
                           ┌───────────────────────────────┐
                           │      FUSION ENGINE            │
                           │  1. Timestamp senkronizasyon  │
                           │  2. Koltuk-bazlı atama        │
                           │  3. Detection birleştirme     │
                           │  4. N-of-M temporal filtering │
                           │  5. Context-aware scoring     │
                           │  6. Alert üretimi             │
                           └──────────────┬────────────────┘
                                          │
                                          ▼
                           ┌───────────────────────────────┐
                           │   WebSocket → Portal Dashboard │
                           └───────────────────────────────┘
```

**Neden merkezi işleme?**
- Az sayıda kamera (3-8/oda) — tek GPU/CPU tüm stream'leri işleyebilir
- Füzyon mantığı tek yerde — senkronizasyon basit
- Edge cihaz maliyeti yok

### 9.2 Kameralar Nasıl Birbirleriyle "İletişim Kurar"?

Kameralar doğrudan birbirleriyle iletişim kurmaz. **Ortak koordinat sistemi** üzerinden birleşirler:

```
ADIM 1: Her kamera kendi piksellerinde çalışır (bağımsız)
─────────────────────────────────────────────────────

  CAM1 (ön):     "Piksel (280, 95)'te bir yüz, bakış sapması var"
  CAM3 (arka):   "Piksel (420, 310)'da bir telefon var"

  Bu iki kamera birbirinden habersiz.


ADIM 2: Her kameranın tespitleri oda koordinatına dönüştürülür
─────────────────────────────────────────────────────

  CAM1: pixel (280, 95) → Homografi H₁ → oda koordinatı (0.34, 0.16)
  CAM3: pixel (420, 310) → Homografi H₃ → oda koordinatı (0.36, 0.16)

  Homografi matrisleri kalibrasyon sırasında (§3.6) bir kez hesaplanır.


ADIM 3: Oda koordinatları koltuk planıyla eşlenir
─────────────────────────────────────────────────────

  Oda planı (kalibrasyondan bilinen):
    Koltuk A3 → (0.35, 0.15)

  CAM1'in tespiti: (0.34, 0.16) → A3'e mesafe: 0.014 → A3 ✓
  CAM3'ün tespiti: (0.36, 0.16) → A3'e mesafe: 0.014 → A3 ✓

  İKİ KAMERA DA A3'E ATANDI — artık birleştirilebilir!


ADIM 4: Fusion engine koltuk bazlı birleştirir
─────────────────────────────────────────────────────

  A3 koltuğu, bu 100ms window'unda:
  ├── CAM1: gaze_diversion, conf 0.82 (CAM1 gaze expertise: 0.95)
  └── CAM3: phone_on_desk, conf 0.88 (CAM3 desk expertise: 0.95)

  Birleşik karar: gaze + phone = CRITICAL alert
```

**Anahtar:** Homografi matrisi sayesinde her kameranın pikselleri aynı "dile" çevrilir. Bu dil = oda koordinat sistemi (0,0)-(1,1). Füzyon engine bu ortak dilde çalışır.

**Arkadan bakan kamera yüz göremiyorsa:**
- O kameranın gaze expertise'i düşüktür (0.10)
- Gaze tespiti yapmaya çalışmaz bile (MediaPipe yüz bulamaz)
- AMA sıra üstünü mükemmel görür → desk expertise yüksek (0.95)
- Bu kameranın "göremediği" şeyler (yüz) zaten diğer kameralar tarafından karşılanır

**Hiçbir kamera yüzü iyi göremiyorsa?**
- Kör nokta analizi (§9.9) bunu oda kurulumunda tespit eder
- Admin'e uyarı: "D4 koltuk — gaze tespiti zayıf, ek kamera önerilir"

### 9.3 Cross-Camera Koltuk Ataması

Her kameranın hangi koltukları gördüğü ve o koltuk için ne kadar güvenilir olduğu önceden hesaplanır (§3.6 kalibrasyon):

```python
# Per-seat camera configuration (kalibrasyon sırasında oluşturulur)
SEAT_CONFIG = {
    "A1": {
        "floor_position": (0.05, 0.15),  # normalized oda koordinatı
        "cameras": {
            "cam_1": { "view_quality": 0.92, "expected_bbox": [100, 200, 300, 500] },
            "cam_2": { "view_quality": 0.55, "expected_bbox": [400, 150, 550, 450] },
            "cam_3": None  # bu koltuk cam_3'ten görünmüyor
        }
    },
    "A2": { ... },
    ...
}
```

**Atama algoritması:**
```
Her frame window'unda (100ms bucket):
1. Her kameradan gelen detection'ları al
2. Her detection'ın bbox merkez noktasını homografi ile oda koordinatına dönüştür
3. Her detection'ı en yakın koltuğa ata (mesafe < threshold)
4. Aynı koltuğa birden fazla kameradan atama gelirse → füzyon (§9.3)
5. Hiçbir koltuğa atanamayan detection → unknown track (muhtemelen gözetmen veya ziyaretçi)
```

### 9.4 Detection Füzyon Algoritması

Aynı koltuk için birden fazla kameradan tespit geldiğinde:

#### View-Quality-Weighted Füzyon (Max Bias)

```
Koltuk A5 için gelen tespitler:
  CAM1 (view_quality: 0.92): phone_detected, confidence 0.85
  CAM2 (view_quality: 0.55): phone_detected, confidence 0.71
  CAM3: bu koltuğu görmüyor

Füzyon formülü:
  weighted_avg = (0.85 × 0.92 + 0.71 × 0.55) / (0.92 + 0.55) = 0.80
  max_confidence = max(0.85, 0.71) = 0.85
  fused = max(0.3 × weighted_avg, max_confidence) = max(0.24, 0.85) = 0.85

Sonuç: phone_detected, fused confidence 0.85 → HIGH alert
```

**Özel durumlar:**

| Senaryo | CAM1 | CAM2 | Füzyon Kararı |
|---------|------|------|--------------|
| İki kamera da tespit etti | phone: 0.85 | phone: 0.71 | phone: 0.85 (max) ✅ |
| Bir kamera tespit etti, diğeri görmedi | phone: 0.85 | nothing | phone: 0.85 (yokluk ≠ yok) ✅ |
| İki kamera farklı şey tespit etti | phone: 0.72 | gaze: 0.65 | İKİ AYRI tespit — her ikisi de kaydedilir |
| Çelişki: present vs absent | person: 0.95 | empty_seat | position_uncertainty → warn + her iki frame evidence |

**Kritik kural:** Bir kameranın bir şeyi **görmemesi**, o şeyin olmadığı anlamına gelmez (occlusion, açı). Bu yüzden "max-bias" kullanılır.

### 9.5 Zamansal Senkronizasyon

Kameralar farklı FPS ve ağ gecikmelerine sahip olabilir:

**Timestamp Bucketing (önerilen):**
```
SYNC_WINDOW_MS = 100  # 100ms bucket

frame timestamp → bucket_key = timestamp_ms // 100

Aynı bucket'a düşen tüm kamera tespitleri "eşzamanlı" kabul edilir.
```

**Saat senkronizasyonu:** Tüm kamera node'ları NTP ile < 10ms doğruluğa senkronize.

**Latency bütçesi:**
```
Kamera capture:     ~33ms (30 FPS)
Ağ transferi:       ~5-20ms (lokal ağ, metadata)
Detection:          ~30-50ms (YOLOv8)
Füzyon:             ~10ms
Toplam:             ~80-120ms
Kabul edilebilir:   < 500ms (insan tepki süresi)
```

### 9.6 N-of-M Temporal Smoothing (False Positive Azaltma)

Tek frame'deki tespit güvenilmez olabilir. Alert üretmeden önce temporal doğrulama:

```
Kural: Tespit, son M frame'in en az N'inde görülmelidir.

Örnek (5 FPS, M=5 frame = 1 saniye):
  Frame 1: phone_detected ✓
  Frame 2: nothing ✗
  Frame 3: phone_detected ✓
  Frame 4: phone_detected ✓
  Frame 5: nothing ✗

  3/5 = %60 → N=3 threshold aşıldı → ALERT ÜRET

Konfigürasyon:
  phone_detected:    N=2, M=4  (düşük N — telefon kritik, hızlı alert)
  gaze_diversion:    N=3, M=5  (orta — bakış sapması doğrulanmalı)
  head_turn:         N=3, M=5
  empty_seat:        N=4, M=6  (yüksek N — öğrenci gerçekten kalktı mı?)
  earbuds_detected:  N=3, M=5
```

**Bu strateji FP'yi %40-50 azaltır** (Hussain et al. 2021).

### 9.7 Senkronize Davranış Tespiti (Cross-Student)

İki komşu öğrencinin aynı anda aynı yöne bakması → kopya şüphesi.

```
İki öğrenci A3 ve A4 için:
  t=14:03:22 — A3: gaze_right (yaw +35°)
  t=14:03:23 — A4: gaze_left (yaw -30°)  ← birbirlerine bakıyorlar!

  Temporal window: 2s
  Yön korelasyonu: A3 sağa + A4 sola = birbirlerine yönelik ✓

  Bu AYRI AYRI low olabilir ama BİRLİKTE → medium/high

Formül:
  sync_score = base_score × correlation_multiplier
  correlation_multiplier:
    - Aynı yöne bakma (ikisi de sağa): 1.5×
    - Birbirine bakma (biri sağa, biri sola, komşu): 2.5×
    - Senkronize (< 2s fark): ek 1.5× çarpan
```

Bu analiz multi-kamera füzyonun en güçlü sinyallerinden biri — tek kamera bunu yapamaz.

### 9.8 Çelişki Yönetimi

| Çelişki | Karar | Aksiyon |
|---------|-------|---------|
| CAM1: present, CAM2: absent | `position_uncertainty` | Warn + her iki frame evidence |
| CAM1: phone 0.7, CAM2: no_phone | phone kabul (yokluk ≠ yok) | Alert (max-bias) |
| CAM1: gaze_left, CAM2: gaze_right (aynı öğrenci) | Kalibrasyon hatası olabilir | Log + admin uyarı |
| CAM1: student_A at seat_3, CAM2: student_B at seat_3 | Track karışıklığı | En yüksek view_quality kameranın atamasını kabul et |

### 9.9 Kamera Kalite Skoru (Runtime)

Her kameranın güvenilirliği sürekli izlenir ve füzyon ağırlıklarına yansır:

| Faktör | Ağırlık | Açıklama |
|--------|---------|----------|
| FPS stabilitesi | %30 | Düşük/değişken FPS = düşük güvenilirlik |
| Aydınlatma skoru | %30 | Çok karanlık/parlak = düşük detection kalitesi |
| Çözünürlük | %20 | Düşük çözünürlük = küçük nesneler kaçırılır |
| Detection confidence avg (son 5dk) | %20 | Sürekli düşük confidence = sorunlu kamera |

```
quality_score = 0.3×fps_score + 0.3×brightness_score + 0.2×resolution_score + 0.2×avg_confidence

quality_score < 0.4 → admin alert: "CAM2 kalitesi düşük"
quality_score < 0.2 → kamera füzyondan çıkarılır, secondary devralır
```

### 9.10 Kamera Uzmanlık Alanları (Detection Specialization)

Her kameranın açısı ve pozisyonu, belirli tespit tiplerinde daha güvenilir olmasını sağlar. Aynı koltuk için farklı kameralar farklı "uzmanlık alanlarına" sahiptir.

#### Uzmanlık Matrisi (Per-Camera, Per-Seat)

```
Koltuk A3 için kamera uzmanlıkları:

                    │ Yüz/Gaze │ Sıra Üstü │ El/Kucak │ Vücut Yönü │
CAM1 (FRONT_WIDE)   │ ★★★ 0.95 │ ★☆☆ 0.20 │ ★☆☆ 0.15│ ★★☆ 0.70  │
CAM2 (SIDE_LEFT)    │ ★★☆ 0.60 │ ★★☆ 0.65 │ ★★★ 0.85│ ★★★ 0.90  │
CAM3 (REAR_DIAG)    │ ★☆☆ 0.10 │ ★★★ 0.95 │ ★★☆ 0.60│ ★☆☆ 0.30  │
```

**Sonuç:** Tespit tipine göre farklı kameranın verisi ağırlıklandırılır:
- **Gaze/bakış analizi** → CAM1'e güven (öğrencinin yüzünü görüyor)
- **Sıra üstü nesne tespiti** → CAM3'e güven (sıra yüzeyini net görüyor)
- **El/kucak aktivitesi** → CAM2'ye güven (yandan kucağı görüyor)

#### Uzmanlık-Bazlı Füzyon

```
Senaryo: A3 koltuğundaki öğrenci

CAM1 (FRONT): gaze_diversion tespiti, confidence 0.82
  → CAM1 gaze uzmanlığı: 0.95
  → Adjusted score: 0.82 × 0.95 = 0.78 ✓ (güvenilir)

CAM3 (REAR): phone_on_desk tespiti, confidence 0.88
  → CAM3 sıra üstü uzmanlığı: 0.95
  → Adjusted score: 0.88 × 0.95 = 0.84 ✓ (güvenilir)

CAM1 (FRONT): phone_on_desk → tespitsiz (sıra arkası kapatıyor)
  → CAM1 sıra üstü uzmanlığı: 0.20
  → Bu kameranın "görememesi" bilgi taşımaz (düşük uzmanlık)

Füzyon sonucu:
  gaze_diversion: 0.78 (CAM1 uzman, güvenilir)
  phone_on_desk: 0.84 (CAM3 uzman, güvenilir)
  Kombine risk: gaze + phone = CRITICAL

CAM1 tek başına olsaydı:
  Sadece gaze_diversion görecekti → MEDIUM
  Telefonu hiç görmeyecekti (occluded) → MISS

Multi-kamera sayesinde:
  gaze + phone birlikte yakalandı → CRITICAL
```

#### Uzmanlık Hesaplama (Kalibrasyon Sırasında)

Oda kurulumunda her kamera-koltuk kombinasyonu için otomatik hesaplanır:

```
Girdiler:
  - Kameranın pozisyonu ve yönü (oda planından)
  - Koltuğun pozisyonu
  - Kameranın koltuğa olan açısı ve mesafesi

Hesaplama:
  gaze_expertise:
    → Kamera öğrencinin yüzüne doğru mu bakıyor?
    → Açı < 45° = yüksek, 45-90° = orta, > 90° = düşük (arka)

  desk_surface_expertise:
    → Kamera sıra yüzeyini görebiliyor mu?
    → Üstten/çaprazdan bakış = yüksek, aynı seviye = düşük, alttan = sıfır

  lap_expertise:
    → Kamera öğrencinin kucağını görebiliyor mu?
    → Yandan bakış = yüksek, önden = orta (sıra kapatır), arkadan = düşük

  body_orientation_expertise:
    → Gövde dönüşünü algılayabiliyor mu?
    → Yandan = yüksek, önden = orta, arkadan = düşük
```

#### DB: Uzmanlık Verisi

```sql
-- camera_calibrations tablosuna ek:
ALTER TABLE public.camera_calibrations
  ADD COLUMN seat_expertise JSONB DEFAULT '{}';
-- Örnek:
-- {
--   "A3": {
--     "gaze": 0.95,
--     "desk_surface": 0.20,
--     "lap": 0.15,
--     "body_orientation": 0.70
--   },
--   "A4": { ... }
-- }
```

#### Kör Nokta Analizi

Füzyon engine, tüm kameraların uzmanlık skorlarını birleştirerek **kör noktaları** tespit eder:

```
Koltuk A3 — Birleşik kapsama:
  Gaze:        max(0.95, 0.60, 0.10) = 0.95 ✅ İyi
  Sıra üstü:   max(0.20, 0.65, 0.95) = 0.95 ✅ İyi
  Kucak:       max(0.15, 0.85, 0.60) = 0.85 ✅ İyi
  Vücut yönü:  max(0.70, 0.90, 0.30) = 0.90 ✅ İyi

Koltuk D4 — Birleşik kapsama:
  Gaze:        max(0.40, 0.30) = 0.40 ⚠️ Zayıf — hiçbir kamera yüzü iyi görmüyor
  Sıra üstü:   max(0.80, 0.20) = 0.80 ✅ İyi
  Kucak:       max(0.10, 0.15) = 0.15 🔴 Kör nokta — kucak hiçbir kameradan görünmüyor
  Vücut yönü:  max(0.50, 0.45) = 0.50 ⚠️ Orta

Admin uyarısı: "D4 koltuğunda kucak kör noktası var — ek kamera önerilir"
```

Bu kör nokta analizi oda kurulumunda admin'e gösterilir → eksik kamera ihtiyacı önceden tespit edilir.

### 9.11 Füzyon Konfigürasyonu

```json
{
  "fusion": {
    "sync_window_ms": 100,
    "min_confidence": 0.50,
    "spatial_match_threshold": 0.08,
    "temporal_smoothing": {
      "phone_detected":   { "n": 2, "m": 4 },
      "gaze_diversion":   { "n": 3, "m": 5 },
      "head_turn":        { "n": 3, "m": 5 },
      "empty_seat":       { "n": 4, "m": 6 },
      "earbuds_detected": { "n": 3, "m": 5 }
    },
    "cross_student_sync_window_s": 2,
    "cross_student_same_direction_multiplier": 1.5,
    "cross_student_facing_each_other_multiplier": 2.5
  }
}
```

Kalite skoru < 0.4 → admin bilgilendirilir (PRD-007 monitor card + PRD-016 notification).

---

## 10. Dashboard Sayfaları

Feature flag `true` olduğunda eklenen route'lar:

```
/exams                        → Sınavlar listesi (takvim + liste görünümü)
/exams/new                    → Sınav oluşturma wizard'ı (5 adım)
/exams/[id]                   → Sınav detay (oturumlar, gözetmenler, öğrenciler)
/exams/[id]/edit              → Sınav düzenleme
/exams/[id]/sessions/[sid]              → Canlı izleme: kamera grid + alert panel
/exams/[id]/sessions/[sid]/incidents    → Olay inceleme
/exams/[id]/sessions/[sid]/report       → Sınav sonrası rapor
/exams/[id]/sessions/[sid]/kiosk        → Tablet kiosk (öğrenci self-service çıkış)
/rooms                        → Sınav odaları yönetimi (CRUD + kamera yönetimi)
/rooms/[id]                   → Oda detay: kameralar, oturma planı
/rooms/[id]/test              → Kamera test modu (sınav olmadan canlı AI test)
/students                     → Öğrenci havuzu (import, CRUD, transfer)
/ai/training                  → Fine-tuning arayüzü (model eğitim, deploy)
```

> **Not:** Route'lar PRD-000 §7 ile senkronizedir. Next.js App Router'da `app/(protected)/` altındadır.

#### İlk Kurulum Wizard'ı (`/setup`)

İlk kez giriş yapan admin (henüz hiç oda oluşturulmamış) otomatik olarak `/setup` sayfasına yönlendirilir:

**Adımlar:**
1. **Hoş geldiniz** — Sistem tanıtımı (30s video veya 3 slayt)
2. **Oda oluştur** — İsim, kapasite, konum
3. **Kamera ekle** — Tip seç (IP/USB/Phone), bağlantı test et, canlı önizleme
4. **Koltuk planı** — Grid oluşturucu ile koltukları işaretle (§3.6 kalibrasyon)
5. **Algılama testi** — 30 saniyelik canlı test: AI algılama çalışıyor mu? FPS yeterli mi?
6. **Tamamlandı** — 'İlk sınavınızı oluşturmaya hazırsınız!' + link

Wizard tamamlandıktan sonra bir daha gösterilmez. Admin isterse `/settings` → 'Kurulum wizard'ını tekrar çalıştır' ile erişebilir.

### 10.1 Canlı İzleme Sayfası (`/exams/[id]/sessions/[sid]`)

```
┌─────────────────────────────────────────────────────┐
│ CMPE 492 Final — Lab A — 14:00-16:00 — ● ACTIVE    │
├──────────────────────────┬──────────────────────────┤
│                          │  ALERTS (real-time)      │
│   Camera Grid            │  ┌────────────────────┐  │
│   ┌─────┐ ┌─────┐       │  │ 🔴 Phone detected  │  │
│   │CAM1 │ │CAM2 │       │  │ S-042 | FRONT_WIDE │  │
│   │     │ │     │       │  │ 14:23:15 | conf 0.9│  │
│   └─────┘ └─────┘       │  ├────────────────────┤  │
│   ┌─────┐                │  │ 🟡 Gaze diversion  │  │
│   │CAM3 │                │  │ S-017 | SIDE_LEFT  │  │
│   │     │                │  │ 14:22:48 | conf 0.7│  │
│   └─────┘                │  └────────────────────┘  │
│                          │                          │
├──────────────────────────┴──────────────────────────┤
│  Student Risk Overview (bar chart / heatmap)         │
│  S-001 ██░░░ 0.2  S-042 █████ 0.9  S-017 ███░░ 0.6 │
└─────────────────────────────────────────────────────┘
```

#### Dashboard Boş Durum (Aktif Sınav Yok)

`/dashboard` sayfası aktif oturum yokken şunları gösterir:
- **Yaklaşan sınavlar kartı:** Sonraki 7 gün içindeki planlanmış sınavlar (tarih, oda, gözetmen)
- **Son sınav özeti:** Son tamamlanan sınavın kısa raporu (toplam incident, ortalama risk)
- **Sistem durumu:** Kamera health kartları (tüm odalar), AI servis durumu
- **Hızlı aksiyonlar:** 'Yeni Sınav Oluştur', 'Prova Başlat', 'Raporları Gör'
- Aktif oturum yoksa: 'Şu anda aktif sınav yok' bilgi kartı (gri, sakin)

### 10.2 Monitor Dashboard Entegrasyonu (PRD-007)
Flag `true` olduğunda:
- Camera module health card aktif → bağlı kamera sayısı, FPS, AI engine durumu
- "Active Sessions" stat kartı eklenir

---

## 11. API Route Haritası

```
-- Sınav Odaları (Admin)
GET    /api/rooms
POST   /api/rooms
GET    /api/rooms/[id]
PUT    /api/rooms/[id]
DELETE /api/rooms/[id]

-- Kameralar (Admin)
GET    /api/rooms/[id]/cameras
POST   /api/rooms/[id]/cameras
PUT    /api/cameras/[id]
DELETE /api/cameras/[id]

-- Öğrenciler (Admin)
GET    /api/students              → ?room_id filter
POST   /api/students              → Tekil ekleme
POST   /api/students/import       → Toplu yükleme (CSV/XLSX/PDF)
PUT    /api/students/[id]
DELETE /api/students/[id]
POST   /api/students/transfer     → Sınıflar arası transfer

-- Sınavlar (Admin)
GET    /api/exams                 → Sınav listesi (?status filter)
POST   /api/exams                 → Yeni sınav oluştur (wizard verisi)
GET    /api/exams/[id]            → Sınav detay (oturumlar, gözetmenler, öğrenciler dahil)
PUT    /api/exams/[id]            → Sınav güncelle
DELETE /api/exams/[id]            → Sınav sil/iptal et

-- Sınav Oturumları (Admin)
GET    /api/exams/[id]/sessions
POST   /api/exams/[id]/sessions   → Oturum ekle (oda + gözetmen ata)
GET    /api/sessions/[id]
PUT    /api/sessions/[id]         → start, pause, end
DELETE /api/sessions/[id]

-- Gözetmen Ataması
POST   /api/sessions/[id]/proctors     → Gözetmen ata
DELETE /api/sessions/[id]/proctors/[uid] → Gözetmen çıkar

-- Öğrenci-Oturum Ataması
GET    /api/sessions/[id]/students     → Oturumdaki öğrenciler
POST   /api/sessions/[id]/students     → Öğrenci ata (tekil veya toplu)
DELETE /api/sessions/[id]/students/[sid] → Öğrenci çıkar

-- Olaylar (Incidents)
GET    /api/sessions/[id]/incidents  → ?severity, ?student_id filter
POST   /api/sessions/[id]/incidents  → AI servisten gelen incident
PUT    /api/incidents/[id]           → Review (mark as reviewed + note)

-- Push Notifications
POST   /api/push/subscribe        → Push subscription kaydet
DELETE /api/push/subscribe        → Subscription sil
POST   /api/push/test             → Test notification gönder

-- AI Model Yönetimi (Admin)
POST   /api/ai/training           → Yeni eğitim job'ı başlat
GET    /api/ai/training            → Eğitim job'ları listele
GET    /api/ai/training/[id]       → Job durumu + metrikler
POST   /api/ai/models/[id]/deploy  → Modeli aktif yap
POST   /api/ai/models/[id]/test    → Mock video ile test
GET    /api/ai/models              → Tüm modeller

-- Evidence Temizlik
POST   /api/evidence/purge        → 90 günden eski evidence sil

-- AI Servis WebSocket
WS     /ws/sessions/[id]/detections → JSON detection stream
WS     /ws/sessions/[id]/video      → Annotated JPEG frame stream (MJPEG-over-WS)
```

---

## 12. AI Servis (Python — ai-service/)

### 12.1 Klasör Yapısı

```
ai-service/
├── Dockerfile
├── requirements.txt
├── config.yaml                    # FPS, thresholds, model paths
├── src/
│   ├── main.py                    # FastAPI app + WebSocket endpoints
│   ├── ingestion/
│   │   └── frame_reader.py        # RTSP → frame buffer
│   ├── detection/
│   │   ├── object_detector.py     # YOLOv8n wrapper
│   │   └── tracker.py            # BoT-SORT wrapper
│   ├── analysis/
│   │   ├── gaze_tracker.py       # MediaPipe Face Mesh
│   │   ├── risk_scorer.py        # Rule-based scoring engine
│   │   └── incident_factory.py   # Incident oluşturma + evidence kaydetme
│   ├── fusion/
│   │   └── multi_view_fusion.py  # Phase B — çoklu kamera füzyonu
│   └── api/
│       ├── ws_handler.py          # WebSocket session management
│       └── rest_endpoints.py     # Health check, status
├── models/
│   └── yolov8n.pt                 # Pre-trained weights
├── tests/
│   ├── test_detector.py
│   ├── test_tracker.py
│   ├── mock_videos/              # Test için mock video dosyaları
│   └── conftest.py
└── docker-compose.yml            # Local development
```

### 12.2 Bağımlılıklar

```
# requirements.txt
ultralytics>=8.0.0       # YOLOv8 + BoT-SORT
opencv-python-headless   # Video processing (GUI gereksiz)
mediapipe>=0.10.0        # Face Mesh + Gaze
fastapi>=0.100.0         # API framework
uvicorn[standard]        # ASGI server
websockets               # WebSocket desteği
python-multipart         # File upload
numpy                    # Array operations
httpx                    # Supabase API calls
```

### 12.3 Docker

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ /app/src/
COPY models/ /app/models/
COPY config.yaml /app/

WORKDIR /app
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 12.4 WebSocket Mesaj Formatı

**Server → Client (Detection Event):**
```json
{
  "type": "detection",
  "session_id": "uuid",
  "timestamp": "2026-03-19T14:23:15.000Z",
  "track_id": 42,
  "student_id": "S-042",
  "detections": [
    {
      "type": "phone_detected",
      "confidence": 0.91,
      "bbox": [0.3, 0.4, 0.1, 0.15],
      "camera_id": "uuid"
    }
  ],
  "risk_score": 0.85,
  "severity": "high",
  "triggered_rules": ["phone_detected"],
  "evidence_path": "evidence/session-id/frame-14231500.jpg"
}
```

**Server → Client (Status Update):**
```json
{
  "type": "status",
  "cameras": [
    { "id": "uuid", "label": "FRONT_WIDE", "fps": 8.2, "quality": 0.92, "status": "active" }
  ],
  "active_tracks": 24,
  "processing_fps": 7.1
}
```

**Client → Server (Control Command):**
```json
{
  "type": "command",
  "action": "set_threshold",
  "data": { "phone_detected": 0.75, "gaze_diversion_count": 5 }
}
```

### 12.5 Kamera Sağlık İzleme & Hata Yönetimi

#### Kamera Health Metrics (sürekli izleme)

AI servisi her kamera için aşağıdaki metrikleri sürekli izler:

| Metrik | Ölçüm | Normal | Uyarı | Kritik |
|--------|-------|--------|-------|--------|
| **FPS** | Frame/saniye | ≥ 4 | 2-4 | < 2 |
| **Blur skoru** | Laplacian variance | > 100 | 50-100 | < 50 |
| **Parlaklık** | Ortalama piksel değeri | 60-200 | 30-60 veya 200-240 | < 30 veya > 240 |
| **Bağlantı** | RTSP/HTTP ping | Connected | Intermittent | Disconnected |
| **Çerçeve bozulması** | Artifact detection | Clean | Minor | Corrupt |

#### Blur/Odak Algılama

```python
# Laplacian variance — düşük değer = bulanık görüntü
blur_score = cv2.Laplacian(gray_frame, cv2.CV_64F).var()

if blur_score < 50:   → CRITICAL: "CAM1 odağı tamamen bozuldu"
if blur_score < 100:  → WARNING:  "CAM1 odağı zayıflıyor"
if blur_score >= 100: → NORMAL
```

**Tetiklenen aksiyonlar:**

| Durum | Proctor Bildirim | Sistem Aksiyonu |
|-------|-----------------|-----------------|
| Odak bozuldu (blur < 50) | 🔴 Push: "CAM1 odağı bozuldu — görüntü alınamıyor" | Bu kameranın tespitlerini DURAKLAT, secondary devral |
| Odak zayıf (blur 50-100) | 🟡 Dashboard uyarı: "CAM1 odağı zayıflıyor" | Kalite skoru düşür, detection threshold'u artır |
| Karanlık (brightness < 30) | 🔴 Push: "CAM1 çok karanlık — aydınlatma yetersiz" | Tespitler güvenilmez, secondary devral |
| Aşırı parlak (brightness > 240) | 🟡 "CAM1 aşırı parlak — lens flare olabilir" | Kalite skoru düşür |
| FPS düşük (< 2) | 🔴 "CAM1 görüntü akışı çok yavaş" | Frame sampling'i ayarla veya duraklat |
| Bağlantı koptu | 🔴 "CAM1 bağlantısı kesildi" | 3× retry → secondary devral → admin alert |

#### Kamera Sağlık Dashboard'u

Monitor sayfasında (PRD-007) kamera modülü aktifken her kameranın sağlık durumu gösterilir:

```
┌──────────────────────────────────────────────┐
│  Kamera Sağlığı — Lab A                      │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ CAM1     │ │ CAM2     │ │ CAM3     │     │
│  │ FRONT    │ │ SIDE_L   │ │ REAR     │     │
│  │ ● 8 FPS  │ │ ● 7 FPS  │ │ ⚠ 3 FPS  │     │
│  │ Blur: 145│ │ Blur: 120│ │ Blur: 42 │     │
│  │ 🟢 OK    │ │ 🟢 OK    │ │ 🔴 BLUR  │     │
│  └──────────┘ └──────────┘ └──────────┘     │
└──────────────────────────────────────────────┘
```

#### Kapsamlı Error Recovery

| Hata | Algılama | Otomatik Aksiyon | Proctor Aksiyonu |
|------|----------|-----------------|-----------------|
| **Kamera bağlantısı koptu** | RTSP timeout 5s | 3× retry (exp backoff: 2s, 4s, 8s) → secondary devral | Push notification + "Kamerayı kontrol edin" |
| **Odak/blur bozuldu** | Laplacian < 50 (5 frame üst üste) | Tespitler duraklat, secondary devral | Push: "Kamera odağını düzeltin" |
| **Karanlık/parlak** | Brightness < 30 veya > 240 | Kalite skoru düşür, threshold artır | Uyarı: "Aydınlatma sorunlu" |
| **AI servisi çöktü** | Health check fail (3× miss) | ECS auto-restart, WS reconnect, buffer replay | Push: "AI servisi yeniden başlatılıyor" |
| **Supabase erişilemez** | DB insert fail | Evidence local buffer'a yaz, bağlantı gelince flush | Dashboard'da "DB bağlantı sorunu" banner |
| **FPS düşüşü** | FPS < 2 (10s sürekli) | Frame sampling azalt, non-critical detection'ları atla | Sarı uyarı: "İşleme yavaşladı" |
| **Tüm kameralar çöktü** | Hiçbir kameradan frame yok | Sınavı otomatik DURAKLAT | 🔴 Kritik: "Tüm kameralar devre dışı — sınav duraklatıldı" |
| **Disk/Storage dolu** | Evidence yazma fail | Evidence kaydetmeyi durdur, sadece incident logla | Uyarı: "Storage dolu — evidence kaydedilemiyor" |

---

## 13. Test Stratejisi

### 13.1 Mock Video Dosyaları
`ai-service/tests/mock_videos/` klasöründe test videoları:
- `empty_classroom.mp4` — boş sınıf (baseline, false positive testi)
- `normal_exam.mp4` — normal sınav ortamı (negatif test)
- `phone_usage.mp4` — telefon kullanan öğrenci
- `gaze_diversion.mp4` — bakış sapması senaryosu
- `multi_student.mp4` — çoklu öğrenci tracking testi

### 13.2 Test Katmanları

| Katman | Araç | Kapsam |
|--------|------|--------|
| Unit | pytest | Detector, tracker, scorer ayrı ayrı |
| Integration | pytest + mock RTSP | Full pipeline, frame → incident |
| E2E | Playwright + mock WS | Dashboard + alert akışı |

---

## 14. Veri Seti Stratejisi & Model Yönetimi

> **📌 Detaylı veri pipeline'ı:** Harici veri setlerinin edinimi, format dönüşümü, temizleme, birleştirme, augmentation, dataset versiyonlama ve end-to-end eğitim pipeline'ı **PRD-017**'de tanımlanmıştır. Bu bölüm (§14) genel strateji ve karar gerekçelerini içerir; PRD-017 implementasyon detaylarını içerir.

### 14.1 Zero-Training Yaklaşımı (Phase A — Day 1)

Phase A'da **hiçbir custom eğitim yapmadan** çalışacak tespitler:

| Tespit | Model | Kaynak | Custom Eğitim |
|--------|-------|--------|---------------|
| Kişi tespiti (person) | YOLOv8n | COCO pre-trained (class #0) | ❌ Gereksiz |
| Telefon tespiti (cell phone) | YOLOv8n | COCO pre-trained (class #67) | ❌ Gereksiz |
| Bakış sapması (gaze) | MediaPipe Face Mesh | Google pre-trained | ❌ Gereksiz |
| Kafa dönüşü (head turn) | MediaPipe Face Mesh | Google pre-trained | ❌ Gereksiz |
| Boş koltuk (empty seat) | YOLOv8n | Person detection'ın tersi (kural) | ❌ Gereksiz |
| Kişi takibi (tracking) | BoT-SORT | Ultralytics built-in | ❌ Gereksiz |

**Sonuç:** Phase A ilk gün 6 tespit tipi ile çalışır. Sıfır annotation, sıfır eğitim.

**COCO Domain Bias Uyarısı:**
COCO dataset'indeki 'cell phone' class'ı sokak/ofis ortamında eğitilmiştir. Sınıf ortamında farklılıklar:
- Öğrenci telefonu masanın altında tutar (kısmen örtülü) → COCO'da nadir
- Telefon kılıfı renkleri masa rengine yakın olabilir → düşük kontrast
- Telefon ekranı kapalı olabilir → parlak ekran yerine mat yüzey

**Beklenen etki:** COCO confidence 0.65 threshold'unda sınıf ortamında gerçek precision %70-80 (lab'daki %92 değil).

**Çözüm:** Phase A deploy sonrası 50 sınav verisi ile custom fine-tune (§14.5). O zamana kadar düşük confidence uyarılarını (0.50-0.65) 'MEDIUM (onay bekle)' olarak göster.

### 14.2 Harici Hazır Veri Setleri (ileride custom tespitler için)

Kulaklık ve kağıt/not tespiti için dışarıdan alınabilecek kaynaklar:

| Kaynak | İçerik | Lisans | URL |
|--------|--------|--------|-----|
| **Roboflow Universe** | "earbuds detection" — 2000+ annotated | Açık (çoğu CC) | universe.roboflow.com |
| **Open Images V7** | "Headphones" sınıfı, 5000+ görsel | CC-BY-4.0 | storage.googleapis.com/openimages |
| **Kaggle** | "exam cheating detection" veri setleri | Çeşitli | kaggle.com/datasets |
| **COCO Dataset** | "book" sınıfı (kağıt/not yakın proxy) | CC-BY-4.0 | cocodataset.org |

**Strateji:** Önce Roboflow Universe'den hazır annotated dataset indir → doğrudan YOLOv8 fine-tune → custom eğitim süresi minimize.

> **Detay:** Spesifik dataset seçim kriterleri, indirme yöntemleri, format dönüşüm pipeline'ı ve kalite doğrulama süreçleri → **PRD-017 §4-6**.

### 14.3 Kalibrasyon & Threshold Tuning (İlk Kurulum)

Sistem kurulduktan sonra her sınıf için yapılması gereken ayarlar:

| Parametre | Varsayılan | Nasıl Ayarlanır |
|-----------|-----------|-----------------|
| `confidence_threshold` | 0.65 | Test modunda çalıştır, false positive sayısına göre artır/azalt |
| `gaze_diversion_angle` | 30° | Sınıf düzenine göre: kağıt pozisyonu, tahta açısı |
| `gaze_diversion_count` | 3 / 5 dakika | Sınav tipine göre: çoktan seçmeli vs açık uçlu |
| `head_turn_threshold` | 45° | Sınıf genişliğine göre |
| `risk_escalation_window` | 5 dakika | Sınav süresine göre |

**Admin UI:** `/exams/new` sayfasında "Detection Settings" bölümünde slider'lar ile ayarlanabilir. Varsayılan preset'ler sunulur: "Strict", "Normal", "Relaxed".

### 14.4 Fine-Tuning Arayüzü

Admin'lerin kendi veri setleriyle model eğitebileceği bir ekran:

**Route:** `/ai/training` (admin only)

**Akış:**
```
1. Admin "New Training Job" tıklar
2. Annotated veri seti yükler (Roboflow export veya YOLO format ZIP)
   - Desteklenen formatlar: YOLOv8 format (images/ + labels/ + data.yaml)
   - Alternatif: Roboflow project URL → otomatik import
3. Eğitim parametrelerini seçer:
   - Base model: YOLOv8n (nano) / YOLOv8s (small)
   - Epochs: 25 / 50 / 100
   - Image size: 640
4. "Start Training" → AI serviste eğitim başlar (background job)
5. İlerleme: progress bar + loss chart (WebSocket ile canlı)
6. Tamamlandığında:
   - mAP, precision, recall metrikleri gösterilir
   - "Deploy Model" butonu → aktif modeli değiştirir
   - "Test Model" butonu → mock video ile test çalıştırır
7. Model versiyonlama: önceki modellere geri dönülebilir
```

**Veritabanı:**
```sql
CREATE TABLE public.ai_models (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,               -- "Custom Earbuds Detector v2"
  base_model    TEXT NOT NULL DEFAULT 'yolov8n', -- yolov8n, yolov8s
  model_path    TEXT,                        -- Supabase Storage path (weights)
  status        TEXT NOT NULL DEFAULT 'training'
                CHECK (status IN ('training', 'ready', 'deployed', 'archived')),
  metrics       JSONB DEFAULT '{}',          -- { mAP: 0.89, precision: 0.91, recall: 0.85 }
  epochs        INTEGER,
  dataset_id    UUID REFERENCES public.datasets(id), -- Eğitim verisi kaynağı (PRD-017 datasets tablosu)
  trained_by    UUID REFERENCES public.user_profiles(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  deployed_at   TIMESTAMPTZ
);
```

**API:**
```
POST   /api/ai/training           → Yeni eğitim job'ı başlat
GET    /api/ai/training            → Eğitim job'ları listele
GET    /api/ai/training/[id]       → Job durumu + metrikler
POST   /api/ai/models/[id]/deploy  → Modeli aktif yap
POST   /api/ai/models/[id]/test    → Mock video ile test
GET    /api/ai/models              → Tüm modeller
```

**Not:** Fine-tuning opsiyoneldir. Phase A'da pre-trained modellerle çalışılır. Bu arayüz Phase A.1 veya Phase B'de eklenir.

> **Detay:** Eğitim verisi hazırlama pipeline'ı (indirme → dönüşüm → temizleme → birleştirme → augmentation → split), dataset versiyonlama ve kabul kriterleri → **PRD-017 §5-13**.

**Eğitim compute seçenekleri (üniversite bitirme projesi bütçesi):**

| Platform | GPU | Maliyet | Süre (YOLOv8n, 500 görsel, 50 epoch) | Öneri |
|----------|-----|---------|--------------------------------------|-------|
| **Google Colab (free)** | T4 (15 GB) | $0 | ~15-20 dk | Phase A.1 için ideal |
| **Google Colab Pro** | T4/V100 | $10/ay | ~8-10 dk | Sık eğitim gerekirse |
| **Kaggle Notebooks** | P100 (16 GB) | $0 (30 saat/hafta) | ~12-15 dk | Colab alternatifi |
| **Üniversite GPU sunucusu** | Değişken | $0 | Değişken | Varsa en iyi seçenek |
| **AWS g4dn.xlarge** | T4 | ~$0.53/saat | ~15 dk → ~$0.15 | Bütçe varsa |

**Öneri:** Phase A'da eğitim yapmayın (COCO yeterli). Phase A.1'de Colab/Kaggle (ücretsiz) ile fine-tune edin. AI servis ECS'de eğitim çalıştırmayın — CPU-only, çok yavaş.

### 14.5 Phase A → Phase B Veri Toplama Pipeline'ı

Phase A çalışırken otomatik olarak eğitim verisi toplanır:

**Otomatik etiketleme kaynakları:**
| Kaynak | Etiket | Güvenilirlik |
|--------|--------|-------------|
| Proctor 'dismiss' tıkladı | Yanlış pozitif (negative sample) | Yüksek |
| Proctor 'flag' tıkladı | Doğru pozitif (positive sample) | Yüksek |
| `proctor_decision = 'violation'` | Kesin pozitif | Çok yüksek |
| `proctor_decision = 'clean'` | Kesin negatif | Çok yüksek |
| AI tespit + proctor tepki yok | Belirsiz (etiketlenecek) | Düşük |

**Pipeline:**
1. Her sınav sonunda `export_training_data` job çalışır
2. Dismiss edilen incident'ların frame'leri → `training_data/negatives/` klasörüne
3. Flag/violation incident'ların frame'leri → `training_data/positives/` klasörüne
4. **Gerçekçi hedef:** 5 prova sınavı + 10 dakikalık kontrollü test videoları → ~200+ annotated frame
5. İlk fine-tune Colab/Kaggle'da çalıştırılır → sonuç yeterli ise deploy
6. Süreç tekrarlanır: her sınav sonrası veri birikir, model iteratif iyileşir

**Etiketleme kalite kontrolü:**
- Proctor dismiss/flag kararları **yüksek güvenilir** kabul edilir ama %100 değildir — her 20 karardan 1-2'si hatalı olabilir
- Tepki verilmemiş incident'lar → ayrı klasörde, manuel review gerekir (kullanılmadan önce doğrulanmalı)
- **Minimum eğitim seti (ilk fine-tune):** 200 positive + 200 negative frame (detection type başına)
- **İdeal eğitim seti (güçlü model):** 500+ positive + 500+ negative frame — iteratif olarak ulaşılır
- **Bootstrap sorunu:** İlk sınavlarda model kötü → çoğu dismiss (negatif sample ağırlıklı). Çözüm: kontrollü test videolarında bilinçli olarak pozitif senaryolar oluşturun (telefon kullanma, sağa bakma vb.)

**Dosya formatı:** YOLO format (image + .txt annotation). Export script: `ai-service/scripts/export_training_data.py` (Python — AI servis tarafında çalışır, evidence frame'lere ve YOLO label formatına erişim gerektirir)

> **Detay:** Otomatik etiketleme detayları, kontrollü test senaryoları (bootstrap sorunu çözümü), export pipeline implementasyonu ve etiketleme kalite kontrolü → **PRD-017 §11**.

**Model A/B Testing:**
Yeni eğitilmiş model deploy edilmeden önce:
1. Admin fine-tuning UI'da 'Test Modu' seçer
2. Yeni model %10 oturumlarda (rastgele seçilen) paralel çalıştırılır
3. Her iki modelin (v1 + v2) sonuçları ayrı kaydedilir ama sadece v1 dashboard'a yansır
4. 10 oturum sonrası karşılaştırma raporu: precision, recall, FP oranı
5. v2 daha iyi → 'Promote to Production' butonu → v2 aktif olur
6. v2 daha kötü → 'Discard' → v1 kalır, v2 arşivlenir

**Not:** A/B testing sırasında öğrenciler etkilenmez — sadece v1 sonuçları kullanılır.

**Model versiyonu takibi:** Her incident kaydında `model_version` alanı saklanır:
```sql
ALTER TABLE incidents ADD COLUMN model_version TEXT DEFAULT 'yolov8n-coco-v1';
```
Rapor'da: 'Bu sınav [model_version] ile analiz edilmiştir.' notu gösterilir. Farklı model versiyonları ile kaydedilen incident'lar arası karşılaştırma yapılmaz (elma-armut karşılaştırması).

---

## 15. Canlı İzleme & Görsel Overlay Sistemi

### 15.1 Canlı Video Akışı

Proctor canlı kamera görüntüsünü gerçek zamanlı izleyebilir. Aynı zamanda AI tespitleri video üzerinde overlay olarak gösterilir.

**Mimari:**
```
AI Servis
    ├── RTSP'den frame okur
    ├── YOLOv8 + BoT-SORT + MediaPipe çalıştırır
    ├── Annotated frame üretir (bounding box, label, gaze çizgisi)
    └── İki ayrı kanal gönderir:
        ├── WebSocket /ws/sessions/[id]/detections → JSON detection verileri
        └── WebSocket /ws/sessions/[id]/video → Annotated JPEG frame stream (MJPEG-over-WS)
```

**Neden iki kanal?**
- **Detection channel:** Hafif, sadece JSON → alert panel, risk chart, incident oluşturma
- **Video channel:** Ağır, JPEG frame'ler → canlı video görüntüsü + overlay

**Video frame boyutu:** 640x480 @ 5 FPS, JPEG quality 70 → ~15-25 KB/frame → ~100 KB/s per camera

**Bandwidth optimizasyonu:** Full JPEG frame × 5 FPS × 3 kamera × 5 viewer = potansiyel 6 MB/s. Bu kabul edilemez. Çözüm:
- **Server-side throttle:** §18.7.1'deki `video_transport` config'e göre max 2 annotated frame/s/kamera gönderilir
- **Metadata ayrı kanal:** Detection metadata (bbox, risk, gaze) her frame gönderilir (~1 KB), video frame throttle'lanır
- **Adaptive quality:** Client bandwidth < 500 kbps → JPEG quality 70→40, FPS 2→1
- **Viewer sayısı limiti:** Max 5 concurrent viewer/session. 6. viewer → 'Canlı izleme dolu' mesajı

Tahmini bandwidth: 2 frame/s × 3 kamera × 30 KB = **180 KB/s per viewer** ✅

### 15.2 Görsel Overlay Tipleri

AI tespit sonuçları video üzerine çizilir:

| Overlay | Görsel | Renk | Koşul |
|---------|--------|------|-------|
| **Kişi bounding box** | Dikdörtgen çerçeve | 🟢 Yeşil (normal) | Her zaman (tracked person) |
| **Kişi bounding box** | Dikdörtgen çerçeve | 🟡 Sarı (uyarı) | risk_score 0.3-0.6 |
| **Kişi bounding box** | Dikdörtgen çerçeve | 🔴 Kırmızı (alarm) | risk_score > 0.6 |
| **Track ID + İsim** | Kutunun üstünde label | Beyaz arka plan | `Track#5 - Ahmet Y.` (seat mapping varsa) |
| **Telefon tespiti** | Telefon etrafında kırmızı kutu + "📱 PHONE" etiketi | 🔴 | phone_detected confidence > threshold |
| **Bakış çizgisi** | Göz noktasından bakış yönüne çizgi | 🟢 Normal / 🔴 Sapma | MediaPipe gaze vector |
| **Kafa yönü ok** | Burun noktasından yön oku | 🟡 / 🔴 | head_turn > threshold |
| **Risk skoru** | Kutunun altında bar | Gradient yeşil→kırmızı | Her tracked person |

```
Örnek annotated frame:
┌──────────────────────────────────────────────┐
│                                              │
│   ┌──────┐ Track#1 - Ayşe K.                │
│   │ 🟢   │ Risk: ██░░░ 0.15                 │
│   │      │                                   │
│   └──────┘                                   │
│                                              │
│   ┌──────┐ Track#5 - Mehmet D.  📱 PHONE    │
│   │ 🔴   │ Risk: █████ 0.92                 │
│   │  ←👁 │ ← bakış sapması çizgisi          │
│   └──────┘                                   │
│                                              │
│   ┌──────┐ Track#3 - ???? (eşleşmemiş)      │
│   │ 🟡   │ Risk: ███░░ 0.45                 │
│   │      │                                   │
│   └──────┘                                   │
│                                              │
└──────────────────────────────────────────────┘
```

### 15.3 Canlı İzleme UI Layout

**Route:** `/exams/[id]/sessions/[sid]`

```
┌─────────────────────────────────────────────────────────────────┐
│ CMPE 492 Final — Lab A — 14:00-16:00 — ● ACTIVE    ⏸ ⏹ ⚙️    │
├───────────────────────────────────┬─────────────────────────────┤
│                                   │  ALERTS (canlı scroll)     │
│   ┌─────────────┐ ┌────────────┐ │  ┌───────────────────────┐ │
│   │  CAM 1      │ │  CAM 2     │ │  │ 🔴 14:23 Phone        │ │
│   │  FRONT_WIDE │ │  SIDE_LEFT │ │  │ Mehmet D. (Track#5)   │ │
│   │  [canlı     │ │  [canlı    │ │  │ Conf: 0.92 | CAM1     │ │
│   │   video +   │ │   video +  │ │  │ [Acknowledge] [Flag]  │ │
│   │   overlay]  │ │   overlay] │ │  ├───────────────────────┤ │
│   └─────────────┘ └────────────┘ │  │ 🟡 14:21 Gaze ×4     │ │
│                                   │  │ Ayşe K. (Track#1)     │ │
│   Cam tıklandığında → büyütülür  │  │ 5dk'da 4 kez sapma    │ │
│   (fullscreen overlay)           │  │ [Acknowledge] [Dismiss]│ │
│                                   │  └───────────────────────┘ │
├───────────────────────────────────┴─────────────────────────────┤
│  Öğrenci Risk Haritası (tüm öğrenciler, canlı güncelleme)      │
│  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐             │
│  │S-01││S-02││S-03││S-04││S-05││S-06││S-07││S-08│             │
│  │0.15││0.92││0.45││0.10││0.30││0.05││0.60││0.20│             │
│  │ 🟢 ││ 🔴 ││ 🟡 ││ 🟢 ││ 🟡 ││ 🟢 ││ 🟡 ││ 🟢 │             │
│  └────┘└────┘└────┘└────┘└────┘└────┘└────┘└────┘             │
└─────────────────────────────────────────────────────────────────┘
```

#### Mobil Proctor Deneyimi

Proctor tablet/telefon ile `/exams/[id]/sessions/[sid]` sayfasına eriştiğinde responsive layout:

**Mobil layout (< 768px):**
- Video grid gizli (bandwidth tasarrufu) — sadece seçili 1 kamera gösterilir
- Alert panel tam ekran, swipe ile kamera değiştirme
- Alt bar: [Kamera] [Alerts] [Öğrenciler] [Ayarlar] tab'ları
- Her alert'te: Acknowledge / Dismiss / Flag butonları (büyük, dokunmatik)
- Push notification'lar doğrudan alert listesine düşer

**Tablet layout (768-1024px):**
- 2×1 kamera grid + sağda alert panel
- Kalan kameralar swipe ile geçiş

**Kritik:** Mobil proctor video frame almaz (bandwidth). Sadece metadata (bbox koordinatları, risk, alert) alır. Gerçek video görmek için 'Canlı İzle' butonuna tıklar → o an tek kamera stream başlar.

### 15.4 Video Etkileşim Özellikleri

| Özellik | Davranış |
|---------|----------|
| **Kamera tıklama** | Seçili kamera fullscreen overlay'de büyütülür (esc ile kapat) |
| **Öğrenci kutusu tıklama** | Sağ panelde öğrenci detay kartı açılır (incident geçmişi, risk trend) |
| **Overlay toggle** | Toolbar'da toggle: "Boxes" / "Gaze Lines" / "Risk Bars" / "Labels" ayrı ayrı açılıp kapatılabilir |
| **Grid düzeni** | 1 kamera (tek büyük) / 2×1 / 2×2 / 3×2 — kamera sayısına göre otomatik |
| **Snapshot** | Herhangi bir anda "📸 Capture" butonu → mevcut annotated frame'i evidence olarak kaydet |
| **FPS göstergesi** | Her kamera kutusunun köşesinde gerçek FPS ve AI processing durumu |

### 15.5 Test Modu (Sınav Dışı)

Sınav olmadan kamera ve AI pipeline'ını test etmek için:

**Route:** `/rooms/[id]/test`

- Kameralardan canlı görüntü + overlay gösterilir
- Tespitler çalışır ama incident kaydedilmez
- Proctor threshold ayarlarını test edebilir
- "Test sınavı" oluşturmaya gerek yok
- **Amaç:** Kamera açısı, aydınlatma, threshold kalibrasyonu

### 15.6 WebSocket Mesaj Formatı (Video Channel)

**Server → Client (Annotated Frame):**
```json
{
  "type": "frame",
  "camera_id": "uuid",
  "timestamp": "2026-03-19T14:23:15.200Z",
  "frame": "<base64-encoded JPEG>",
  "width": 640,
  "height": 480,
  "annotations": [
    {
      "track_id": 5,
      "student_id": "S-042",
      "student_name": "Mehmet D.",
      "bbox": [0.3, 0.4, 0.15, 0.2],
      "risk_score": 0.92,
      "risk_level": "high",
      "detections": ["phone_detected"],
      "gaze": { "direction": [0.7, -0.3], "is_diverted": true },
      "head_pose": { "yaw": 35, "pitch": -5, "roll": 2 }
    }
  ]
}
```

**Frame rendering (client tarafı):**
- `<canvas>` element'ine JPEG çizilir
- `annotations` array'i üzerinden bounding box, label, gaze çizgisi canvas'a overlay olarak çizilir
- React state ile overlay toggle kontrolü
- requestAnimationFrame ile smooth rendering

---

## 16. Ortam Değişkenleri

```env
# AI Servis
AI_SERVICE_URL=http://localhost:8000        # FastAPI base URL
AI_SERVICE_WS_URL=ws://localhost:8000       # WebSocket URL

# Push Notifications
VAPID_PUBLIC_KEY=                            # Web Push VAPID public key
VAPID_PRIVATE_KEY=                           # Web Push VAPID private key

# Feature Flag
NEXT_PUBLIC_CAMERA_MODULE_ENABLED=false
```

Tümü SSM + CDK service-stack.ts + .env.local'de tanımlı olmalı (CLAUDE.md kuralı).

---

## 17. Performans & Altyapı Planlaması

> **⚠️ Kapsam:** Bu proje bir üniversite bitirme projesidir. Hedef: **1 sınıf, 1-5 kamera, maksimum verim.** Multi-room ölçeklendirme ileride ele alınır (§17.8).

### 17.1 Hedef Senaryo

| Parametre | Değer |
|-----------|-------|
| Oda sayısı | 1 |
| Kamera | 1-5 (önerilen: 3) |
| Öğrenci | 20-40 |
| Sınav süresi | Max 2 saat |
| FPS | Adaptif: 5 FPS normal → 10-15 FPS alarm modu (bkz: §17.2) |
| Toplam frame/s | Normal: 15 / Alarm: 25 / Max: 45 |
| Eşzamanlı dashboard | 3-5 (gözetmenler + admin) |

### 17.1.1 Network Topology — AI Servis & Kamera Erişimi

**Problem:** Kameralar üniversite LAN'ında (yerel ağ), AI servis AWS ECS'de (bulut). RTSP stream LAN dışına çıkamaz (NAT/firewall arkasında).

**Phase A çözümü: AI servis on-premise (önerilen)**

```
Üniversite LAN (aynı ağ):
  ┌────────┐     RTSP      ┌──────────────┐     HTTPS/WS     ┌─────────────┐
  │ Kamera │ ──────────► │ AI Servis    │ ──────────────► │ Portal      │
  │ (IP/   │   (lokal)    │ (Docker on   │   (internet)    │ (AWS ECS)   │
  │ Phone) │              │  local PC)   │                 │             │
  └────────┘              └──────────────┘                 └─────────────┘
                                │                                │
                                └─── Supabase (internet) ────────┘
```

| Seçenek | Avantaj | Dezavantaj | Maliyet |
|---------|---------|------------|---------|
| **On-premise Docker** (Phase A önerilen) | Kameralarla aynı ağ, sıfır latency, sıfır cloud maliyeti | Üniversite bilgisayarı gerekli (4+ CPU core, 8+ GB RAM), yönetim overhead | $0 (mevcut donanım) |
| **AWS ECS + VPN tunnel** | Merkezi yönetim, ölçeklenebilir | VPN kurulumu karmaşık, RTSP stream bandwidth (~5 Mbps/kamera), gecikme | ~$146/ay + VPN |
| **AWS ECS + RTSP relay** | VPN gereksiz, relay agent LAN'da çalışır | Ek relay bileşeni, bandwidth hala sorun | ~$146/ay |

**Phase A kararı:** AI servisi **üniversite LAN'ındaki bir bilgisayarda Docker container olarak** çalıştırılır. Bu:
- Kamera stream'lerine doğrudan erişim sağlar (sıfır latency)
- AWS maliyetini sıfırlar (AI servis için $146/ay tasarruf)
- Demo günü için ideal (her şey tek ağda)
- Portal (AWS ECS) ile iletişim HTTPS/WebSocket üzerinden (internet)

**Minimum donanım gereksinimi (on-premise):**
- CPU: 4+ core (Intel i5/i7 veya AMD Ryzen 5+)
- RAM: 8+ GB
- OS: Ubuntu 22.04 veya Windows + WSL2
- Network: Üniversite LAN'a ethernet bağlantı (WiFi kabul edilemez — FPS düşüşü riski)
- Docker Engine kurulu

**Phase B+:** AI servisi AWS ECS'e taşınır, kameralar VPN tunnel veya RTSP relay agent ile bağlanır.

### 17.2 FPS Stratejisi & Çözünürlük

FPS ve çözünürlük farklı sorunları çözer:
- **FPS:** Hızlı hareketleri yakalama (el hareketi, telefonu saklama)
- **Çözünürlük:** Uzak mesafede küçük nesneleri tespit etme (kulaklık, küçük kağıt)

#### Ne Kadar FPS Gerekli?

| Davranış | Süre | 5 FPS | 10 FPS | 15 FPS |
|----------|------|-------|--------|--------|
| Telefonu cebe koyma | 300-500ms | 1-2 frame ⚠️ | 3-5 frame ✅ | 4-7 frame ✅ |
| Bakış sapması | 1-3s | 5-15 frame ✅ | 10-30 ✅ | 15-45 ✅ |
| Kafa dönüşü | 500ms-1s | 2-5 frame ⚠️ | 5-10 ✅ | 7-15 ✅ |
| Not/kağıt gösterme | 1-5s | 5-25 ✅ | 10-50 ✅ | 15-75 ✅ |
| Nesne aktarma | 500ms-2s | 2-10 ⚠️ | 5-20 ✅ | 7-30 ✅ |
| Dudak hareketi | 200-500ms | 1-2 ❌ | 2-5 ⚠️ | 3-7 ⚠️ |

**Sonuç:** 5 FPS hızlı el hareketlerini kaçırabilir. **10 FPS tüm önemli davranışları yakalar.**

#### Adaptif FPS Stratejisi

Tüm kameraları sabit FPS'te tutmak yerine, duruma göre FPS ayarla:

```
Normal mod (şüpheli hareket yok):
  → 5 FPS/kamera (düşük CPU, geniş izleme)

Alarm modu (TIER 1/2 tespit algılandı):
  → İlgili kamerayı 10-15 FPS'e çıkar (detay yakalama)
  → Diğer kameralar 5 FPS kalır

Örnek:
  t=14:23:00 — CAM1 normal, CAM2 normal, CAM3 normal → hepsi 5 FPS = 15 frame/s
  t=14:23:05 — CAM1 phone_detected! → CAM1 → 15 FPS, CAM2/3 → 5 FPS = 25 frame/s
  t=14:23:35 — CAM1 30s boyunca temiz → CAM1 → 5 FPS = 15 frame/s (normal'e dön)
```

**CPU bütçesi adaptif modda:**
```
Normal: 3 × 5 = 15 frame/s → %28 CPU
Alarm:  1×15 + 2×5 = 25 frame/s → %47 CPU → hala %53 headroom ✅
Max:    3 × 15 = 45 frame/s → %84 CPU → çalışır ama sınırda ⚠️
```

#### Çözünürlük & Mesafe

FPS'ten bağımsız olarak, uzak mesafedeki öğrencilerin tespiti **kamera çözünürlüğüne** bağlıdır:

| Kamera Çözünürlük | 3m Uzaklık (yüz) | 5m Uzaklık (yüz) | 8m Uzaklık (yüz) | Telefon Tespiti |
|-------------------|-------------------|-------------------|-------------------|-----------------|
| **720p** (1280×720) | ~80×80px ✅ | ~50×50px ⚠️ | ~30×30px ❌ | 3m'ye kadar |
| **1080p** (1920×1080) | ~120×120px ✅ | ~75×75px ✅ | ~45×45px ⚠️ | 5m'ye kadar |
| **4K** (3840×2160) | ~240×240px ✅ | ~150×150px ✅ | ~90×90px ✅ | 8m'ye kadar |

**Minimum gereksinimler:**
- MediaPipe Face Mesh: yüz en az ~64×64px olmalı → 1080p'de max ~6m
- YOLOv8 phone detection: telefon en az ~32×32px olmalı → 1080p'de max ~5m
- YOLOv8 person detection: kişi en az ~64×128px olmalı → 1080p'de max ~10m

**Öneriler:**
| Kamera Rolü | Min Çözünürlük | FPS | Neden |
|------------|---------------|-----|-------|
| `front_wide` (tüm oda) | 1080p zorunlu, 4K tercih | 5 FPS normal, 10 alarm | Uzak sıraları da kapsamalı |
| `front_close` (ön sıralar) | 720p yeterli | 10 FPS | Yakın mesafe, yüz detay gerekli |
| `side` (yan) | 1080p | 5 FPS normal, 10 alarm | Orta mesafe, kucak/sıra üstü tespiti |
| `rear` (arka) | 1080p | 5 FPS | Sıra üstü tespiti, yüz gerekmez |

**⚠️ Maksimum Etkin Mesafe Uyarısı:**
| Model | Minimum Piksel | 1080p Max Mesafe | 4K Max Mesafe |
|-------|---------------|-----------------|--------------|
| MediaPipe Face Mesh | 64×64 px | **~6m** | ~12m |
| YOLOv8 phone | 32×32 px | **~5m** | ~10m |
| YOLOv8 person | 64×128 px | **~10m** | ~20m |

Bu mesafelerin ötesinde tespit doğruluğu hızla düşer. Kamera yerleşimi planlanırken **hiçbir koltuk birincil kameranın 6m ötesinde olmamalıdır** (1080p). 4K kamera kullanılırsa bu sınır 12m'ye çıkar.

**AI servis tarafında çözünürlük işleme:**
- Kamera 4K gönderir ama AI servis **YOLO için 640×640'a resize eder** (inference boyutu)
- Detection'dan sonra orijinal çözünürlükte crop alınır (kaliteli evidence)
- MediaPipe yüz crop'u orijinal çözünürlükten kesilir (daha doğru gaze)

#### Konfigürasyon

Tüm FPS ve çözünürlük parametreleri §18.7.1 master config'de (`fps_control` ve `inference_pipeline` bölümleri), FPS geçiş state machine'i §18.7.2'de tanımlanmıştır.

**Çözünürlük eşikleri (referans):**
| Parametre | Değer |
|-----------|-------|
| YOLO inference size | 640×640 |
| Min yüz piksel (MediaPipe) | 64×64 |
| Min telefon piksel (YOLO) | 32×32 |

### 17.3 Darboğaz Analizi (Güncellenmiş)

AI pipeline'ın en yavaş bileşeni **MediaPipe** (person başına 20-40ms CPU). YOLO hızlı ama MediaPipe çoklu öğrencide lineer yavaşlar:

| Bileşen | Süre/frame (4 vCPU) | 3 kişide | 40 kişide (tam sınıf) |
|---------|--------------------|---------|-----------------------|
| YOLOv8n detection | 40-65ms | 40-65ms | 40-65ms (sabit) |
| BoT-SORT tracking | 2-5ms | 2-5ms | 5-10ms |
| MediaPipe (per person) | 20-40ms | 60-120ms | ❌ 800-1600ms |
| **Toplam** | 62-110ms | 102-190ms | ❌ Sınav için çok yavaş |

**Çözüm:** Selective MediaPipe (§3.3) + Adaptif FPS (§17.2). Normal modda 5 FPS, alarm modda 10-15 FPS. Effective MediaPipe yükü: 8-12 kişi/frame.

**Güncellenmiş performance budget (adaptif FPS):**
```
Normal mod (15 frame/s):  %28 CPU → %72 headroom ✅
Alarm mod (25 frame/s):   %47 CPU → %53 headroom ✅
Max mod (45 frame/s):     %84 CPU → %16 headroom ⚠️ (nadir)
```

### 17.4 Tek Sınıf İçin Optimal Altyapı

| Bileşen | Spec | Neden Yeterli | Maliyet |
|---------|------|--------------|---------|
| **AI Servis** | ECS Fargate, 4 vCPU, 8 GB | 15 frame/s < 61 FPS YOLOv8n kapasitesi | ~$146/ay (sadece sınav saatlerinde çalışırsa daha az) |
| **Portal** | Mevcut ECS Fargate (0.5 vCPU) | Dashboard + API + WS relay, düşük yük | Mevcut |
| **Supabase** | Free plan (dev) / Pro (son 2 ay + demo) | Bkz: §17.5 | $0 / $25 |
| **Redis** | ElastiCache t3.micro | **Phase A: opsiyonel** — Phase B: zorunlu | ~$13/ay (Phase B+) |
| **TOPLAM Phase A (dev)** | | Redis yok, direkt WS | **~$146/ay** |
| **TOPLAM Phase A (demo)** | | Supabase Pro | **~$171/ay** |
| **TOPLAM Phase B+** | | Redis eklenir | **~$185/ay** |

**Maliyet optimizasyonu:**
- AI servisini sadece sınav saatlerinde çalıştır (ECS scheduled scaling) → %70 tasarruf
- Demo ayı dışında AI servisi kapalı → $0
- Realistic maliyet: **$50-70/ay** (sadece aktif kullanım saatleri)

### 17.5 Supabase Plan Analizi

| Gereksinim | İhtiyaç (1 sınıf, 2 saat sınav) | Free Plan | Pro ($25/ay) |
|------------|--------------------------------|-----------|-------------|
| DB writes | 5-10/s × 7200s = ~50K row (~25 MB) | 500 MB ✅ rahat | 8 GB ✅ |
| Storage | ~50-200 MB snapshot/sınav | 1 GB ⚠️ sıkışık | 100 GB ✅ |
| Bandwidth | Dashboard + snapshot serve ~1 GB | 5 GB ⚠️ çoklu test sonrası riskli | 250 GB ✅ |
| Realtime | 3-5 bağlantı | 200 ✅ | 500 ✅ |
| Auth users | 5-10 | Unlimited ✅ | Unlimited ✅ |
| Pausing | 7 gün inaktifse proje uyur ❌ | **RİSK** | Uyumaz ✅ |
| Backups | — | Yok ❌ | 7 gün PITR ✅ |

**Önerilen strateji:**
- **Erken geliştirme (portal geliştirme):** Free plan (yeterli — AI servisi henüz yok)
- **AI entegrasyon geliştirme (son ~2 ay):** Pro'ya yükselt ($25/ay) → test sınavlarında evidence storage 1 GB'ı aşar, bandwidth limiti riskli, pausing riski var
- **Demo/sunum ayı:** Pro (zaten aktif)
- **Demo sonrası:** Free'ye düşür (AI servisi kapalı, storage temizlenmiş)

**Free plan kullanılacaksa zorunlu önlemler:**
1. **Anti-pause cron:** GitHub Actions ile günlük Supabase health ping (projenin uyumaması için)
2. **Storage temizliği:** Test snapshot'larını demo öncesi sil
3. **Bandwidth izleme:** Supabase dashboard'dan kullanımı kontrol et
4. **Kuru prova:** Demo'dan 1 gün önce full test çalıştır → sorunları önceden yakala

### 17.6 Tek Sınıf Performans Optimizasyonları

1 sınıfta alınabilecek en yüksek verim:

| Optimizasyon | Etki | Açıklama |
|-------------|------|----------|
| **YOLO her frame, MediaPipe seçici** | CPU %60 tasarruf | Sadece YOLO anomali tespit ettiğinde MediaPipe çalıştır |
| **Frame skip (5 FPS)** | Yeterli temporal resolution | 25-30 FPS kameradan her 5-6. frame al |
| **Batch DB write** | DB yükü %80 azalır | 10-50 event'i tek INSERT'e topla |
| **Evidence sadece incident'ta** | Storage %90 azalır | Her frame'i değil, sadece alert frame'ini kaydet |
| **WebSocket throttle** | Bandwidth azalır | Dashboard'a saniyede max 2 annotated frame gönder (5 FPS'in hepsini değil) |
| **JPEG quality 70** | Frame boyutu %50 azalır | Görsel kalite yeterli, boyut küçülür |

**Tek sınıf performance budget:**
```
3 kamera × 5 FPS = 15 frame/s

YOLOv8n: 15 frame × 50ms = 750ms/s → 4 vCPU'nun %19'u ✅ rahat
BoT-SORT: 15 frame × 5ms = 75ms/s → ihmal edilebilir
MediaPipe (selective, 10 kişi): 10 × 30ms = 300ms/s → %8 ✅
Fusion + scoring: ~50ms/s → %1
TOPLAM: ~%28 CPU kullanımı → %72 headroom ✅

Sonuç: 4 vCPU tek sınıf için FAZLASIYLA yeterli.
Hatta 2 vCPU bile çalışır (%56 kullanım) → maliyet $73/ay'a düşer.
```

### 17.7 Demo Günü Hazırlık Checklist'i

Sunum/demo gününde sistemin çökmemesi için:

**1 Hafta Önce:**
- [ ] Supabase Pro'ya yükselt (veya Free ise anti-pause cron aktif)
- [ ] AI servisini deploy et ve health check'i doğrula
- [ ] Test sınavı oluştur → kameraları bağla → kalibrasyon yap
- [ ] Full 30 dakikalık test sınavı çalıştır → tüm akış doğrula

**1 Gün Önce:**
- [ ] Tüm servislerin ayakta olduğunu doğrula (portal, AI, Supabase, Redis)
- [ ] Supabase storage kullanımını kontrol et (Free ise < 800 MB)
- [ ] Supabase bandwidth kullanımını kontrol et (Free ise < 3 GB)
- [ ] Test kameralarını fiziksel olarak kur + bağlantı test et
- [ ] Kuru prova: sınav oluştur → başlat → 5 dakika izle → bitir → rapor kontrol et
- [ ] Browser cache temizle (PWA stale cache riski)

**Demo Günü:**
- [ ] AI servisini 30 dk önce başlat (cold start'ı önle)
- [ ] Dashboard'u aç → health check kartlarını doğrula (tümü yeşil)
- [ ] Kamera feed'lerini test et (canlı önizleme)
- [ ] Demo sınavını oluştur → öğrenci ata → başlat
- [ ] Backup planı hazır: mock video feed (kameralar çalışmazsa)

**Olası Sorunlar & Plan B:**

| Sorun | Belirti | Plan B |
|-------|---------|--------|
| Supabase uyudu | 502 error | Dashboard'dan manual unpause (3-5 dk) |
| Kamera bağlantısı yok | "Bağlantı kesildi" | Mock video feed ile demo |
| AI servis çöktü | Dashboard'da alert yok | ECS'den manual restart + 2 dk bekleme |
| WiFi sorunlu | Kamera feed kesintili | Hotspot + ethernet backup |
| Bandwidth aşıldı | Throttle/error | Pro'ya anında upgrade ($25) |

**Demo Sonrası Rollback & Temizlik:**
- [ ] AI servisini durdur (`desiredCount: 0`) → maliyet durur
- [ ] Demo sınavını `completed` durumuna al
- [ ] Test öğrenci verilerini sil (veya anonymize et)
- [ ] Evidence frame'lerini temizle (`POST /api/evidence/purge`)
- [ ] Supabase Pro → Free'ye dön (demo ayı bittiyse)
- [ ] Redis cache'i flush et (FLUSHALL — tüm geçici veri temizlenir)
- [ ] CloudWatch loglarını kontrol et → beklenmeyen error varsa not al

### 17.8 İleride: Multi-Room Ölçeklendirme (Referans)

```
                    ┌──── Oda 1: 3 kamera ────┐
                    ├──── Oda 2: 2 kamera ────┤
RTSP Streams ───────┼──── Oda 3: 4 kamera ────┼──► Frame Extractor
                    ├──── Oda 4: 3 kamera ────┤    (1 vCPU per 5 oda)
                    └──── Oda 5: 3 kamera ────┘
                                                      │
                                                      ▼
                                              ┌───────────────┐
                                              │ Redis Streams  │
                                              │ (message queue)│
                                              └───────┬───────┘
                                                      │
                              ┌────────────────────────┼────────────────────────┐
                              ▼                        ▼                        ▼
                    ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
                    │  AI Worker #1    │  │  AI Worker #2    │  │  AI Worker #3    │
                    │  4 vCPU, 8 GB    │  │  4 vCPU, 8 GB    │  │  4 vCPU, 8 GB    │
                    │  YOLO + Track +  │  │  YOLO + Track +  │  │  YOLO + Track +  │
                    │  MediaPipe       │  │  MediaPipe       │  │  MediaPipe       │
                    └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
                             │                     │                     │
                             └─────────────────────┼─────────────────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    ▼              ▼              ▼
                            ┌──────────┐  ┌──────────────┐  ┌─────────┐
                            │ Supabase │  │ Redis PubSub │  │ Storage │
                            │ (persist)│  │ (real-time)  │  │ (evid.) │
                            └──────────┘  └──────┬───────┘  └─────────┘
                                                 │
                                                 ▼
                                    ┌──────────────────────┐
                                    │  Next.js Dashboard    │
                                    │  (Supabase Realtime   │
                                    │   + Redis subscribe)  │
                                    └──────────────────────┘
```

**Temel tasarım kararları:**

| Karar | Seçim | Gerekçe |
|-------|-------|---------|
| Worker distribution | Shared pool (oda ayrımı yok) | Daha iyi kaynak kullanımı, idle worker yok |
| Queue | Redis Streams + Consumer Groups | Düşük latency (1-5ms), built-in consumer group desteği |
| Auto-scaling tetikleyici | Redis stream lag (backlog per worker) | CPU'dan daha doğru: kuyruktaki iş miktarına göre ölçekle |
| Persistence | Batch write to Supabase (10-50 event/INSERT) | Tek tek INSERT yerine toplu, DB yükü azalır |
| Real-time dashboard | Redis PubSub → WS relay → dashboard | Supabase Realtime yüksek frekanslı veri için yavaş kalabilir |
| Frame storage | S3 pre-signed URL (evidence snapshot) | Supabase Storage da olur ama S3 daha ucuz yüksek hacimlerde |

#### Worker Dağıtımı & İzolasyon (multi-room)

Her worker herhangi bir odanın frame'ini işleyebilir. Redis consumer group garantisi: her frame sadece bir worker tarafından işlenir.

```
Redis Stream: "frames:{room_id}"
  Consumer Group: "ai-workers"
    Worker 1: frames:room1, frames:room3 (otomatik dağıtılır)
    Worker 2: frames:room2, frames:room4
    Worker 3: frames:room5 (daha az yük, sonraki frame'leri de alır)
```

**Failover:** Worker çökerse, acknowledge edilmemiş mesajlar Redis tarafından başka worker'a atanır (consumer group pending entries).

#### Supabase Yük Analizi (multi-room)

| Yük Tipi | 5 Oda | 10 Oda | Supabase Pro Limiti | Yeterli? |
|----------|-------|--------|---------------------|----------|
| DB write/s | 25-50 | 60-150 | ~500-2000 INSERT/s | ✅ (batch ile rahat) |
| Connections | 10-20 | 20-40 | 200 direct / 500 pooled | ✅ |
| Realtime subscriptions | 15-25 | 30-50 | 500 concurrent | ✅ |
| Storage write/dk | 10 | 25 | Sınırsız (bandwidth limiti) | ✅ |

**Supabase darboğaz olmaz.** Gerekirse compute add-on ($100/ay) ile 4 vCPU / 16 GB'a yükselt.

#### Auto-Scaling Konfigürasyonu (multi-room)

```json
{
  "scaling": {
    "min_workers": 1,
    "max_workers": 10,
    "target_backlog_per_worker": 10,
    "scale_out_cooldown_seconds": 60,
    "scale_in_cooldown_seconds": 300,
    "use_fargate_spot": true,
    "spot_fallback_to_on_demand": true
  }
}
```

**Sınav takvimi ile proaktif ölçeklendirme:**
Planlanan sınavlara göre worker'lar önceden ayağa kaldırılabilir:
```
Sınav başlangıcı 14:00 → 13:55'te 3 worker ayağa kaldır
Sınav bitişi 16:00 → 16:05'te worker'ları scale-in yap
```

Bu "scheduled scaling" ECS Application Auto Scaling ile mümkündür.

---

## 18. Altyapı Kapasitesi & Performans Mühendisliği

> Bu bölüm Faz 2'nin operasyonel altyapısını tanımlar: mevcut kapasitenin tespiti, yeni bileşenlerin (AI servis, Redis) eklenmesi, uygulama içi performans optimizasyonları, hata yönetimi ve loglama stratejisi. Hedef: **sınav sırasında sıfır donma, sıfır sessiz hata, sıfır veri kaybı.**

### 18.1 Mevcut Altyapı Tespiti

| Bileşen | Mevcut Spec | Faz 2 Gereksinimi | Aksiyon |
|---------|------------|------------------|---------|
| **Portal Staging** | 1 × 0.25 vCPU / 512 MiB | WS + dashboard + rapor | **→ 1 × 0.5 vCPU / 1 GiB** |
| **Portal Production** | 2 × 0.25 vCPU / 512 MiB | Aynı + push notification | **→ 2 × 0.5 vCPU / 1 GiB** |
| **AI Servis** | YOK | YOLO + Track + MediaPipe | **→ 1 × 4 vCPU / 8 GiB (yeni)** |
| **Redis** | YOK | Frame queue + pub/sub + cache | **→ ElastiCache t3.micro (yeni)** |
| **Supabase** | Free/Pro | +50K row/sınav, +200 MB evidence | Free dev / Pro demo |
| **ECR** | 1 repo (portal) | +1 repo (ai-service) | **→ horuseye/ai-service eklenir** |
| **VPC** | 2 AZ, public, NAT yok | AI servisi de public subnet | Mevcut yeterli |
| **ALB** | portal:3000 | + ai-service:8000 (opsiyonel) | AI servisi ALB'ye eklenir veya internal |

### 18.2 CDK Service Stack Değişiklikleri

```typescript
// infra/bin/infra.ts — Faz 2 güncellemeleri

// Portal task: 256 → 512 CPU, 512 → 1024 Memory
new ServiceStack(app, 'HorusEye-Staging', {
  cpu: 512,       // 0.5 vCPU (önceki: 256)
  memory: 1024,   // 1 GiB (önceki: 512)
  desiredCount: 1,
  // ...
});

// AI Service: yeni task tanımı
new AiServiceStack(app, 'HorusEye-AI-Staging', {
  cpu: 4096,      // 4 vCPU
  memory: 8192,   // 8 GiB
  desiredCount: 0, // Scheduled: sınav yoksa 0
  // ...
});
```

### 18.3 Redis Mimarisi

> **⚠️ Phase A'da opsiyonel.** Tek sınıf, tek kamera, 20-40 öğrenci senaryosunda AI servis → Portal direkt WebSocket ile iletişim kurabilir. Supabase Realtime 50-100ms gecikmesi sınav gözetiminde kabul edilebilir düzeydedir. Redis, Phase B (multi-room, yüksek frekanslı füzyon) için zorunlu hale gelir.
>
> **Phase A alternatifi:** AI servis → Portal WebSocket (detection stream) + Supabase batch INSERT (her 5s, incident kalıcılığı). Redis olmadan ~$13/ay ve önemli mimari karmaşıklık tasarrufu sağlanır.

**Neden Redis gerekli? (Phase B+)**
- AI servisi → portal arası düşük latency veri aktarımı (1-5ms)
- Multi-room senaryoda yüksek frekanslı veri (50+ msg/s) için Supabase Realtime yetmez
- Frame queue (producer/consumer pattern — multi-worker)
- Detection cache (aynı öğrencinin son N tespitini hızlı erişim)

**Redis kullanım alanları:**

| Kullanım | Redis Yapısı | TTL | Açıklama |
|----------|-------------|-----|----------|
| **Frame queue** | Stream: `frames:{session_id}` | 5 dk | Kamera frame'leri AI worker'a |
| **Detection broadcast** | PubSub: `detections:{session_id}` | — | AI → Dashboard gerçek zamanlı |
| **Student risk cache** | Hash: `risk:{session_id}` | Session süresi | Her öğrencinin güncel risk skoru |
| **Camera health** | Hash: `camera_health:{room_id}` | 30s refresh | Kamera metrikleri (FPS, blur, status) |
| **Track-student mapping** | Hash: `tracks:{session_id}` | Session süresi | track_id → student_id eşleştirmesi |
| **Rate limit** | String: `ratelimit:{ip}:{endpoint}` | 15 dk | API rate limiting |
| **Session state** | Hash: `session:{session_id}` | Session süresi | Aktif oturum durumu (status, settings) |

**Redis bağlantı yönetimi:**
```
Portal → Redis: ioredis client, connection pool (max 10)
AI Service → Redis: redis-py client, connection pool (max 20)
Toplam bağlantı: ~30 → t3.micro limiti: 65,000 ✅
```

**Persistence & Memory stratejisi:**

| Ayar | Değer | Neden |
|------|-------|-------|
| **Persistence** | **Kapalı (no-persistence)** | Tüm Redis verisi geçicidir — kalıcı kayıt Supabase'de. Redis restart'ta boş başlar, oturumlar yeniden ısınır |
| **Maxmemory** | 256 MB (t3.micro: 512 MB toplam, %50 OS'e) | 1 oturum ~5-10 MB (40 öğrenci × risk + track + camera health) |
| **Eviction policy** | `allkeys-lru` | Memory dolunca en eski key silinir — stale frame/cache zaten gereksiz |
| **Memory monitoring** | CloudWatch `EngineCPUUtilization` + `DatabaseMemoryUsagePercentage` | %80 alarm → admin notification |

**Neden persistence kapalı?**
- Frame queue, detection broadcast, risk cache = hepsi **ephemeral** (geçici) veri
- Kalıcı kayıtlar (incident, attendance, session report) Supabase'e batch yazılıyor (§18.3 veri akış diyagramı)
- Redis crash/restart durumunda: AI servisi 2-3s içinde yeniden bağlanır, cache otomatik dolmaya başlar, kullanıcı 1-2 saniye gecikme yaşar (dashboard banner: "Gerçek zamanlı bağlantı yeniden kuruluyor...")
- Persistence açmak t3.micro'da disk I/O baskısı yaratır ve gereksiz maliyet ekler

**Veri akış diyagramı:**
```
AI Servis:
  Frame işle → detection sonucu
    ├── Redis PubSub PUBLISH "detections:{sid}" → Dashboard'a anlık
    ├── Redis HSET "risk:{sid}" student_id score → Cache güncelle
    └── Supabase INSERT (batch, her 5s) → Kalıcı kayıt

Portal Dashboard:
  Redis SUBSCRIBE "detections:{sid}" → Canvas overlay güncelle
  Redis HGETALL "risk:{sid}" → Risk haritası güncelle (her 2s poll)
  Supabase Realtime → Incident alert (düşük frekans, güvenilir)
```

### 18.4 Uygulama İçi Performans Optimizasyonları

#### Frontend (Next.js Dashboard)

| Optimizasyon | Sorun | Çözüm |
|-------------|-------|-------|
| **Canvas rendering** | 5 FPS × 3 kamera annotated frame → 15 DOM update/s | `<canvas>` ile render, `requestAnimationFrame`, React state DIŞINDA |
| **WebSocket throttle** | Her frame dashboard'a gönderilirse bandwidth aşılır | Server: max 2 annotated frame/s/kamera gönder, metadata her frame |
| **Risk haritası** | 40 öğrenci × her frame güncellemesi → render thrashing | Redis'ten 2s'de bir batch poll, `useMemo` ile gereksiz render engelle |
| **Incident listesi** | Canlı scroll + yeni alert eklenmesi → layout shift | Virtualized list (`@tanstack/virtual`), yeni alert üstte sabitlenir |
| **Kamera grid** | 3-5 kamera aynı anda video → yüksek memory | Lazy load: sadece görünür kameralar render edilir, diğerleri thumbnail |
| **Rapor chart'ları** | Recharts heavy render (500+ data point) | Chart'ları `React.lazy` ile yükle, `useDeferredValue` ile UI bloklamayı engelle |
| **Bundle size** | react-pdf, mammoth, recharts → büyük bundle | Dynamic import (`next/dynamic`) ile code splitting, sayfa bazlı lazy load |

#### Backend (API Routes)

| Optimizasyon | Sorun | Çözüm |
|-------------|-------|-------|
| **Batch DB write** | 5-10 INSERT/s → DB connection pressure | 10-50 event'i tek INSERT'e topla (5s buffer) |
| **Connection pooling** | Her API call yeni Supabase client | Singleton pattern, PgBouncer (Supabase built-in port 6543) |
| **Background jobs** | Rapor oluşturma, evidence cleanup → API response'u bloklar | `Promise.resolve().then(...)` fire-and-forget, veya edge function |
| **Caching** | Sınav listesi, oda planı → her request'te DB query | Redis cache (5 dk TTL) veya `unstable_cache` (Next.js) |
| **Image optimization** | Evidence frame'ler büyük JPEG | Sharp ile resize (max 1280px), quality 70, WebP dönüşüm |

#### AI Servis (Python)

| Optimizasyon | Sorun | Çözüm |
|-------------|-------|-------|
| **GIL bottleneck** | Python GIL → MediaPipe paralel çalışmaz | `multiprocessing.Pool` ile person crop'larını paralel işle |
| **Model warm-up** | İlk inference ~3-5s (model yükleme) | Startup'ta dummy inference çalıştır, model RAM'de sıcak tut |
| **Frame decode** | JPEG decode CPU yoğun | `cv2.imdecode` + NumPy, gereksiz kopyalamalardan kaçın |
| **Memory leak** | Uzun çalışan process'te gradual memory artışı | Her 1000 frame'de `gc.collect()`, memory monitoring |
| **RTSP reconnect** | Kamera bağlantısı koparsa retry loop CPU yer | Exponential backoff (2s→4s→8s→max 30s), ayrı thread |

### 18.5 Error Handling — Katmanlı Yaklaşım

**Prensip:** Hiçbir hata kullanıcıya donma, beyaz ekran veya sessiz başarısızlık olarak yansımamalıdır.

#### Katman 1: AI Servis Hataları

| Hata | Algılama | Otomatik Aksiyon | Dashboard'a Yansıma |
|------|----------|-----------------|---------------------|
| YOLO inference fail | try/except, timeout 2s | Frame atla, sonraki frame'e geç | FPS düşüşü göstergesi (sarı) |
| MediaPipe crash | Process-level exception handler | Worker restart (sub-process), 3s recovery | "Gaze analizi geçici olarak durdu" banner |
| RTSP timeout | 5s socket timeout | Retry 3× (2s/4s/8s) → kamera "offline" | Kamera kartı kırmızı, "Bağlantı kesildi" |
| Redis publish fail | ConnectionError exception | Local buffer'a yaz, bağlantı gelince flush | Gecikme göstergesi (sarı) |
| Supabase write fail | HTTP 5xx / timeout | Retry 3× → local JSON file'a yaz → sonra flush | "DB bağlantı sorunu" banner (10s sonra kaybolur) |
| Out of memory | Process killed by OS | ECS auto-restart → health check → recovery | "AI servisi yeniden başlatılıyor" (30s) |
| Model file corrupt | Load-time exception | Fallback: COCO pre-trained indir | "Model yeniden yükleniyor" (60s) |

#### Katman 2: Portal Backend Hataları

| Hata | Algılama | Otomatik Aksiyon | UI'a Yansıma |
|------|----------|-----------------|-------------|
| Supabase query timeout | 10s timeout | Retry 1× → cache'ten serve | Toast: "Yükleme yavaş, tekrar deneniyor" |
| Redis connection lost | ioredis reconnect event | Otomatik reconnect (built-in) | Dashboard: "Gerçek zamanlı bağlantı yeniden kuruluyor..." |
| WebSocket disconnect | Client onclose event | Exponential backoff reconnect (1s→2s→4s→max 30s) | Üst banner: "Bağlantı kesildi — yeniden bağlanıyor..." |
| Push notification fail | web-push error | Retry 1× → log → devam et (fire-and-forget) | Sessiz — push kritik değil, dashboard alert yeterli |
| API rate limit aşıldı | 429 status | Queue'ya al, 1s sonra retry | Toast: "Çok fazla istek, lütfen bekleyin" |
| Unhandled exception | Sentry capture | Error boundary → user-friendly mesaj + Sentry ID | "Bir sorun oluştu" + "Tekrar dene" butonu |

#### Katman 3: Frontend UI Hataları

| Hata | Algılama | Otomatik Aksiyon | UI'a Yansıma |
|------|----------|-----------------|-------------|
| Canvas render fail | try/catch in renderLoop | Frame atla, sonraki frame'e devam | Kamera görüntüsü 1 frame donuk kalır (fark edilmez) |
| WebSocket mesaj parse fail | JSON.parse error | Mesajı atla, log'a yaz | Sessiz — sonraki mesaj gelecek |
| Kamera feed yok (boş frame) | Frame boyutu 0 | "Görüntü alınamıyor" placeholder | Kamera alanında gri kutu + mesaj |
| Chart render fail | ErrorBoundary catch | Chart yerine "Grafik yüklenemedi" | Hata mesajı + "Yeniden yükle" butonu |
| Ağ tamamen koptu | navigator.onLine false | OfflineBanner göster | "Çevrimdışısınız" banner (mevcut, §PRD-008) |
| Session expired | Auth check 401 | SessionExpiredModal (mevcut) | "Oturumunuz sona erdi" modal |

#### Hiçbir Zaman Olmaması Gerekenler

| Durum | Neden Olmamalı | Önlem |
|-------|---------------|-------|
| **Beyaz ekran** | Kullanıcı ne olduğunu bilmez | React ErrorBoundary her route'ta, her zaman fallback UI |
| **Sonsuz loading spinner** | Kullanıcı sıkışmış hisseder | Tüm loading state'lere 15s timeout + "Zaman aşımı" mesajı |
| **Sessiz data loss** | Evidence veya incident kaybedilir | Local buffer + retry + audit log her aşamada |
| **Dashboard donması** | 40 öğrenci × 5 FPS = çok update | Canvas rendering React dışında, throttled state updates |
| **Kamera feed donması** | Tek frame takılı kalır | Stale frame detection (5s aynı frame → "Feed dondu" uyarısı) |

### 18.6 Loglama Stratejisi (Faz 2 Ek)

Mevcut PRD-006 loglama sistemi (audit_logs + error_logs + Sentry) Faz 2 için genişletilir:

#### Yeni Log Event Tipleri

```typescript
// types/index.ts'e eklenecek LogEventType'lar:
type LogEventType =
  // ... mevcut Faz 0-1 event'leri ...
  // Faz 2 — Sınav Yönetimi
  | 'exam.create' | 'exam.update' | 'exam.delete' | 'exam.start' | 'exam.end'
  | 'session.start' | 'session.pause' | 'session.end'
  | 'student.import' | 'student.transfer' | 'student.checkout'
  | 'attendance.checkin' | 'attendance.checkout'
  // Faz 2 — AI & Kamera
  | 'camera.connect' | 'camera.disconnect' | 'camera.error' | 'camera.calibrate'
  | 'ai.detection' | 'ai.incident' | 'ai.model_deploy'
  | 'proctor.acknowledge' | 'proctor.dismiss' | 'proctor.escalate' | 'proctor.flag';
```

#### Log Seviyesi Matrisi

| Event | Severity | Nereye Yazılır | Açıklama |
|-------|----------|---------------|----------|
| exam.create | info | audit_logs | Sınav oluşturuldu |
| session.start | info | audit_logs | Oturum başlatıldı |
| camera.connect | info | audit_logs | Kamera bağlandı |
| camera.disconnect | warn | audit_logs + error_logs | Kamera bağlantısı koptu |
| camera.error | error | error_logs + Sentry | Kamera hatası (blur, fps, vb.) |
| ai.detection | debug | Redis only (yüksek hacim) | Her detection → DB'ye yazılmaz |
| ai.incident | info | audit_logs + Supabase incidents | Risk eşiği aşıldı → incident kaydı |
| proctor.dismiss | info | audit_logs | Gözetmen false positive kapattı |
| proctor.escalate | warn | audit_logs + notification | Gözetmen olayı üst yetkiye iletti |
| student.checkout | info | audit_logs | Öğrenci sınavdan çıktı |
| ai.model_deploy | warn | audit_logs | Yeni AI modeli aktif edildi |

#### Performans Logları (AI Servis)

AI servisi her 30 saniyede performans metriklerini loglar:

```json
{
  "type": "ai.performance",
  "timestamp": "2026-06-15T14:30:00Z",
  "session_id": "uuid",
  "metrics": {
    "fps_actual": 4.8,
    "fps_target": 5,
    "yolo_avg_ms": 52,
    "mediapipe_avg_ms": 35,
    "total_pipeline_avg_ms": 95,
    "cpu_percent": 34,
    "memory_mb": 3200,
    "cameras_active": 3,
    "tracks_active": 38,
    "redis_queue_depth": 2,
    "supabase_write_buffer": 12
  }
}
```

Bu metrikler:
- Dashboard'da `/dev/monitor` → AI servis health card'ında gösterilir
- Anomali tespiti: fps_actual < fps_target × 0.5 → admin alert
- Geçmiş analiz: sınav sonrası performans raporu

#### Log Retention (Faz 2 ek)

| Log Tipi | Saklama | Neden |
|----------|---------|-------|
| ai.detection (Redis) | 5 dakika | Yüksek hacim, sadece gerçek zamanlı kullanım |
| ai.performance | 30 gün | Performans trend analizi |
| camera.* events | 90 gün | Kamera sorun geçmişi |
| exam/session events | 1 yıl | Akademik kayıt |
| proctor.* events | 1 yıl | Denetim izi |

### 18.7 Konfigürasyon Master Şeması & Algoritma Spesifikasyonları

> Bu bölüm implementasyon sırasında "burada ne yapmalıyım?" sorusunu ortadan kaldırmak için tüm eşik değerleri, timeout'ları, retry sayılarını, durum makinelerini ve algoritmaları tek merkezde tanımlar.

#### 18.7.1 AI Servis Konfigürasyon Şeması

```json
{
  "frame_sampling": {
    "mediapipe_round_robin_interval": 4,
    "mediapipe_batch_size": 8,
    "high_risk_threshold": 0.5,
    "high_risk_lookback_window_seconds": 30,
    "risk_decay_per_10s": 0.10,
    "risk_downgrade_trigger": "risk_score_below_0.3_and_no_detection_30s"
  },
  "fps_control": {
    "default_fps": 5,
    "alarm_fps": 15,
    "transition_mode": "immediate",
    "high_alert_trigger": "tier1_or_tier2_detection",
    "high_alert_cooldown_seconds": 30,
    "high_alert_downgrade_condition": "risk_score_below_0.3",
    "cpu_protection_threshold_percent": 85,
    "cpu_protection_fallback_fps": 2,
    "cpu_recovery_threshold_percent": 70,
    "cpu_recovery_wait_seconds": 10,
    "max_total_fps": 45
  },
  "inference_pipeline": {
    "yolo_model": "yolov8n",
    "yolo_input_size": 640,
    "resize_strategy": "letterbox",
    "mediapipe_input_source": "original_resolution_crop",
    "confidence_thresholds": {
      "person": 0.50,
      "phone": 0.65,
      "earbuds": 0.60,
      "paper": 0.55,
      "gaze_diversion": 0.70,
      "head_turn": 0.60,
      "lip_movement": 0.75
    }
  },
  "rtsp": {
    "connection_timeout_seconds": 5,
    "read_timeout_seconds": 10,
    "retry_attempts": 3,
    "retry_backoff_ms": [2000, 4000, 8000],
    "max_backoff_seconds": 30,
    "keepalive_interval_seconds": 30,
    "stale_frame_threshold_seconds": 5
  },
  "health_check": {
    "endpoint": "/health",
    "interval_seconds": 10,
    "timeout_seconds": 5,
    "failure_threshold_count": 3,
    "preemptive_restart_memory_percent": 85
  },
  "mediapipe_pool": {
    "use_multiprocessing": true,
    "pool_size": 4,
    "chunk_size": 2,
    "timeout_seconds": 5,
    "on_worker_crash": "restart_worker_and_skip_batch"
  },
  "incident_buffer": {
    "type": "memory",
    "max_size_mb": 100,
    "flush_interval_seconds": 5,
    "max_batch_size": 50,
    "trigger": "max_size_or_max_wait",
    "on_session_end": "flush_immediate",
    "on_write_failure": "retry_individual_rows",
    "retry_count": 3,
    "retry_backoff_ms": [100, 500, 2000]
  },
  "risk_scoring": {
    "escalation": {
      "low_to_medium_count": 3,
      "low_to_medium_window_minutes": 5,
      "medium_to_high_count": 2,
      "medium_to_high_window_minutes": 5,
      "high_plus_medium_to_critical_window_minutes": 10
    },
    "de_escalation": {
      "no_incident_window_minutes": 5,
      "risk_threshold": 0.35,
      "severity_drop_levels": 1,
      "double_drop_window_minutes": 10,
      "double_drop_levels": 2
    }
  },
  "backpressure": {
    "redis_queue_depth_alert": 50,
    "redis_queue_depth_critical": 200,
    "buffer_full_strategy": "drop_oldest_detection",
    "throttle_target_fps": 2,
    "memory_limit_buffer_percent": 80
  },
  "websocket": {
    "heartbeat_interval_seconds": 30,
    "heartbeat_type": "app_level_ping",
    "ai_service_reconnection": {
      "initial_delay_ms": 100,
      "max_delay_ms": 30000,
      "backoff_factor": 2.0,
      "max_jitter_ms": 1000,
      "buffer_messages_during_disconnect": true,
      "buffer_max_messages": 1000
    },
    "dashboard_client_reconnection": {
      "initial_delay_ms": 1000,
      "max_delay_ms": 30000,
      "backoff_factor": 2.0,
      "show_reconnection_banner": true,
      "drop_stale_frames_on_reconnect": true
    }
  },
  "video_transport": {
    "normal_annotated_fps": 2,
    "alarm_annotated_fps": 5,
    "metadata_fps": 5,
    "jpeg_quality": 70,
    "max_frame_size_bytes": 30000,
    "adaptive_quality": true,
    "client_bandwidth_warning_kbps": 500,
    "low_bandwidth_jpeg_quality": 40,
    "low_bandwidth_fps": 1
  },
  "logging": {
    "ai_detection": {
      "level": "debug",
      "destination": "redis_only",
      "sample_rate": 0.01,
      "retention_days": 14
    },
    "ai_incident": {
      "level": "info",
      "destination": "audit_logs_and_supabase",
      "sample_rate": 1.0,
      "retention_days": 365
    },
    "ai_performance": {
      "level": "info",
      "interval_seconds": 30,
      "retention_days": 30
    }
  },
  "models": {
    "yolo": {
      "name": "yolov8n",
      "version": "1.0.0",
      "path": "/app/models/yolov8n.pt",
      "input_size": 640
    },
    "mediapipe": {
      "version": "0.10.x",
      "checkpoint": "face_landmarker.task",
      "path": "/app/models/"
    },
    "warm_up": {
      "enabled": true,
      "iterations": 10,
      "dummy_frame_size": [640, 480],
      "max_warmup_latency_ms": 150,
      "warmup_before_health_check": true
    }
  },
  "sentry": {
    "enabled": true,
    "traces_sample_rate": 0.1,
    "max_breadcrumbs": 100,
    "ignored_errors": ["BriefRedisDisconnect", "RTSPTemporaryTimeout"],
    "alert_threshold_per_minute": 10,
    "grouping": "by_exception_type_and_camera"
  }
}
```

#### 18.7.2 Durum Makineleri (State Machines)

**1. Kamera Sağlık Durumu:**
```
                    ┌─────────────────────────────────┐
                    │                                 │
                    ▼                                 │
            ┌──────────┐  blur<100 3/5 frame  ┌──────────┐
            │  NORMAL  │ ──────────────────► │ WARNING  │
            └──────────┘                      └──────────┘
                 ▲                                 │
                 │ blur>100                        │ blur<50
                 │ 10 ardışık                      │ 5/5 ardışık
                 │                                 ▼
            ┌──────────┐  blur>100 3/5       ┌──────────┐
            │ WARNING  │ ◄───────────────── │ CRITICAL │
            └──────────┘                     └──────────┘
                                                   │
                                                   │ 2dk+ critical
                                                   ▼
                                              ┌──────────┐
     RTSP 3x retry başarısız ─────────────► │ OFFLINE  │
     (herhangi bir durumdan)                 └──────────┘
                                                   │
                                    exp backoff    │ ilk frame geldi
                                    (max 30s)      ▼
                                              ┌──────────┐
                                              │ NORMAL   │
                                              └──────────┘
```

**2. FPS Geçiş Durumu (per kamera):**
```
                    tier1/tier2 algılandı
    ┌────────────┐ ──────────────────────► ┌────────────┐
    │ NORMAL (5) │                         │ ALARM (15) │
    └────────────┘ ◄────────────────────── └────────────┘
                    30s temiz + risk<0.3
                                                │
                                    CPU > 85%   │
                                                ▼
                                    ┌────────────────────┐
                                    │ CPU_PROTECTION (2) │
                                    └────────────────────┘
                                                │
                                    CPU < 70%   │ 10s boyunca
                                                ▼
                                    ┌────────────┐
                                    │ NORMAL (5) │
                                    └────────────┘
```

**3. Kamera Duraklatma (Pause):**
```
    ┌────────┐  proctor manual VEYA blur_critical >2dk  ┌────────┐
    │ ACTIVE │ ──────────────────────────────────────► │ PAUSED │
    └────────┘ ◄──────────────────────────────────────  └────────┘
                proctor manual resume                       │
                                                  5dk timeout│
                                                            ▼
                                                    ┌──────────┐
                                              ✅──► │ ACTIVE   │ (ilk frame geldi)
                                    auto-resume     └──────────┘
                                    deneme          ┌──────────┐
                                              ❌──► │ OFFLINE  │ (RTSP fail)
                                                    └──────────┘

Paused kamera: frame'ler discard edilir (buffer yok), Redis camera_health "paused" olarak işaretlenir.
Dashboard'da: kamera kartı gri, "Duraklatıldı" etiketi.
```

**4. İkincil Kamera Devralma (Failover):**
```
    ┌────────────────┐  RTSP timeout (5s)   ┌────────────────┐
    │ PRIMARY_ACTIVE │ ──────────────────► │ PRIMARY_RETRY  │
    └────────────────┘                      └────────────────┘
           ▲                                       │
           │                          3x retry     │ exhausted (14s)
           │ primary healthy 10s                   ▼
           │                              ┌─────────────────────┐
           └───────────────────────────── │ SECONDARY_ACTIVATED │
                                          └─────────────────────┘
                                                   │
                                     secondary de  │ fail
                                                   ▼
                                          ┌─────────────────┐
                                          │ COVERAGE_GAP    │
                                          │ (admin alert)   │
                                          └─────────────────┘

Seçim algoritması:
  candidates = secondary_camera_ids
    .filter(cam => quality_score[cam] > 0.4 AND status != "offline")
    .sort_by(spatial_angle_distance ASC)
  if candidates.empty → coverage_gap_warning()
  else → activate candidates[0]
```

#### 18.7.3 Round-Robin MediaPipe Algoritması

```python
# Pseudo-code — AI servis frame_processor.py
round_robin_pointer = 0

for each frame:
    all_tracks = tracker.get_active_tracks()
    high_risk = [t for t in all_tracks if risk_score[t.id] > config.high_risk_threshold]
    other = [t for t in all_tracks if risk_score[t.id] <= config.high_risk_threshold]

    # Yüksek riskli: HER frame'de MediaPipe uygula
    mediapipe_results_hr = pool.map(apply_mediapipe, high_risk)

    # Diğerleri: round-robin (her N frame'de bir batch)
    if frame_number % config.mediapipe_round_robin_interval == 0:
        if len(other) > 0:
            batch_start = round_robin_pointer * config.mediapipe_batch_size
            batch = other[batch_start : batch_start + config.mediapipe_batch_size]
            mediapipe_results_rr = pool.map(apply_mediapipe, batch)
            round_robin_pointer = (round_robin_pointer + 1) % ceil(len(other) / config.mediapipe_batch_size)

    # Risk score decay: her 10s'de %10 azalt
    for track in all_tracks:
        if no_detection_last_10s(track):
            risk_score[track.id] *= (1 - config.risk_decay_per_10s)
```

**Davranış kuralları:**
- Pointer session pause/resume'da sıfırlanmaz (kaldığı yerden devam eder)
- high_risk → round-robin geçiş: risk_score < 0.3 VE 30s boyunca tespit yok
- round-robin tam tur: `ceil(öğrenci_sayısı / batch_size) × round_robin_interval` frame = tüm öğrenciler taranmış olur
- 40 öğrenci, batch=8, interval=4 → 5 tur × 4 frame = 20 frame'de herkes taranır (5 FPS'te 4 saniye)

#### 18.7.4 Graceful Degradation Matrisi

| Arıza | Dashboard | AI Algılama | Incident Kaydı | Push Bildirim | Otomatik Kurtarma | Süre |
|-------|-----------|-------------|-----------------|---------------|-------------------|------|
| **Redis down** | ⚠️ Supabase Realtime fallback (50-100ms gecikme) | ✅ Çalışır (local buffer) | ✅ Supabase direkt write | ✅ | ioredis auto-reconnect | 2-5s |
| **Supabase down** | ⚠️ Redis cache'ten serve | ✅ Çalışır | ❌ Local JSON buffer → sonra flush | ❌ Push kaynak yok | retry 3× + buffer | <60s |
| **AI servis down** | ✅ Statik kamera feed (video overlay yok) | ❌ Algılama durur | ❌ Yeni incident üretilmez | ❌ Alert yok | ECS auto-restart | 30s |
| **Redis + Supabase** | ⚠️ Son cache verileri | ✅ Local buffer | ❌ Buffer (her ikisi gelince flush) | ❌ | Bağımsız retry | <60s |
| **Tek kamera offline** | ✅ Diğer kameralar + "offline" kartı | ⚠️ Kapsama azalır, secondary devralır | ✅ | ✅ Proctor alert | RTSP retry + secondary | 14s |
| **Tüm kameralar offline** | ✅ "Feed yok" placeholder | ❌ | ❌ | ⚠️ Admin acil alert | RTSP retry (paralel) | 14-30s |
| **Network tamamen koptu** | ❌ Offline banner (PWA) | ❌ | ❌ | ❌ | navigator.onLine check | Manuel |
| **AI servis memory leak** | ✅ (kısa spike hissedilmez) | ⚠️ GC pause sırasında frame drop | ✅ | ✅ | Preemptive restart (%85 memory) | 5-30s |

**Kritik kural:** Hiçbir arıza incident verisinin kalıcı kaybına yol açmamalıdır. Her katmanda buffer + retry mekanizması vardır.

#### Internet Kesintisi Kurtarma Prosedürü

**AI Servis tarafı:**
- RTSP stream koparsa: §3.4'teki retry mantığı (3× backoff)
- Redis bağlantısı koparsa: local memory buffer'a yaz (max 100MB, §18.7.1)
- Supabase bağlantısı koparsa: incident'lar local JSON file'a yaz

**Local buffer SLA:**
- Buffer kapasitesi: 30 saniye frame (5 FPS × 30s = 150 frame × 50KB = 7.5 MB)
- Incident buffer: 100MB (§18.7.1 incident_buffer config)
- Buffer dolunca: en eski detection drop, incident'lar korunur (incident > detection önceliği)

**Reconnect sonrası:**
1. AI servis Redis'e yeniden bağlanır → buffer flush (FIFO)
2. Supabase'e incident batch write → local JSON temizlenir
3. Dashboard: 'Bağlantı yeniden kuruldu — [X] incident senkronize edildi' banner (10s)

**Proctor dashboard tarafı:**
- WebSocket koparsa: 'Bağlantı kesildi — yeniden bağlanılıyor...' banner
- Reconnect sonrası: son 30 saniyenin incident'ları otomatik yüklenir (catch-up)
- Frame buffer: client-side yok (son frame gösterilir, donuk kalır → 'Feed duraklatıldı' overlay)

#### 18.7.5 Health Check API Spesifikasyonu

**AI Servis:**
```
GET /health
Response 200:
{
  "status": "healthy | degraded | unhealthy",
  "timestamp": "2026-06-15T14:30:00Z",
  "uptime_seconds": 3600,
  "checks": {
    "models_loaded": true,
    "redis_connected": true,
    "supabase_writable": true,
    "cameras": {
      "total": 3,
      "healthy": 2,
      "degraded": 1,
      "offline": 0
    },
    "pipeline": {
      "avg_latency_ms": 95,
      "fps_actual": 4.8,
      "fps_target": 5,
      "buffer_queue_depth": 2,
      "memory_usage_mb": 3200,
      "cpu_percent": 34
    }
  }
}
```

**Status belirleme mantığı:**
| Durum | Koşul |
|-------|-------|
| `healthy` | Tüm check'ler geçer VE fps_actual >= fps_target × 0.8 |
| `degraded` | >=1 kamera offline VEYA fps_actual < fps_target × 0.8 VEYA memory > %80 |
| `unhealthy` | Model yüklenmemiş VEYA Redis bağlantısız VEYA tüm kameralar offline |

**Portal `/api/health/detailed` genişletmesi:**
Mevcut health check'e (PRD-007) ek olarak AI servis durumu eklenir:
```json
{
  "services": {
    "supabase": { "status": "healthy", "latency_ms": 12 },
    "sentry": { "status": "healthy" },
    "ai_service": {
      "status": "healthy",
      "latency_ms": 95,
      "cameras_active": 3,
      "fps_actual": 4.8
    }
  }
}
```

#### 18.7.6 WebSocket Mesaj Şemaları (Genişletilmiş)

**Koordinat sistemi standardı:**
- `bbox`: `[x_norm, y_norm, w_norm, h_norm]` — 0-1 arası, YOLO inference space (640×640, letterbox)
- `gaze.direction`: `[x, y]` — -1 ile 1 arası (negatif = sol/yukarı)
- `head_pose`: `{yaw, pitch, roll}` — derece cinsinden
- `student_id`: track henüz eşleştirilmemişse `null`

**Annotated frame şeması (server → client):**
```typescript
interface AnnotatedFrame {
  type: "frame";
  camera_id: string;
  timestamp: string;        // ISO 8601
  frame: string;             // Base64 JPEG
  width: number;             // inference output (640)
  height: number;
  annotations: Annotation[];
}

interface Annotation {
  track_id: number;
  student_id: string | null;
  student_name: string | null;
  bbox: [number, number, number, number]; // [x, y, w, h] normalized 0-1
  risk_score: number;        // 0-1
  risk_level: "low" | "medium" | "high";
  detections: IncidentType[];
  gaze: {
    direction: [number, number]; // [-1,1] x, [-1,1] y
    is_diverted: boolean;
    confidence: number;      // 0-1
  } | null;
  head_pose: {
    yaw: number;             // derece
    pitch: number;
    roll: number;
  } | null;
}
```

**Client → server QoS feedback:**
```json
{
  "type": "client_metrics",
  "frame_buffer_latency_ms": 250,
  "frame_drop_rate": 0.05,
  "bandwidth_estimate_kbps": 800
}
```
Server davranışı: `bandwidth_estimate_kbps < 500` → jpeg_quality 70→40 + fps 2→1.

#### 18.7.7 Performans SLA Hedefleri

| Metrik | Hedef | Kabul Edilebilir | Kritik (alert tetikler) |
|--------|-------|------------------|------------------------|
| AI pipeline latency (per frame) | < 100ms | < 200ms | > 500ms |
| Detection → Dashboard latency | < 500ms | < 1s | > 3s |
| Incident → Supabase write | < 10s | < 30s | > 60s |
| Health check response | < 2s | < 5s | > 10s |
| AI servis cold start | < 30s | < 60s | > 120s |
| Kamera reconnect (toplam) | < 15s | < 30s | > 60s |
| Dashboard frame render | < 50ms | < 100ms | > 200ms |
| Memory growth (saat başı) | < 50 MB | < 100 MB | > 200 MB |
| Redis round-trip | < 5ms | < 10ms | > 50ms |
| Dropped frame oranı (saat başı) | < %1 | < %5 | > %10 |

"Kritik" sütununu aşan metrikler §18.6'daki monitoring alert'i tetikler. Peş peşe 3 "kritik" ölçüm → admin push notification.

#### 18.7.8 Session Settings Override Hiyerarşisi

```
Öncelik (yüksekten düşüğe):
  1. Per-student accommodation (§7.6) — bireysel eşik ayarları
  2. Session-level settings (exam_sessions.settings JSONB) — proctor ayarlayabilir
  3. Exam-level defaults (exams.settings JSONB) — admin sınav oluştururken ayarlar
  4. Global config (ai-service config.json) — deploy ile gelir

Merge stratejisi: deep merge, yüksek öncelikli key kazanır.
```

**Proctor mid-session değişiklik yapabilir mi?** Evet.
- Dashboard'da "Oturum Ayarları" panelinden eşik değerleri (confidence, FPS, sensitivity) değiştirilebilir
- Değişiklik `exam_sessions.settings` JSONB'ye yazılır
- AI servise WebSocket `config_update` mesajı ile anlık push edilir
- Değişiklik audit_logs'a kaydedilir

```json
// WS mesajı: Portal → AI Servis
{
  "type": "config_update",
  "session_id": "uuid",
  "changes": {
    "confidence_thresholds.phone": 0.75,
    "fps_control.alarm_fps": 10
  },
  "changed_by": "user_id",
  "timestamp": "ISO8601"
}
```

#### 18.7.9 Veritabanı Transaction İzolasyonu

| İşlem | İzolasyon Seviyesi | Neden |
|-------|-------------------|-------|
| Incident batch insert | READ COMMITTED | Phantom read riski düşük, yüksek throughput gerekli |
| Accommodation re-scoring | SERIALIZABLE | Concurrent re-score race condition önleme |
| Session start/end | READ COMMITTED | Tek writer (proctor), conflict yok |
| Seat assignment | SERIALIZABLE | Aynı koltuğa iki öğrenci atanmasını önle |
| Report generation | READ COMMITTED (snapshot) | Uzun okuma, write'ı bloklamaz |
| Risk score update | READ COMMITTED | Stale read tolere edilebilir, high throughput |

**Accommodation re-scoring kilitleme:**
```sql
BEGIN;
  -- İlgili incident'ları kilitle
  SELECT id FROM incidents
    WHERE session_id = $1 AND student_id = $2
    FOR UPDATE;

  -- Re-score uygula
  UPDATE incidents SET risk_score = recalculated_score, severity = new_severity
    WHERE session_id = $1 AND student_id = $2;

  -- Audit log
  INSERT INTO rescore_logs (session_id, student_id, old_scores, new_scores, reason)
    VALUES ($1, $2, $3, $4, 'accommodation_applied');
COMMIT;
```

#### 18.7.10 Test Modu Spesifikasyonu

Test modu (`/rooms/[id]` → "Test Modu Başlat") sınav oluşturmadan kamera + AI testi yapar:

| Konu | Davranış |
|------|----------|
| Veritabanı | Geçici `exam_sessions` kaydı oluşturulur: `test_mode = true` |
| Incident'lar | `incidents` tablosuna yazılır, `is_test = true` flag'i ile |
| Raporlarda | Test incident'ları tüm sorgu ve raporlardan otomatik hariç tutulur |
| Temizlik | Test session bittikten 24 saat sonra otomatik silinir (cron) |
| Geçiş | Test → gerçek sınava geçiş yapılamaz, yeni session gerekir |
| Veri izolasyonu | Test verileri monitor aggregation'larını etkilemez |

```sql
ALTER TABLE exam_sessions ADD COLUMN test_mode BOOLEAN DEFAULT false;
-- Tüm sorgulara: WHERE test_mode = false (default filter)
```

**UI-Driven Prova Akışı:**

Oda detay sayfasında (`/rooms/[id]`) 'Prova Başlat' butonu:
1. Tıklandığında: 'Bu prova gerçek sınav oluşturmaz. AI algılama test edilir, veriler 24 saat sonra silinir.' onay modal
2. Onay → test session oluşturulur (`test_mode=true`)
3. Dashboard açılır: kamera feed + overlay + alert panel (gerçek sınav gibi)
4. Admin/proctor tüm butonları test edebilir (dismiss, flag, checkout vb.)
5. 'Provayı Bitir' → session sonlanır, 24h sonra auto-delete
6. Prova sonucu kartı: 'Kameralar ✅ / AI tespiti ✅ / FPS: 4.8/5.0 ✅ / Sorunlar: Kamera 2 blur uyarısı'

**Kısıtlama:** Aynı anda max 1 prova per oda. Gerçek sınav aktifken prova başlatılamaz.

#### 18.7.11 Overlay Görsel Spesifikasyonu

**Renk kodları:**
```json
{
  "overlay_colors": {
    "low_risk":    { "hex": "#22C55E", "label": "Düşük" },
    "medium_risk": { "hex": "#F59E0B", "label": "Orta" },
    "high_risk":   { "hex": "#EF4444", "label": "Yüksek" },
    "critical":    { "hex": "#EF4444", "blink_interval_ms": 500, "label": "Kritik" }
  },
  "accessibility": {
    "color_blind_patterns": true,
    "low_risk_pattern": "none",
    "medium_risk_pattern": "diagonal_lines",
    "high_risk_pattern": "crosshatch"
  }
}
```

**Toggle durumu:** Per-user localStorage'da saklanır (session-bağımsız). Her kullanıcı kendi toggle'larını görür.
**Z-order (alttan üste):** risk_bars → gaze_lines → boxes → labels
**Stale overlay:** Risk score güncellemesi 5s gecikirse önceki renk soluklaştırılır (alpha 0.3).

#### 18.7.12 Snapshot (Anlık Görüntü) Yönetimi

Proctor "Capture" butonuna tıkladığında:

| Konu | Değer |
|------|-------|
| Depolama | Supabase Storage: `evidence/{session_id}/snapshots/{uuid}.jpg` |
| Metadata | session_id, camera_id, captured_by, captured_at, detected_track_ids[], note |
| Duplicate | Aynı camera+second içinde max 1 snapshot (debounce 1s) |
| Incident bağlantısı | Eğer aktif incident varsa `evidence_paths[]`'e eklenir, yoksa bağımsız kayıt |
| Retention | Session evidence ile aynı: 90 gün (§21.1) |

#### 18.7.13 Distributed Tracing

Tüm isteklerde `X-Trace-ID` header'ı taşınır:

```
Kamera frame → AI Servis (trace_id oluştur)
  → Redis PUBLISH (trace_id metadata'da)
  → Supabase INSERT (trace_id metadata JSONB'de)
  → Portal WS broadcast (trace_id frame mesajında)
  → Dashboard render (trace_id console.debug'da)
```

End-to-end latency: her aşamanın timestamp'i `ai.performance` logunda tutulur.
Debug için: `/dev/monitor` sayfasında son 100 trace'in latency breakdown'ı gösterilir.

---

## 19. Implementation Fazları

| Faz | Kapsam | Tracker | Scoring | Prerequisite |
|-----|--------|---------|---------|-------------|
| **A** | Tek kamera, tek oda, **phone + empty_seat** (COCO pre-trained) | BoT-SORT (tek cam) | Rule-based | Faz 0-1 tamam ✅ |
| **A.1** | Phase A + **gaze + head_turn** (MediaPipe) eklenir | BoT-SORT (tek cam) | Rule-based | Phase A çalışır, benchmark yapıldı |
| **B** | Çoklu kamera, uzamsal füzyon, earbuds/material (custom trained) | BoT-SORT/cam + füzyon | Rule-based + multi-view conf. | Phase A.1 çalışır |
| **C** | Full füzyon, LSTM/GRU davranışsal model, post-exam raporlar | BoT-SORT + track fusion | LSTM/GRU + rule-based hybrid | Phase B + eğitim verisi |
| **D** | Çoklu oda paralel izleme, ölçeklendirme | Distributed | Full behavioral model | Phase C + infra scaling |

**Phase A / A.1 ayrımı gerekçesi:**
- Phase A'da sadece COCO pre-trained tespitler kullanılır (phone + person). Sıfır annotation, sıfır eğitim, sıfır MediaPipe bağımlılığı. Bu en hızlı MVP'dir.
- Phase A.1'de MediaPipe Face Mesh eklenir (gaze + head_turn). Bu adım benchmark sonuçlarına bağlıdır — gerçek sınıf ortamında phone precision > %80 ve gaze recall > %70 doğrulandıktan sonra aktif edilir.
- Bu ayrım, projelerin "her şeyi birden aktif edip hiçbirinin çalışmaması" riskini ortadan kaldırır.

**AI Scoring Stratejisi:**
- Phase A–B: Kural tabanlı (deterministik, yorumlanabilir, eğitim verisi gereksiz)
- Phase C: LSTM/GRU sequence model (etiketli incident corpus'u gerektirir — Phase A/B üretim kullanımından elde edilir)
- Gerekçe: Akademik dürüstlük kararları için yorumlanabilirlik zorunlu; ML modeli kural tabanlı sistemi destekler, yerini almaz

---

## 20. Key Files

| Dosya | Rol |
|-------|-----|
| `ai-service/` | Python AI servisi (FastAPI + YOLOv8 + MediaPipe) |
| `portal/app/(protected)/exams/` | Sınav yönetimi + oturum sayfaları |
| `portal/app/(protected)/rooms/` | Oda yönetimi sayfaları |
| `portal/app/(protected)/students/` | Öğrenci yönetimi sayfaları |
| `portal/app/api/sessions/` | Session API route'ları |
| `portal/app/api/rooms/` | Room API route'ları |
| `portal/app/api/students/` | Student API route'ları |
| `portal/app/api/incidents/` | Incident API route'ları |
| `portal/app/api/push/` | Push notification route'ları |
| `portal/lib/audio/alert-sounds.ts` | Sesli uyarı yönetimi |
| `portal/public/sounds/` | Alert ses dosyaları |
| `portal/app/(protected)/ai/training/` | Fine-tuning arayüzü |
| `portal/app/api/ai/` | AI model eğitim + deploy API route'ları |

---

## 21. Evidence Retention Policy

### 21.0 Evidence Format Spesifikasyonu

| Evidence Tipi | Format | Boyut | Depolama Yolu |
|---------------|--------|-------|---------------|
| Incident frame snapshot | JPEG, quality 85, max 1280px wide | 30-80 KB | `evidence/{session_id}/incidents/{incident_id}.jpg` |
| Proctor manual capture | JPEG, quality 85, max 1280px wide | 30-80 KB | `evidence/{session_id}/snapshots/{uuid}.jpg` |
| Face crop (enrollment) | JPEG, quality 90, 256×256px | 10-20 KB | `evidence/{session_id}/faces/{student_id}.jpg` |

**Video kaydı yapılmaz.** Canlı stream sadece RAM'de işlenir. Sadece incident anında tek frame kaydedilir.

**Metadata:** Her evidence dosyasının yanında `{filename}.meta.json` kaydedilir:
```json
{
  "session_id": "uuid",
  "camera_id": "uuid",
  "captured_at": "ISO8601",
  "incident_id": "uuid | null",
  "track_ids": [5, 12],
  "resolution_original": "1920x1080",
  "resolution_saved": "1280x720"
}
```

### 21.1 Saklama Süreleri

| Veri Tipi | Saklama Süresi | Sonra |
|-----------|---------------|-------|
| Frame snapshot (incident evidence) | 90 gün | Otomatik silme (cron/purge endpoint) |
| Incident kaydı (DB) | 1 yıl | Arşivleme (ayrı tablo veya cold storage) |
| Canlı stream | Saklanmaz | Sadece gerçek zamanlı işlenir |
| Sınav oturumu meta verisi | Süresiz | — |
| Öğrenci track verileri | Session bitiminden 90 gün sonra | Otomatik silme |

### 21.2 Storage Quota Yönetimi

- Supabase Storage Pro plan: 100GB dahil
- Tahmini kullanım: 1 sınav oturumu (~2 saat, ~50 incident) ≈ 50-200MB evidence
- **Quota uyarısı:** %80 dolulukta admin'e notification (PRD-016)
- **Quota aşımında:** Yeni evidence kaydı loglanır ama frame saklanmaz, sadece incident metadata tutulur. `evidence_paths` alanı boş array (`[]`) olarak kaydedilir. Dashboard'da evidence görüntüleme tıklandığında: "Evidence kaydedilemedi (depolama kotası aşıldı)" mesajı gösterilir

### 21.3 Temizlik

```
POST /api/evidence/purge    → 90 günden eski evidence'ı sil (admin veya cron)
```

**Purge istisnası:**
Auto-purge job çalışmadan önce şu kontrolleri yapar:
1. Incident `is_reviewed = false` → purge etme (henüz incelenmemiş)
2. Incident `proctor_decision IS NULL` VE `created_at > 60 gün` → proctor'a uyarı email gönder, 30 gün daha bekle
3. Aktif itiraz kaydı varsa (ileride appeal tablosu) → purge etme

**Manuel pin:** Admin herhangi bir evidence'ı 'Sakla' olarak işaretleyebilir → auto-purge'den hariç tutulur (süresiz).

---

## 22. Sınav Sonrası Raporlama & Analitik

**Rapor Erişim Kontrolü:**

| Rapor Tipi | admin | chief_proctor | proctor | Öğrenci |
|------------|-------|---------------|---------|---------|
| Öğrenci raporu | ✅ Hepsi | ✅ Kendi oturumu | ✅ Kendi oturumu | ❌ (opsiyonel: sadece kendi) |
| Oturum raporu | ✅ Hepsi | ✅ Kendi oturumu | ✅ Kendi oturumu | ❌ |
| Sınav raporu | ✅ | ✅ | ❌ | ❌ |
| Ders analitik | ✅ | ❌ | ❌ | ❌ |
| Sistem analitik | ✅ | ❌ | ❌ | ❌ |
| Persona kartı | ✅ | ✅ | ❌ | ❌ |
| Risk geçmişi (cross-exam) | ✅ | ❌ | ❌ | ❌ |

### 22.1 Raporlama Katmanları

5 seviyeli raporlama hiyerarşisi:

| Katman | Route | İçerik |
|--------|-------|--------|
| **Öğrenci** | `/exams/[id]/sessions/[sid]/reports/[student]` | Bireysel davranış raporu + persona kartı |
| **Oturum (Sınıf)** | `/exams/[id]/sessions/[sid]/report` | Oda bazlı özet + koltuk heatmap |
| **Sınav** | `/exams/[id]/report` | Tüm oturumlar arası karşılaştırma |
| **Ders** | `/analytics/courses/[code]` | Ders bazlı trend (sınavlar arası) |
| **Genel** | `/analytics` | Tüm sistem istatistikleri + trendler |

### 22.2 Öğrenci Raporu & Persona Kartı

Her öğrenci için sınav sonrası otomatik oluşturulan detaylı rapor:

```
┌─────────────────────────────────────────────────────────────┐
│  📋 Bireysel Sınav Raporu                                   │
│                                                             │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  PERSONA KARTI                                         ││
│  │  ┌──────┐                                              ││
│  │  │ 📷   │  Ahmet Yılmaz                               ││
│  │  │avatar│  No: 20210001 | Sıra: A3 | Lab A            ││
│  │  │      │  Süre: 1s 22dk (82/120 dk)                  ││
│  │  └──────┘                                              ││
│  │                                                        ││
│  │  Risk Seviyesi: ████████░░ 0.72 — YÜKSEK               ││
│  │  Persona Tipi:  🔴 ŞÜPHELİ (Suspicious)               ││
│  │  Toplam Incident: 5 (2 high, 2 medium, 1 low)         ││
│  │  Geçmiş Sınavlar: 3 sınav, ort. risk 0.45 ↗ yükseliş ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  ── ZAMAN ÇİZELGESİ ───────────────────────────────────── │
│                                                             │
│  Risk Skoru (zaman)                                        │
│  1.0 ┤                                                     │
│  0.8 ┤              ╭──╮         ╭────╮                    │
│  0.6 ┤          ╭───╯  ╰──╮  ╭──╯    │                    │
│  0.4 ┤      ╭───╯         ╰──╯       │                    │
│  0.2 ┤──────╯                        ╰────                │
│  0.0 ┤                                                     │
│      └──┬──────┬──────┬──────┬──────┬──────                │
│       14:00  14:15  14:30  14:45  15:00  15:22(çıkış)      │
│                                                             │
│  📌 Flag'lı Anlar:                                         │
│  ├── 14:23 📱 Telefon tespiti (conf: 0.91) [📷 evidence]  │
│  ├── 14:35 👁 Bakış sapması ×4 (5dk içinde) [📷]          │
│  └── 14:48 📱 Telefon + kafa dönüşü (combined) [📷]      │
│                                                             │
│  ── DAVRANIŞ ANALİZİ ─────────────────────────────────── │
│                                                             │
│  Radar Chart:                                              │
│       Bakış Sapması                                        │
│            ╱╲                                              │
│     Kafa  ╱  ╲  Telefon                                    │
│     Dön. ╱ ██ ╲ Kullanımı                                  │
│         ╱██████╲                                           │
│   Boş  ╱────────╲ Kağıt                                   │
│   Kolt.            Tespit                                  │
│                                                             │
│  ── KARŞILAŞTIRMA ────────────────────────────────────── │
│                                                             │
│  Bu öğrenci vs Sınıf ortalaması:                           │
│  ┌──────────────┬──────────┬──────────┐                    │
│  │ Metrik        │ Öğrenci  │ Ort.     │                    │
│  ├──────────────┼──────────┼──────────┤                    │
│  │ Risk skoru    │ 0.72     │ 0.28     │ ↑ %157            │
│  │ Incident      │ 5        │ 1.2      │ ↑ %317            │
│  │ Bakış sapması │ 12 kez   │ 3.5 kez  │ ↑ %243            │
│  │ Sınav süresi  │ 82 dk    │ 95 dk    │ ↓ erken çıkış     │
│  └──────────────┴──────────┴──────────┘                    │
│                                                             │
│  [📄 PDF İndir]  [🔗 Paylaş]  [✏️ Not Ekle]              │
└─────────────────────────────────────────────────────────────┘
```

#### Persona Tipleri

Sistem, öğrencinin davranış profilini otomatik sınıflandırır:

| Persona | Ikon | Kriter | Açıklama |
|---------|------|--------|----------|
| **Sakin (Calm)** | 🟢 | risk < 0.15, 0 incident | Hiçbir şüpheli davranış yok |
| **Normal** | 🔵 | risk 0.15-0.35, ≤2 low incident | Düşük seviye, doğal hareketler |
| **Huzursuz (Restless)** | 🟡 | risk 0.35-0.55, bakış sapması ağırlıklı | Sık bakınma ama kopya göstergesi düşük |
| **Şüpheli (Suspicious)** | 🟠 | risk 0.55-0.75, çoklu incident tipi | Birden fazla şüpheli davranış |
| **Yüksek Risk (High Risk)** | 🔴 | risk > 0.75 veya ≥1 critical incident | Ciddi kopya şüphesi |

Persona **sadece bilgilendirme** amaçlıdır — disiplin kararı vermez. Gözetmenin ve idarenin kendi değerlendirmesini destekler.

**⚠️ Zorunlu Disclaimer:** Her raporda ve persona kartında şu uyarı gösterilir:

> *Bu persona değerlendirmesi yapay zeka analizi sonucu oluşturulmuştur ve kopya kararı niteliğinde değildir. Nihai değerlendirme yetkili gözetmenin sorumluluğundadır. AI tespitleri yanlış pozitif içerebilir.*

Persona etiketleri asla öğrenciye gösterilmez. Sadece admin ve chief_proctor erişimine açıktır.

**Dismiss edilen incident'lar raporda:**
- Rapor'da ayrı bölüm: 'Proctor Overrides (X incident dismiss edildi)'
- Dismiss edilen incident'lar risk score hesaplamasına dahil edilmez
- Ama raporda görünür (şeffaflık): soluk renk + 'Dismissed by [proctor]' etiketi
- Bu sayede denetçi, proctor'ın kaç FP dismiss ettiğini görebilir (kalite kontrolü)

**Persona UI tasarım kuralları:**
- Büyük renkli badge (🔴🟠🟡🟢) **kullanılmaz** — bias yaratır
- Bunun yerine: text-only format: 'Davranış Profili: Normal (risk 0.28, sınıf ortalamasında)'
- Renk yalnızca bar chart'ta kullanılır (arka planda, dikkat çekmeyen)
- Disclaimer rapor sayfasının **en üstünde** gösterilir (fold üstü, kaçırılamaz)
- Persona kartı yalnızca admin ve chief_proctor'a gösterilir (proctor göremez)

**Proctor Öneri Bölümü:**

Her öğrenci raporunun sonunda otomatik öneri kutusu:

| Risk Durumu | Öneri | Renk |
|-------------|-------|------|
| risk < 0.25 VE 0 high/critical incident | 'Sorun tespit edilmedi — inceleme gerekmez' | Yeşil |
| risk 0.25-0.60 VEYA 1-2 medium incident | 'Bazı tespitler mevcut — proctor incelemesi önerilir' | Sarı |
| risk > 0.60 VEYA herhangi high/critical | 'Yüksek risk — detaylı inceleme ve olası disiplin değerlendirmesi önerilir' | Kırmızı |

**⚠️ Uyarı:** Bu öneri yapay zeka analizi sonucudur. Nihai karar yetkili gözetmenin sorumluluğundadır.

Öneri kutusu her zaman rapor sayfasının sonunda gösterilir. Proctor'ın post-exam review kararı (`clean`/`suspicious`/`violation`) bu öneriyi override eder.

### 22.3 Oturum (Sınıf) Raporu

Her oda/oturum için sınav sonrası oluşturulan rapor:

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Oturum Raporu — Lab A                                   │
│  CMPE 492 Final | 15 Haz 2026, 14:00-16:00                │
│  Gözetmenler: Ayşe Kaya, Mehmet Demir                      │
│                                                             │
│  ── ÖZET KARTLARI ──────────────────────────────────────── │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐   │
│  │ 40     │ │ 38     │ │ 12     │ │ 0.28   │ │ 95 dk  │   │
│  │Kayıtlı │ │Katılım │ │Incident│ │Ort.Risk│ │Ort.Süre│   │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘   │
│                                                             │
│  ── KOLTUK HEATMAP ─────────────────────────────────────── │
│                                                             │
│       [TAHTA]                                              │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐   ┌──┐ ┌──┐ ┌──┐ ┌──┐              │
│  │🟢│ │🟢│ │🟡│ │🟢│   │🔴│ │🟢│ │🟡│ │🟢│  ← risk rengi │
│  └──┘ └──┘ └──┘ └──┘   └──┘ └──┘ └──┘ └──┘              │
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐   ┌──┐ ┌──┐ ┌──┐ ┌──┐              │
│  │🟢│ │🟡│ │🟢│ │🟢│   │🟢│ │🟠│ │🟢│ │⬜│ (boş)        │
│  └──┘ └──┘ └──┘ └──┘   └──┘ └──┘ └──┘ └──┘              │
│                                                             │
│  ── ZAMAN BAZLI AKTİVİTE GRAFİĞİ ──────────────────────── │
│                                                             │
│  Incident sayısı (5dk aralık)                              │
│  6 ┤           ██                                          │
│  4 ┤        ██ ██ ██                                       │
│  2 ┤  ██ ██ ██ ██ ██ ██                                    │
│  0 ┤──██─██─██─██─██─██─██─██─██─██─██─██──               │
│    14:00        14:30        15:00        15:30             │
│                                                             │
│  ── PERSONA DAĞILIMI ──────────────────────────────────── │
│                                                             │
│  🟢 Sakin:     18 (%47)  ████████████████                  │
│  🔵 Normal:    12 (%31)  ███████████                       │
│  🟡 Huzursuz:   5 (%13)  █████                             │
│  🟠 Şüpheli:    3 (%8)   ███                               │
│  🔴 Yüksek:     0 (%0)                                     │
│                                                             │
│  ── EN RİSKLİ ÖĞRENCİLER ─────────────────────────────── │
│  ┌────┬──────────────┬───────┬──────┬──────────┐          │
│  │Sıra│ Öğrenci       │ Risk  │ Inc. │ Persona  │          │
│  ├────┼──────────────┼───────┼──────┼──────────┤          │
│  │ A5 │ Mehmet D.     │ 0.72  │ 5    │ 🟠 Şüph. │          │
│  │ B6 │ Zeynep K.     │ 0.58  │ 3    │ 🟠 Şüph. │          │
│  │ A3 │ Ali V.        │ 0.48  │ 2    │ 🟡 Huzur.│          │
│  └────┴──────────────┴───────┴──────┴──────────┘          │
│                                                             │
│  [📄 PDF İndir]  [📊 Excel Export]                         │
└─────────────────────────────────────────────────────────────┘
```

### 22.4 Sınav Raporu (Cross-Room)

Tüm oturumları birleştiren sınav geneli rapor:

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Sınav Raporu — CMPE 492 Final                          │
│  15 Haz 2026 | 3 oturum, 120 öğrenci                      │
│                                                             │
│  ── OTURUM KARŞILAŞTIRMASI ────────────────────────────── │
│  ┌──────────┬─────────┬──────┬──────┬────────────────┐    │
│  │ Oturum   │ Öğrenci │ Inc. │ Risk │ Persona Dağılımı│    │
│  ├──────────┼─────────┼──────┼──────┼────────────────┤    │
│  │ Lab A    │ 38/40   │ 12   │ 0.28 │ 🟢18 🔵12 🟡5 🟠3│    │
│  │ Lab B    │ 34/35   │ 8    │ 0.22 │ 🟢20 🔵10 🟡3 🟠1│    │
│  │ Salon101 │ 44/45   │ 15   │ 0.31 │ 🟢19 🔵14 🟡7 🟠4│    │
│  ├──────────┼─────────┼──────┼──────┼────────────────┤    │
│  │ TOPLAM   │ 116/120 │ 35   │ 0.27 │ 🟢57 🔵36 🟡15 🟠8│   │
│  └──────────┴─────────┴──────┴──────┴────────────────┘    │
│                                                             │
│  ── INCIDENT TİP DAĞILIMI (pie chart) ──────────────────── │
│                                                             │
│        ╭───────╮                                           │
│       ╱ Phone  ╲  📱 Telefon: 8 (%23)                     │
│      ╱  ████    ╲ 👁 Bakış: 15 (%43)                      │
│     │  Gaze ████ │ 🔄 Kafa: 7 (%20)                       │
│      ╲  ████    ╱ 💺 Boş koltuk: 5 (%14)                  │
│       ╲ Head  ╱                                            │
│        ╰───────╯                                           │
│                                                             │
│  ── YERLEŞTIRME ETKİNLİĞİ ──────────────────────────────── │
│  Risk-bazlı yerleştirme kullanıldı mı? ✅ Evet             │
│  Odalar arası risk dengesi: ████████░░ İyi (σ = 0.04)     │
│  Yüksek riskli öğrencilerin dağılımı: dengeli ✅           │
│                                                             │
│  [📄 PDF İndir]  [📊 Excel Export]  [📧 Email Gönder]     │
└─────────────────────────────────────────────────────────────┘
```

### 22.5 Ders Bazlı Analitik (Course Analytics)

Bir dersin tüm sınavları üzerinden trend analizi:

**Route:** `/analytics/courses/[code]`

```
┌─────────────────────────────────────────────────────────────┐
│  📈 Ders Analitik — CMPE 492                               │
│  2025-2026 Akademik Yılı | 4 sınav                        │
│                                                             │
│  ── SINAV TREND GRAFİĞİ ────────────────────────────────── │
│                                                             │
│  Ortalama Risk Skoru (sınav bazlı)                         │
│  0.5 ┤                                                     │
│  0.4 ┤                    ╭─╮                              │
│  0.3 ┤        ╭─╮ ╭──────╯ │                              │
│  0.2 ┤ ╭──────╯ ╰─╯        ╰──                            │
│  0.1 ┤─╯                                                   │
│  0.0 ┤                                                     │
│      └──┬──────┬──────┬──────┬──                           │
│       Quiz1  Midterm  Quiz2  Final                          │
│                                                             │
│  ── SINAVLAR KARŞILAŞTIRMA TABLOSU ──────────────────────── │
│  ┌──────────┬──────┬──────┬──────┬────────┬───────────┐    │
│  │ Sınav    │Tarih │ Öğr. │ Inc. │Ort.Risk│ Trend     │    │
│  ├──────────┼──────┼──────┼──────┼────────┼───────────┤    │
│  │ Quiz 1   │09.Mar│ 120  │ 18   │ 0.21   │ baseline  │    │
│  │ Midterm  │15.Nis│ 118  │ 32   │ 0.34   │ ↑ %62     │    │
│  │ Quiz 2   │20.May│ 115  │ 22   │ 0.25   │ ↓ %26     │    │
│  │ Final    │15.Haz│ 116  │ 35   │ 0.27   │ ↑ %8      │    │
│  └──────────┴──────┴──────┴──────┴────────┴───────────┘    │
│                                                             │
│  ── ÖĞRENCİ GEÇMİŞ (REPEAT OFFENDERS) ─────────────────── │
│  ┌──────────────┬────────────────────────────────────┐     │
│  │ Öğrenci       │ Quiz1  Midterm  Quiz2  Final      │     │
│  ├──────────────┼────────────────────────────────────┤     │
│  │ Mehmet D.     │ 🟢0.1  🟡0.4   🟠0.6  🟠0.72    │ ↗   │
│  │ Zeynep K.     │ 🟢0.15 🟢0.2   🟡0.35 🟠0.58    │ ↗   │
│  │ Ali V.        │ 🟡0.3  🔴0.8   🟡0.4  🟡0.48    │ ↘   │
│  └──────────────┴────────────────────────────────────┘     │
│  ⚠️ Mehmet D. sürekli yükseliş trendi — dikkat             │
│                                                             │
│  [📄 PDF İndir]  [📊 Excel Export]                         │
└─────────────────────────────────────────────────────────────┘
```

**Gizlilik politikası:** Repeat offender (tekrarlayan risk) verileri sadece admin tarafından görüntülenebilir. Proctor'lara gösterilmez. Bu kural teknik olarak zorlanır (API route'ta role check).

**Önemli ilke:** Geçmiş sınav risk verileri, mevcut sınav değerlendirmesini etkilemez. Sistem geçmiş verileri sadece istatistiksel analiz için kullanır, hiçbir zaman mevcut sınavdaki risk skorunu artırmaz.

**Risk geçmişi hesaplama formülü:**
```
exam_risk_score = max(incidents.risk_score) for that student in that exam
```
Eğer öğrencinin hiç incident'ı yoksa: `exam_risk_score = 0.0`

**Trend hesaplama:**
- Escalating (↗): son 3 sınavda 2+ ardışık artış VE son risk > 0.5
- Stable (→): varyasyon < 0.15
- Declining (↘): son 3 sınavda 2+ ardışık azalış

**Öğrenci self-service risk görüntüleme (opsiyonel):**
Admin ayarlardan aktif edebilir. Aktifse: öğrenci kendi portalında (ileride) risk trendini görebilir:
- Sadece kendi verileri (RLS)
- Persona etiketi gösterilmez — sadece sayısal risk skoru
- Disclaimer: 'Bu veriler bilgilendirme amaçlıdır, akademik karara etkisi yoktur'
- **Varsayılan:** Kapalı (admin açmalı)

Phase A'da bu özellik yoktur. Phase B'de `/student/profile` sayfasına eklenebilir.

**Cross-exam normalizasyon:**

Öğrencinin risk skoru sınav ortalamasına göre normalize edilir:
```
normalized_risk = (student_risk - exam_avg_risk) / exam_std_dev
```
Raporda hem ham skor hem normalize skor gösterilir:
- 'Ham Risk: 0.34'
- 'Sınav Ortalaması: 0.45 → Ortalama Altı (düşük risk)'

Bu sayede zorlu sınavlar (herkes hareketli) ile rahat sınavlar (herkes sakin) arasında adil karşılaştırma yapılır.

### 22.6 Genel Sistem Analitik

Tüm sınavlar üzerinden kurum geneli istatistikler:

**Route:** `/analytics`

| Bileşen | İçerik |
|---------|--------|
| **Özet kartları** | Toplam sınav, toplam öğrenci, toplam incident, ortalama risk |
| **Aylık trend** | Ay bazlı incident sayısı + risk ortalaması line chart |
| **Ders karşılaştırma** | Hangi derslerde daha çok incident var? Bar chart |
| **Oda performansı** | Hangi odalarda kamera sorunları daha sık? |
| **Gözetmen istatistikleri** | Gözetmen bazlı review süreleri, incident oranları |
| **Incident tipi dağılımı** | Tüm sınavlardaki incident tiplerinin oranları (pie chart) |
| **Peak saatler** | Haftanın/günün hangi saatlerinde daha çok sınav + incident |
| **Yerleştirme etkinliği** | Risk-bazlı yerleştirme kullanan vs kullanmayan sınavların karşılaştırması |

### 22.7 Chart & Görselleştirme Tipleri

| Chart Tipi | Kullanım Yeri | Kütüphane |
|-----------|---------------|-----------|
| **Line Chart** | Risk skoru timeline, ders trend | Recharts (mevcut, PRD-009) |
| **Area Chart** | Incident yoğunluğu timeline | Recharts |
| **Bar Chart** | Oturum karşılaştırma, ders karşılaştırma | Recharts |
| **Pie / Donut Chart** | Incident tipi dağılımı, persona dağılımı | Recharts |
| **Radar Chart** | Öğrenci davranış profili (6 eksen) | Recharts |
| **Heatmap** | Koltuk risk haritası (grid) | Custom canvas veya Recharts |
| **Histogram** | Risk skoru dağılımı (tüm öğrenciler) | Recharts |
| **Gantt / Timeline** | Flag'lı anlar kronolojik sıralama | Custom component |
| **Sparkline** | Tablo satırlarında mini trend çizgisi | Recharts mini |

### 22.8 Export & Paylaşım

| Format | İçerik |
|--------|--------|
| **PDF** | Tam rapor — chart'lar rasterize, tablo + metin |
| **Excel (.xlsx)** | Ham veri: öğrenci listesi, incident listesi, risk skorları |
| **CSV** | Basit tablo export |
| **Email** | Rapor linki + özet bilgi → ilgili gözetmenlere/admin'e |
| **Paylaşılabilir link** | `/reports/[token]` — auth gerektirmeyen tek seferlik link (24 saat geçerli) |

**PDF export implementasyonu:** Server-side Puppeteer + headless Chromium. Next.js API route rapor sayfasını render eder → Puppeteer screenshot alır → PDF olarak döner.
- Alternatif (Puppeteer yoksa): `@react-pdf/renderer` ile React component'ten direkt PDF oluşturma (chart'lar SVG olarak embed).
- Chart'lar server-side `recharts` ile SVG'ye render edilir → PDF'e embed.

**Token yönetimi:**
- Token süresi: 24 saat (default), admin tarafından 1-72 saat arası ayarlanabilir
- Token revoke: `DELETE /api/reports/share/[token]` → token anında geçersiz olur
- Revoke sonrası link'e tıklanırsa: 'Bu link artık geçerli değil' mesajı

### 22.9 Veritabanı

```sql
-- Önceki student_exam_reports tablosuna ek alanlar:
ALTER TABLE public.student_exam_reports
  ADD COLUMN persona         TEXT CHECK (persona IN ('calm', 'normal', 'restless', 'suspicious', 'high_risk')),
  ADD COLUMN behavior_radar  JSONB DEFAULT '{}',  -- { gaze: 0.7, head_turn: 0.3, phone: 0.9, paper: 0, empty_seat: 0.1, earbuds: 0 }
  ADD COLUMN comparison      JSONB DEFAULT '{}';  -- { vs_class_avg_risk: 1.57, vs_class_avg_incidents: 3.17 }

-- Oturum raporu (session bazlı aggregate):
CREATE TABLE public.session_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  total_students    INTEGER,
  attended_students INTEGER,
  total_incidents   INTEGER,
  avg_risk_score    FLOAT,
  avg_duration_min  FLOAT,
  incident_by_type  JSONB DEFAULT '{}',   -- { phone_detected: 8, gaze_diversion: 15, ... }
  incident_by_severity JSONB DEFAULT '{}', -- { low: 10, medium: 15, high: 8, critical: 2 }
  persona_distribution JSONB DEFAULT '{}', -- { calm: 18, normal: 12, restless: 5, suspicious: 3, high_risk: 0 }
  seat_heatmap      JSONB DEFAULT '[]',   -- [{ seat_id: "A1", risk: 0.12 }, ...]
  activity_timeline JSONB DEFAULT '[]',   -- [{ time: "14:05", incidents: 2 }, ...]
  placement_effectiveness FLOAT,           -- Risk dağılım standart sapması (düşük = iyi)
  generated_at      TIMESTAMPTZ DEFAULT NOW(),
  status            TEXT DEFAULT 'generating' CHECK (status IN ('generating', 'ready'))
);

CREATE UNIQUE INDEX idx_session_report ON public.session_reports (session_id);

-- Sınav raporu (exam bazlı aggregate):
CREATE TABLE public.exam_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id           UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  total_sessions    INTEGER,
  total_students    INTEGER,
  total_incidents   INTEGER,
  avg_risk_score    FLOAT,
  incident_by_type  JSONB DEFAULT '{}',
  session_comparison JSONB DEFAULT '[]',  -- [{ session_id, room_name, students, incidents, avg_risk }]
  placement_effectiveness FLOAT,
  generated_at      TIMESTAMPTZ DEFAULT NOW(),
  status            TEXT DEFAULT 'generating' CHECK (status IN ('generating', 'ready'))
);

CREATE UNIQUE INDEX idx_exam_report ON public.exam_reports (exam_id);
```

### 22.10 Rapor Oluşturma Akışı

```
Sınav biter (tüm oturumlar ended)
    ↓
Background job başlar:
    ├── Her öğrenci için student_exam_report oluştur
    │   ├── Incident'ları aggregate et
    │   ├── Risk timeline hesapla
    │   ├── Persona sınıflandır
    │   ├── Davranış radarı hesapla
    │   └── Sınıf ortalamasıyla karşılaştır
    │
    ├── Her oturum için session_report oluştur
    │   ├── Koltuk heatmap'i hesapla
    │   ├── Aktivite timeline'ı oluştur
    │   ├── Persona dağılımını hesapla
    │   └── Yerleştirme etkinliğini değerlendir
    │
    └── Sınav geneli exam_report oluştur
        ├── Oturumları karşılaştır
        └── Genel istatistikleri hesapla

    ↓
status = 'ready' → Gözetmenlere + Admin'e bildirim:
"CMPE 492 Final raporu hazır — görüntüle"
```

**Performans SLA:**

| Ölçek | Hedef Süre | Maksimum |
|-------|-----------|----------|
| Tek öğrenci raporu | < 5 saniye | < 15 saniye |
| Oturum raporu (40 öğrenci) | < 30 saniye | < 2 dakika |
| Sınav raporu (3 oturum, 120 öğrenci) | < 2 dakika | < 5 dakika |

Rapor oluşturma async background job olarak çalışır. UI'da progress bar gösterilir: 'Rapor oluşturuluyor... (%65)'. Proctor partial results göremez — rapor tamamlanınca erişime açılır. Tamamlanma durumu Supabase Realtime ile bildirilir.

---

## 23. Proctor İş Akışı

### 23.1 Sınav Öncesi
1. Admin oturma planını hazırlar (öğrenci → koltuk eşleştirmesi)
2. Kameraları test eder ("Bağlantıyı Test Et" butonu)
3. Sınav oturumunu oluşturur (oda, süre, aktif detection tipleri seçer)
4. Oturumu başlatır → AI servisi aktifleşir

### 23.2 Sınav Sırasında (Canlı İzleme)
Proctor `/exams/[id]/sessions/[sid]` sayfasında:
- Kamera grid'ini izler
- Alert panel'den gelen olayları görür
- **Alert geldiğinde yapılabilecek aksiyonlar:**

| Aksiyon | Açıklama | UI |
|---------|----------|-----|
| **Acknowledge** | "Gördüm, izliyorum" | Tek tıklama, alert rengi soluklaşır |
| **Dismiss** | "Yanlış pozitif" — incident kapatılır | "Dismiss" butonu + opsiyonel neden |
| **Flag** | "Sınav sonrası incelenecek" — öğrenci işaretlenir | Yıldız ikonu, review listesine eklenir |
| **Escalate** | "Üst yetkiye bildir" — admin'e notification gönder | "Escalate" butonu + not |
| **Note** | Serbest metin notu ekle | Textarea, incident'a bağlı |

**AI Threshold Hızlı Ayar:**
Proctor bir incident'ı dismiss ettiğinde, dashboard'da popup gösterilir:
```
'Bu tür tespitlerin hassasiyetini azaltmak ister misiniz?'
[Evet, bu oturum için azalt] [Hayır, mevcut ayarlar kalsın]
```
'Evet' seçilirse → ilgili detection type'ın confidence threshold'u +0.05 artırılır (daha az hassas, daha az FP). Değişiklik `exam_sessions.settings` JSONB'ye yazılır. Bu sayede proctor, settings menüsüne girmeden threshold ayarlayabilir.

**Revert kuralı:** Oturum-seviye threshold ayarları oturum bitince otomatik sıfırlanır — sonraki oturumları etkilemez. Oturum içinde geri alma: proctor settings panelinden "Varsayılanlara dön" tıklar.

#### Gözetmen Nöbet Devri

Uzun sınavlarda (>2 saat) gözetmen değişimi:

1. Chief proctor, canlı izleme ekranından 'Gözetmen Değiştir' butonuna tıklar
2. Yeni gözetmen listeden seçilir (sadece atanmamış gözetmenler)
3. Eski gözetmen: 'Devir notu' yazar (mevcut durum özeti, dikkat edilecekler)
4. Yeni gözetmen session'a eklenir, eski gözetmen çıkarılır
5. Yeni gözetmen dashboard'a girdiğinde: 'Devir notu' banner gösterilir + son 30dk incident özeti
6. `audit_logs`'a `session.proctor_change` event'i

**Kısıtlama:** Nöbet devri sadece chief_proctor yapabilir. Normal proctor değişiklik talep edemez.

### 23.3 Sınav Sonrası
1. Oturum sonlandırılır → AI servisi durur
2. `/dashboard/sessions/[id]/report` sayfasında otomatik rapor:
   - Toplam incident sayısı (severity bazlı)
   - En riskli öğrenciler (risk score sıralaması)
   - Zaman çizelgesi (incident timeline)
   - Flagged öğrenciler listesi
3. Proctor incident'ları review eder (is_reviewed + review_note)
4. Rapor PDF olarak export edilebilir

**Post-Exam İnceleme Sayfası** (`/exams/[id]/sessions/[sid]/review`):

Bu sayfa sınav sonrası proctor'ın tüm flaglı incident'ları inceleyip final kararını verdiği ana sayfadır.

**Layout:**
- **Sol panel:** Öğrenci listesi (risk skoruna göre sıralı, renk kodlu)
- **Orta:** Seçili öğrencinin incident timeline'ı + evidence frame'leri
- **Sağ:** Proctor karar formu

**İnceleme akışı:**
1. Proctor yüksek riskli öğrenciden başlar
2. Her incident için evidence frame'i inceler
3. Karar verir: ✅ Temiz / ⚠️ Şüpheli / ❌ İhlal tespit edildi
4. Opsiyonel not ekler
5. 'İnceleme tamamlandı' butonuna tıklar → öğrenci `reviewed` olarak işaretlenir

Tüm incelenmemiş öğrenciler otomatik olarak 'Temiz' kabul edilir (innocent until proven).

**Proctor Karar Kaydı:**

```sql
-- incidents tablosuna ek alanlar:
ALTER TABLE incidents ADD COLUMN proctor_decision TEXT
  CHECK (proctor_decision IN ('clean', 'suspicious', 'violation', NULL));
ALTER TABLE incidents ADD COLUMN decision_note TEXT;
ALTER TABLE incidents ADD COLUMN decided_by UUID REFERENCES user_profiles(id);
ALTER TABLE incidents ADD COLUMN decided_at TIMESTAMPTZ;
```

**Karar tipleri:**

| Karar | Anlam | Raporda Gösterim |
|-------|-------|-----------------|
| `clean` | Yanlış pozitif, öğrenci temiz | Yeşil ✅ |
| `suspicious` | Şüpheli ama kanıt yetersiz | Sarı ⚠️ |
| `violation` | İhlal tespit edildi | Kırmızı ❌ |
| `NULL` | Henüz incelenmedi | Gri ○ |

Karar kaydı `audit_logs`'a da yazılır (`proctor.decide` event tipi).

#### Öğrenci İtiraz (Appeal) Mekanizması

**Not:** Phase A'da sistem içi appeal formu yoktur. İtiraz süreci üniversitenin mevcut disiplin prosedürünü takip eder:

1. Öğrenci, gözetmen veya bölüm başkanına yazılı/sözlü itiraz eder (sistem dışı)
2. Admin, itiraz edilen öğrencinin raporunu açar
3. Evidence frame'leri ve incident timeline'ı inceler
4. Gerekirse accommodation uygular → re-score
5. Proctor kararını günceller: `violation` → `suspicious` veya `clean`
6. Karar değişikliği `audit_logs`'a kaydedilir

**Phase B önerisi:** Sistem içi `/appeals` sayfası: öğrenci form doldurur → chief_proctor'a routing → inceleme + karar.

---

## 24. Privacy & Veri Güvenliği

> **⚠️ Not:** Bu proje şu an bir **üniversite bitirme projesi (senior project)** kapsamında geliştirilmektedir. KVKK tam uyumluluğu ticari ürün aşamasında gereklidir. Mevcut fazda sistem sadece **gönüllü denek gruplarında** test edilecektir.

### 24.1 Mevcut Faz (Senior Project — Test Grubu)
- Sistem sadece gönüllü denek öğrencilerle test edilir
- Test öncesi sözlü/yazılı bilgilendirme yapılır: "Bu bir proje testidir, kamera ile davranış analizi yapılacaktır"
- Test verileri proje tamamlandıktan sonra silinir
- Yüz enrollment opsiyoneldir — denek rıza vermezse pozisyon bazlı eşleme kullanılır

**Phase A → Phase B Geçişinde Rıza Yönetimi:**
- Phase A: yüz verisi toplanmaz → mevcut rıza formu yeterli ('kamera ile davranış analizi')
- Phase B aktivasyonunda: **tüm öğrencilerden yeni rıza alınmalı**
  - Yeni rıza formu: 'Yüz görüntünüz kaydedilecek ve biyometrik veri oluşturulacaktır (KVKK Madde 6)'
  - Rıza vermeyen öğrenciler: pozisyon bazlı takip (Phase A gibi)
  - Eski sınav verilerinde geriye dönük yüz işleme yapılmaz
- Admin dashboard'da: 'Phase B aktif — rıza durumu: 35/40 öğrenci onayladı' banner

### 24.2 Veri Minimizasyonu (tüm fazlarda geçerli)
- Canlı video stream **saklanmaz** — sadece anlık RAM'de işlenir
- Sadece incident anında frame snapshot alınır (tüm video kaydedilmez)
- Evidence 90 gün sonra otomatik silinir (§21.1)
- Face embedding: 128 sayıdan oluşan vektör, orijinal yüz görüntüsü reconstruct edilemez
- Üçüncü taraf AI servisi kullanılmaz — tüm inference kendi container'ımızda

**Veri transit güvenliği:**
- Portal ↔ Dashboard: HTTPS/WSS (TLS 1.3) — ALB terminate eder
- AI Servis ↔ Portal: VPC internal (aynı VPC, public internet'e çıkmaz)
- AI Servis ↔ Redis: VPC internal (ElastiCache, encryption in transit aktif)
- Kamera ↔ AI Servis: RTSP over LAN (şifresiz ama fiziksel ağ izolasyonu)

**Yeterlilik:** Sınıf ortamında (LAN) frame'ler şifresiz transit kabul edilir. Uzaktan izleme (proctor evden) senaryosu yoktur — proctor fiziksel olarak kampüstedir. HTTPS/WSS tüm dış trafiği kapsar.

**Yüz Embedding Güvenliği (Phase B):**
- Embedding 128-dim float vektör — doğrudan yüz görüntüsü içermez
- **Ancak:** Araştırmalar (Fredrikson et al. 2015) embedding'den ~%80 doğrulukla yüz reconstruct edilebileceğini gösterir
- **Önlem:** `students.face_embedding` alanı DB'de erişim kısıtlı:
  - Sadece AI servis (service_role) okuyabilir
  - Admin dahil portal üzerinden embedding'e erişilemez (API döndürmez)
  - DB backup'ları şifrelenmiş (Supabase encryption at rest)
- Evidence JPEG crop'ları (yüz fotoğrafı) 90 gün sonra silinir (§21.1)
- Embedding'ler öğrenci silindiğinde CASCADE ile silinir

**Audit Log Değiştirilemezlik İlkesi:**
```sql
-- audit_logs tablosu için UPDATE ve DELETE RLS policy'si YOKTUR
-- Sadece INSERT policy mevcuttur (service_role)
-- Bu, audit log'ların hiçbir koşulda değiştirilemeyeceğini garanti eder

-- Ek koruma: trigger ile UPDATE/DELETE engelle
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS 68032
BEGIN
  RAISE EXCEPTION 'audit_logs tablosu değiştirilemez';
END;
68032 LANGUAGE plpgsql;

CREATE TRIGGER no_update_audit_logs
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
```

Proctor not eklemek isterse → yeni satır INSERT edilir (eski satır değişmez). Düzeltme notu: `metadata` alanında `correction_for: 'original_log_id'` referansı ile.

### 24.3 İleride (Ticari Ürün Aşaması — Gerekirse)
- KVKK uyumluluğu: aydınlatma metni, rıza formu, veri işleme envanteri
- Veri silme hakkı: öğrenci talebiyle incident anonymization
- Veri lokasyonu: EU/TR sunucuları zorunlu
- DPO (Data Protection Officer) atanması

**Veri Lokasyonu (KVKK Uyumu):**
- **Mevcut (dev/staging):** Supabase free/pro — AWS `eu-west-1` (İrlanda) region
- **Production önerisi:** Supabase region `eu-west-1` veya `eu-central-1` (Frankfurt) — AB sınırları içinde
- KVKK Madde 9: yurt dışına veri aktarımı ancak yeterli koruma varsa mümkündür. AB ülkeleri yeterli koruma sağlar.
- **Ticari ürün aşamasında:** Türkiye'de Supabase self-hosted veya AWS İstanbul region değerlendirilmelidir
- Evidence frame'leri + face embedding'ler Supabase Storage'da (aynı region)
- Redis (ElastiCache): aynı VPC, aynı region

---

## 25. Breaking Changes Geçmişi

| Tarih | Değişiklik | Etkilenen PRD |
|-------|-----------|---------------|
| v0.1 | İlk DRAFT — mimari tasarım | — |
| v1.0 | Tam PRD: öğrenci yönetimi, push notification, sesli uyarı, API contract, test stratejisi, BoT-SORT kararı, video storage kararı, deployment planı | PRD-000, PRD-007, PRD-008, PRD-016 |
| v1.1 | Kamera bağlantı tipleri (IP/telefon/USB), öğrenci-track eşleştirme, frame processing stratejisi, evidence retention, proctor iş akışı, KVKK, seat_assignments tablosu | PRD-000 |
| v1.2 | Veri seti stratejisi (zero-training Phase A), fine-tuning arayüzü (ai_models tablosu), canlı izleme & görsel overlay sistemi (annotated video stream, bounding box, gaze çizgisi, risk bar), test modu, WebSocket dual-channel (detection + video) | PRD-000 |
| v1.3 | Exam üst entity, gözetmen ataması, öğrenci-oturum ataması, sınav wizard | PRD-000 |
| v1.4 | Sidebar grupları, sıra düzeni editörü, risk-bazlı yerleştirme, OCR yoklama, face enrollment, wizard 5 adım, monitoring hub | PRD-000 |
| v1.5 | Kamera kalibrasyonu (§3.6): manuel + homografi, 3 katmanlı kilit, camera_calibrations tablosu | PRD-000 |
| v1.6 | Kamera kayma algılama, re-kalibrasyon, çoklu kamera failover, seat_camera_assignments | PRD-000 |
| v1.7 | Sınav çıkış kuralları, wizard CRUD + hata yönetimi + güvenlik, kamera blur/odak/sağlık izleme, KVKK sadeleştirme | PRD-000 |
| v1.8 | Öğrenci checkout sistemi (§6.18): kiosk + proctor çıkış, rapor oluşturma, student_exam_reports | PRD-000 |
| v1.9 | Context-Aware Detection (§3.9): rol tanıma (öğrenci/gözetmen/ziyaretçi), 10 meşru hareket süpresyon kuralı, bağlamsal zaman dilimleri (başlangıç/ana/bitiş fazları), gözetmen yakınlık süpresyonu, confidence decay modeli, alert karar ağacı, track_roles tablosu, gözetmen enrollment akışı | PRD-000 |
| v1.10 | Tespit kategorileri araştırma tabanlı yeniden yazıldı (§7.2-7.6): 3 tier güven seviyesi (TIER 1: yüksek güven/tek başına alert, TIER 2: bağlamla, TIER 3: bilgilendirme), multi-sinyal füzyon puanlama (6 ağırlıklı sinyal), 7 örnek senaryo, FP azaltma stratejileri (%10 hedef), engelli/özel durum accommodation sistemi | PRD-000 |
| v1.11 | Accommodation 3 senaryo akışı (önceden/sınav esnasında/sınav sonrası), geriye dönük re-scoring mekanizması, incident re-score alanları (original_severity, rescored_at), rescore_logs tablosu, 5 preset accommodation tipi (ADHD/anksiyete/fiziksel/görme/custom) | PRD-000 |
| v1.12 | Multi-kamera füzyon §9 tamamen yeniden yazıldı: merkezi mimari, koltuk-bazlı spatial atama (open-world ReID gereksiz), view-quality-weighted max-bias füzyon, timestamp bucketing (100ms), N-of-M temporal smoothing (%40-50 FP azaltma), cross-student senkronize davranış tespiti (komşu korelasyon çarpanı), çelişki yönetimi, runtime kalite skoru, füzyon config JSON | PRD-000 |
| v1.13 | Kamera uzmanlık alanları (§9.9): per-camera per-seat detection specialization (gaze/desk/lap/body), uzmanlık-bazlı füzyon ağırlıklandırma, otomatik uzmanlık hesaplama (kalibrasyon), kör nokta analizi + admin uyarısı, seat_expertise JSONB | — |
| v1.14 | Multi-room ölçeklendirme (§17): darboğaz analizi (MediaPipe bottleneck), kapasite tablosu (1-10 oda maliyet), shared worker pool mimarisi (Redis Streams + consumer groups), auto-scaling (backlog-based + scheduled), Supabase yük analizi, Fargate Spot tasarruf | PRD-000 |
| v1.15 | §17 odağı multi-room'dan tek sınıf max verime çekildi: hedef senaryo (1 oda, 3 kamera, 40 öğrenci), optimal altyapı ($50-70/ay gerçek maliyet), Supabase Free/Pro analizi (Free dev için yeterli, demo ayı Pro önerisi), tek sınıf performans optimizasyonları (%28 CPU = %72 headroom), demo günü hazırlık checklist'i (1 hafta/1 gün/gün içi), Plan B senaryoları | — |
| v1.16 | FPS stratejisi (§17.2): adaptif FPS (5 normal → 15 alarm), davranış bazlı FPS yeterliliği tablosu, çözünürlük × mesafe analizi (720p/1080p/4K vs 3m/5m/8m), kamera rolü bazlı min çözünürlük + FPS önerisi, AI inference resize stratejisi, konfigürasyon JSON | — |
| v1.17 | Altyapı & Performans Mühendisliği (§18): mevcut altyapı tespiti (0.25 vCPU portal), CDK yükseltme planı (0.5 vCPU), Redis mimarisi (7 kullanım alanı: frame queue, detection broadcast, risk cache, camera health, track mapping, rate limit, session state), frontend performans (canvas rendering, throttle, virtualized list, lazy load), backend performans (batch write, connection pool, caching), AI servis performans (GIL, warm-up, memory), 3 katmanlı error handling (AI/backend/frontend — 20 hata senaryosu), "asla olmaması gerekenler" tablosu, Faz 2 log event tipleri (17 yeni event), AI performans metrikleri (30s aralık), log retention policy | PRD-000 |
| v1.18 | Kapsamlı raporlama sistemi (§22): 5 katmanlı hiyerarşi (öğrenci/oturum/sınav/ders/genel), öğrenci persona kartı (5 tip: calm→high_risk), davranış radar chart, koltuk heatmap, zaman çizelgesi, ders bazlı trend analitik, repeat offender takibi, session_reports + exam_reports tabloları, 9 chart tipi, PDF/Excel/CSV export, paylaşılabilir link | PRD-000 |
| v1.19 | Bölüm numaralama düzeltmeleri (§6.18/6.19, §17.4-17.8, §21.x, §22.x, §23.x, §24.x), §18 giriş paragrafı, Redis persistence & memory stratejisi, demo sonrası rollback checklist'i | PRD-000 |
| v1.20 | Implementation-ready spesifikasyonlar (§18.7): AI servis master config JSON (13 kategori, 80+ parametre), 4 durum makinesi (kamera sağlık, FPS geçiş, pause, failover — ASCII diyagramları ile), round-robin MediaPipe algoritması (pseudo-code + davranış kuralları), graceful degradation matrisi (7 arıza senaryosu × 5 bileşen), health check API (endpoint format + status logic), WebSocket mesaj şemaları (koordinat standardı, annotation TypeScript interface, QoS feedback), 10 performans SLA hedefi (hedef/kabul/kritik), session settings override hiyerarşisi (4 katman + merge + mid-session WS push), DB transaction izolasyon seviyeleri (6 işlem tipi), test modu spesifikasyonu, overlay görsel spec (renk + erişilebilirlik + z-order), snapshot yönetimi, distributed tracing | PRD-000 |
| v1.21 | RTSP authentication spesifikasyonu (AES-256-GCM şifreli stream_url, API'da maskeleme), Evidence format spesifikasyonu (§21.0: JPEG format, boyut limitleri, metadata JSON, depolama path yapısı), LogEvent INTERFACE_DEPS @1.1→@1.2 sync | PRD-000 |
| v2.0 | **50 sorunluk kapsamlı tarama düzeltmesi:** Phase A/B sınırları netleştirildi (OCR yoklama→B, face enrollment→B, homography→B, drift detection→B, multi-cam fusion→B, accommodation→B, earbuds+material detection→B, multi-signal fusion→B). Phase A basit kural tabanlı scoring eklendi. Öğrenci transfer semantiği session-bazlı yapıldı. Import API room_id kaldırıldı + upsert deduplication. State machine'e paused eklendi. Chief proctor RBAC matrisi. De-escalation kuralları. Track-student sürekli eşleştirme (30s→session boyunca). Track düzeltme UI, çakışma çözümü, track kaybı recovery. Bandwidth optimizasyonu (180 KB/s/viewer). Kalibrasyon UX (grid, undo, test). Geç gelen öğrenci prosedürü. empty_seat hareket ayrımı. Mid-exam recalibration. Post-exam review sayfası + proctor karar kaydı. Rapor erişim kontrolü + SLA. Persona disclaimer. Repeat offender privacy. Gerçekçi doğruluk beklentileri tablosu. risk_history formülü. PDF export implementasyonu. Token revocation. | PRD-000 |
| v2.1 | **35 sorunluk ürün derinleştirme:** Sınıf geometri kalibrasyonu (tahta yönü, komşu mesafesi, kontekstüel gaze). Max mesafe uyarı tablosu. 7 adımlı benchmark prosedürü. Sınav erteleme + iptal akışı. Leave+return CRITICAL politikası (proctor kontrolünde). Auto-checkout (5dk empty). Phase B face FN politikası (%85/%92 threshold). AI threshold hızlı ayar + revert. Öğrenci itiraz mekanizması. Kritik incident aksiyon protokolü (alert_only/pause_exam/notify_admin). Dismissed incidents rapor görünürlüğü. Labeled data toplama SOP (§14.5) + COCO bias uyarısı + model A/B testing. Persona UI redesign (badge kaldırıldı). Proctor öneri bölümü. Cross-exam normalizasyon. İlk kurulum wizard (/setup). UI-driven prova modu. Dashboard boş durum. Mobil proctor deneyimi. Internet kesintisi kurtarma. Gözetmen nöbet devri. Transit güvenlik. Face embedding güvenliği. Evidence purge istisnaları. Audit log immutability (trigger). Phase A→B rıza geçişi. Veri lokasyonu (KVKK). Phase sınıflandırma düzeltmeleri (hand_in_lap→B, body_lean→B, unauthorized_person açıklaması). student_id güncelleme politikası. Escalation/de-escalation config parametreleri. Phase A çoklu kamera politikası. | PRD-000 |
| v2.2 | Küçük düzeltmeler ve PRD-000 interface senkronizasyonu | PRD-000 |
| v2.3 | **Cross-PRD tutarlılık düzeltmesi ve gerçekçilik iyileştirmesi:** (1) Interface çelişkileri: Camera @1.0→@1.1 (`camera_type` eklendi), Student @1.0→@1.1 (`room_id`/`seat_number` kaldırıldı, `department` eklendi), ExamSession @1.0→@1.1 (`exam_id` eklendi, `name`/`created_by` kaldırıldı). (2) PRD-000 Tech Stack: ByteTrack→BoT-SORT düzeltmesi. (3) Wizard adım sayısı 4→5 standartlaştırıldı (§6.8). (4) Route prefix'leri `/dashboard/...` → PRD-000 §7 ile eşitlendi. (5) **Phase A / A.1 ayrımı:** Phase A sadece phone+empty_seat (COCO), Phase A.1'de gaze+head_turn (MediaPipe) — FP riski azaltılır. (6) **Redis Phase A'da opsiyonel:** Tek sınıf için direkt WS yeterli, ~$13/ay tasarruf. (7) **Supabase stratejisi:** AI entegrasyon geliştirmesinin son 2 ayında Pro gerekli. (8) **Network topology eklendi (§17.1.1):** Phase A AI servis on-premise (üniversite LAN) — kameralara direkt erişim, $146/ay tasarruf. (9) **Fine-tuning compute:** Google Colab/Kaggle (ücretsiz GPU) eklendi. (10) **Veri hedefi:** 50 sınav → 5 prova + 200 frame, bootstrap sorunu çözümü, proctor güvenilirliği uyarısı. | PRD-000 |
