# PRD-019 — Camera Pairing & Multi-Camera Session Binding
**Versiyon:** 1.0
**Owner:** Taha Kürşat Öztürk (product_owner) + Ali Sahil (ai_backend)
**Bağımlılıklar:** PRD-000, PRD-001, PRD-006, PRD-013, PRD-016
**Blocks:** —
**Durum:** AKTIF (in progress)
**Created:** 2026-05-04
**Sprint:** Sprint 6 (2026-05-05 → 2026-05-21) — BL-170 … BL-181

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
LogEvent: @1.2
Notification: @1.0
Camera: @1.2
ExamSession: @1.1
SessionCamera: @1.0
CameraHealthEvent: @1.0
-->

## ⚠️ LLM TALİMATI

Bu PRD telefon-as-camera akışını ve çoklu-kamera oturum yönetimini tanımlar.
PRD-013 §6.4 (Camera tablosu) ve §3.2 (WS protokolü) bu PRD ile genişletilir;
**PRD-013'ü kırmadan üzerine eklenir.** Schema değişiklikleri yeni
migration ile gelir, mevcut `cameras.room_id` (artık nullable) korunur.

QR-pair akışı kısa ömürlü JWT token kullanır (5 dk TTL). Token'da hassas
veri olmamalı; sadece `camera_id`, `session_id`, `iss`, `exp` taşır.

Telefondan gelen JPEG frame'leri AI service'in mevcut YOLO pipeline'ına
beslenir; **PRD-013 §4.1** scoring kuralları aynen uygulanır. Yeni
`session_cameras` junction tablosu oturum bazlı bağlama yapar; sabit
kameralar `home_room_id` ile sınırlandırılır.

---

## 1. Amaç

Mevcut sistemde kamera kaydı bir odaya zorla bağlıydı (`cameras.room_id NOT NULL`)
ve telefon kamerası eklemek için harici bir IP Webcam uygulaması gerekiyordu.
Bu PRD ile:

1. **Telefon-as-camera** — proctor telefonunu, harici uygulama olmadan,
   QR kod ile 2 saniyede sisteme kamera olarak bağlar (PWA + getUserMedia).
2. **Çoklu kamera** — bir oturum birden fazla kamera (sabit IP + taşınabilir
   telefon + USB webcam) içerebilir; kameralar M:N junction üzerinden bağlanır.
3. **Sabit / taşınabilir ayrımı** — `is_fixed=true` kameralar yalnızca kendi
   `home_room_id`'lerinde kullanılabilir; yanlış oda hatası 409 ile döner.
4. **Sahiplik** — `owner_user_id` setli kameralar sadece sahibinin
   eşleştirebildiği kişisel cihazlardır; sistem kameraları (`owner_user_id NULL`)
   tüm yetkili kullanıcılar tarafından kullanılır.
5. **Sağlık izleme** — telefon arkaplana atıldığında, pili düştüğünde veya
   bağlantı koptuğunda ilgili proctor anında bildirim alır.

---

## 2. Veritabanı Şeması

### 2.1 `cameras` Tablosuna Eklenen Alanlar

```sql
-- Migration: 20260504XXXXXX_camera_pairing_extensions.sql
ALTER TABLE public.cameras
  ADD COLUMN IF NOT EXISTS is_fixed       BOOLEAN  NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS owner_user_id  UUID REFERENCES public.user_profiles(id),
  ADD COLUMN IF NOT EXISTS device_id      TEXT,
  ADD COLUMN IF NOT EXISTS last_seen_at   TIMESTAMPTZ;

-- room_id artık nullable: taşınabilir kameralar (telefonlar) home room'a sahip olmayabilir
ALTER TABLE public.cameras ALTER COLUMN room_id DROP NOT NULL;

-- Sabit kamera ↔ home room bütünlüğü
ALTER TABLE public.cameras
  ADD CONSTRAINT fixed_cameras_have_home_room
  CHECK (NOT is_fixed OR room_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_cameras_owner   ON public.cameras (owner_user_id);
CREATE INDEX IF NOT EXISTS idx_cameras_device  ON public.cameras (device_id) WHERE device_id IS NOT NULL;
```

| Alan | Tip | Açıklama |
|---|---|---|
| `is_fixed` | bool | Sabit (oda-bağlı) mı, taşınabilir (mobile) mı |
| `owner_user_id` | uuid? | Kişisel cihaz sahibi (telefon). NULL = sistem kamerası |
| `device_id` | text? | Telefon-tarafı kalıcı fingerprint (re-pair için) |
| `last_seen_at` | tstz? | Son sağlık event'i zamanı |

### 2.2 `session_cameras` Junction Tablosu

```sql
-- Migration: aynı dosyada
CREATE TABLE IF NOT EXISTS public.session_cameras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  camera_id   UUID NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ DEFAULT NOW(),
  added_by    UUID REFERENCES public.user_profiles(id),
  UNIQUE (session_id, camera_id)
);

CREATE INDEX idx_session_cameras_session ON public.session_cameras (session_id);
CREATE INDEX idx_session_cameras_camera  ON public.session_cameras (camera_id);

ALTER TABLE public.session_cameras ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_cameras_all ON public.session_cameras FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

> **Geriye dönük uyumluluk:** Mevcut `cameras.room_id` alanı korunur — bir
> oturumun varsayılan kameraları, oturumun odasıyla aynı `room_id`'ye sahip
> sabit kameralardır. `session_cameras` ile bunun üzerine eklemeler yapılır.

### 2.3 `camera_health_events`

```sql
CREATE TABLE IF NOT EXISTS public.camera_health_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id   UUID NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  session_id  UUID REFERENCES public.exam_sessions(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'connected', 'disconnected', 'reconnected',
    'low_battery', 'critical_battery', 'charging',
    'app_backgrounded', 'app_foregrounded',
    'overheat', 'orientation_changed', 'preview_offscreen',
    'permission_revoked'
  )),
  metadata    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_camera_health_camera   ON public.camera_health_events (camera_id, created_at DESC);
CREATE INDEX idx_camera_health_session  ON public.camera_health_events (session_id);

ALTER TABLE public.camera_health_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY camera_health_events_all ON public.camera_health_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

---

## 3. RLS Politikaları

5 kişilik ekipte tüm yeni tablolar `to authenticated using (true)`. Mobile cam
sahiplik kuralları **uygulama katmanında** (PRD-019 §5) zorlanır.

---

## 4. API Route'ları

### 4.1 Pair Token Üretimi

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/api/cameras/pair-token` | PC'den çağrılır. Yeni mobile camera kaydı (`is_fixed=false`, `owner_user_id=current`) + 5 dk JWT döndürür |
| GET | `/api/cameras/pair/redeem?token=…` | Telefondan çağrılır (token sahibi olarak). Token doğrula, AI WS URL + camera_id döndür |

**`POST /api/cameras/pair-token` request:**
```json
{
  "session_id": "uuid",     // optional — pair sırasında session'a bağla
  "label": "Phone — Kürşat",
  "for_user_id": "uuid"     // optional — kendi adına başkası için (admin)
}
```

**Response:**
```json
{
  "camera_id": "uuid",
  "token": "<JWT>",         // exp: 5 dk
  "pair_url": "https://horuseye.app/cam-pair?token=<JWT>",
  "qr_data_url": "data:image/png;base64,…"
}
```

**JWT payload:** `{ camera_id, session_id, owner_user_id, iss: 'horuseye-pair', exp }`

### 4.2 Session-Camera Bağlama

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/exam-sessions/[id]/cameras` | Bu oturuma bağlı kameralar (junction'dan) |
| POST | `/api/exam-sessions/[id]/cameras` | Mevcut kamerayı oturuma ekle. Body: `{camera_id}` |
| DELETE | `/api/exam-sessions/[id]/cameras?camera_id=…` | Oturumdan ayır |

**Bağlama validation (POST):**
1. Camera bulunamazsa → 404
2. Camera `is_fixed=true` ve `room_id != session.room_id` → **409** + `{ error: 'Fixed camera belongs to a different room', camera_room_id, session_room_id }`
3. Camera `is_fixed=true` ve aynı camera başka aktif oturumda kullanılıyorsa → **409** + `{ error: 'Fixed camera already in active session' }`
4. Camera sahibi kullanıcı current değilse ve sistem kamerası değilse → **403**

### 4.3 Health Event

| Method | Path | Açıklama |
|--------|------|----------|
| POST | `/api/cameras/[id]/health-event` | Telefondan gelir (camera sahibi auth). Body: `{event_type, metadata}` |
| GET | `/api/cameras/[id]/health-events?limit=50` | Proctor okur |

**Notification trigger:** `event_type IN ('disconnected', 'low_battery', 'critical_battery', 'app_backgrounded', 'permission_revoked')` ise:
- Oturumun chief_proctor + proctors'larına in-app notification (PRD-016)
- `cameras.last_seen_at` güncellenir
- Critical events için `audit_logs` `severity='warn'`

### 4.4 AI Service WS Publish Route

```
WS /ws/sessions/{session_id}/publish
```

**Subscribe message (JSON, ilk mesaj):**
```json
{ "type": "publish", "protocol_version": "1.1", "api_key": "<>", "camera_id": "uuid" }
```

**Frame messages (binary):** Her message ham JPEG buffer'ı — protokol header yok,
ardışık binary frame'ler 5 FPS'te gönderilir.

**AI service davranışı:**
- Auth check (api_key match)
- camera_id'yi capture orchestrator'a register eder
- JPEG decode → BGR ndarray → ortak frame queue
- Aynı YOLO + scoring pipeline'a gider
- Detections → existing detection WS subscribers (proctor PC)

---

## 5. Otomatik Davranışlar

| Tetikleyici | Davranış |
|---|---|
| `is_fixed=true` ve `room_id` set, oturumun `room_id`'si farklı | **409** + UI "Bu kamera Lab A'ya bağlı, oturumunuz Lab B" |
| `is_fixed=true` aynı kamera 2+ aktif oturumda | **409** "Already in another session" |
| Personal cam'i başka kullanıcı pair etmeye çalışırsa | **403** |
| Phone disconnect (heartbeat 15s timeout) | `disconnected` event + proctor bildirimi |
| Phone battery <20% | `low_battery` event + proctor toast |
| Phone battery <10% | `critical_battery` event + proctor email + audit log warn |
| App backgrounded (visibilityState=hidden) | `app_backgrounded` event + proctor toast (5dk içinde 3 kez tekrar olursa critical) |
| Permission revoked (kamera erişimi geri alındı) | `permission_revoked` event + proctor email |
| Pair token expire (5dk) | UI "Token expired, regenerate" + audit log info |
| Re-pair (aynı `device_id`) | Yeni token, eski camera record'a bağla — yeni record yaratma |

---

## 6. UI Sayfaları & Bileşenleri

### 6.1 PhonePairModal (`portal/components/exams/PhonePairModal.tsx`)

PC tarafında, RoomCameraManager'ın "Pair phone camera" butonuna tıklanınca açılır.

- Üstte: QR kod (qrcode.react ile render — ~5KB lib)
- Altında: pair URL (kopyala butonu)
- Status: "Awaiting phone…" → "📡 Phone connected" (live update via Supabase realtime channel)
- Token timer: 5dk geri sayım + "Regenerate" butonu
- Phone connect olduktan sonra: cam pool'a otomatik eklenir

### 6.2 CamPairPage (`portal/app/cam-pair/page.tsx`)

PWA-friendly telefon sayfası. Public route (token-only auth, login değil).

- Token query param'dan validate
- `getUserMedia({ video: { facingMode: 'environment' } })` izin iste
- Live preview (canvas üstünde)
- Front/back kamera switch tuşu
- "Streaming" toggle (default ON)
- Connection status pill
- Battery / Visibility / Network indicators (üst bar)
- Capture loop: setInterval(200ms) → canvas → JPEG → WebSocket binary

### 6.3 SessionCameraAttach (`portal/components/exams/SessionCameraAttach.tsx`)

ExamDetail SessionCard içinde "Cameras" tile'ına tıklanınca açılır modal.

- Üstte: "Attached cameras" listesi (junction'dan) + remove buton
- Altında: "Add camera" — pool dropdown:
  - Bu odanın **fixed** kameraları (her zaman önerilir)
  - Kullanıcının **personal** mobile kameraları
  - **System** mobile kameraları
  - **+ Pair new phone** (PhonePairModal aç)

### 6.4 CameraHealthBadge (`portal/components/exams/CameraHealthBadge.tsx`)

`/exams/[id]/live` sayfasında her bağlı kamera için renk-kodlu badge.

| State | Renk | Tooltip |
|---|---|---|
| Healthy | yeşil | "Connected, battery 87%, app foreground" |
| Warning | sarı | "Battery 18% — proctor lütfen şarja takın" |
| Critical | kırmızı | "App backgrounded 3x in 5min" / "Disconnected 8s" |
| Offline | gri | "Last seen 2 min ago" |

### 6.5 RoomCameraManager Güncellemesi

- "Add camera" → 3 seçim: IP camera / Pair phone / USB webcam
- Mevcut form sadece IP camera için kullanılır
- Pair phone tıklanınca PhonePairModal açılır
- USB webcam için: `enumerateDevices()` ile cihaz listele, `local://device-{id}` URL formatında kaydet

---

## 7. Telefon Tarafı Sağlık İzleme

### 7.1 İzlenecek Browser API'ları

```typescript
// Page Visibility
document.addEventListener('visibilitychange', () => {
  emit(document.visibilityState === 'hidden' ? 'app_backgrounded' : 'app_foregrounded');
});

// Battery (deprecated in Firefox; available in Chrome/Safari)
const battery = await navigator.getBattery();
battery.addEventListener('levelchange', () => {
  if (battery.level < 0.10)      emit('critical_battery', { level: battery.level });
  else if (battery.level < 0.20) emit('low_battery',      { level: battery.level });
});
battery.addEventListener('chargingchange', () => {
  if (battery.charging) emit('charging');
});

// Orientation
window.addEventListener('orientationchange', () => {
  emit('orientation_changed', { orientation: screen.orientation.type });
});

// Permission revoke
navigator.permissions.query({ name: 'camera' as PermissionName }).then(p => {
  p.onchange = () => p.state === 'denied' && emit('permission_revoked');
});

// Heartbeat
setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 5_000);
```

### 7.2 Server-side Disconnect Detection

AI service publish route'unda 15 sn ping yokluğu → camera offline.
Portal'a Supabase realtime üzerinden disconnect notification.

---

## 8. Bildirim & Email Tetikleyicileri

| Event | Notification | Email | Log |
|---|---|---|---|
| `disconnected` (15s) | Chief proctor + proctors | — | audit_logs warn |
| `critical_battery` | Chief proctor + camera owner | Camera owner | audit_logs warn |
| `permission_revoked` | Chief proctor + camera owner | Chief proctor | audit_logs critical |
| `app_backgrounded` (3x in 5dk) | Chief proctor | — | audit_logs warn |
| `connected` / `reconnected` | Chief proctor (toast) | — | audit_logs info |
| Yanlış-oda 409 (UI hatası) | — | — | audit_logs warn |

---

## 9. Tip Tanımları (PRD-000 Update)

```typescript
// @interface Camera @version 1.2 — replaces @1.1
export interface Camera {
  id: string;
  room_id: string | null;          // NULL for movable cams without home room
  label: string;
  stream_url: string;
  camera_type: CameraType;
  role: CameraRole;
  position_x: number | null;
  position_y: number | null;
  quality_score: number;
  is_active: boolean;
  is_fixed: boolean;               // NEW
  owner_user_id: string | null;    // NEW — null = system-owned
  device_id: string | null;        // NEW — phone fingerprint
  last_seen_at: string | null;     // NEW
  created_at: string;
}

// @interface SessionCamera @version 1.0
export interface SessionCamera {
  id: string;
  session_id: string;
  camera_id: string;
  added_at: string;
  added_by: string | null;
}

// @interface CameraHealthEvent @version 1.0
export type CameraHealthEventType =
  | 'connected' | 'disconnected' | 'reconnected'
  | 'low_battery' | 'critical_battery' | 'charging'
  | 'app_backgrounded' | 'app_foregrounded'
  | 'overheat' | 'orientation_changed' | 'preview_offscreen'
  | 'permission_revoked';

export interface CameraHealthEvent {
  id: string;
  camera_id: string;
  session_id: string | null;
  event_type: CameraHealthEventType;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
```

---

## 10. Key Files

### Sayfalar
| Dosya | Rol |
|---|---|
| `portal/app/cam-pair/page.tsx` | Telefon pair sayfası (token-auth, PWA-installable) |

### Bileşenler
| Dosya | Rol |
|---|---|
| `portal/components/exams/PhonePairModal.tsx` | QR kod + status, PC tarafı |
| `portal/components/exams/SessionCameraAttach.tsx` | Session'a kamera ekle/çıkar modal |
| `portal/components/exams/CameraHealthBadge.tsx` | Live'da kamera state göstergesi |
| `portal/components/exams/CamPairCapture.tsx` | getUserMedia + canvas + WS publisher |
| `portal/components/exams/RoomCameraManager.tsx` | (mevcut) — IP/phone/USB seçimi eklenir |

### API Routes
| Dosya | Rol |
|---|---|
| `portal/app/api/cameras/pair-token/route.ts` | POST, JWT üret |
| `portal/app/api/cameras/pair/redeem/route.ts` | GET, redeem |
| `portal/app/api/cameras/[id]/health-event/route.ts` | POST + GET |
| `portal/app/api/exam-sessions/[id]/cameras/route.ts` | GET / POST / DELETE |

### AI Service
| Dosya | Rol |
|---|---|
| `ai-service/src/api/publish_handler.py` | WS publish route + frame queue integration |
| `ai-service/src/api/protocol.py` | (mevcut) — protocol_version 1.1, publish msg eklenir |

### Migrations
| Dosya | İçerik |
|---|---|
| `20260504XXXXXX_camera_pairing_extensions.sql` | cameras alan ekleri + session_cameras + camera_health_events |

---

## 11. Test Senaryoları

### Pair Akışı
- [ ] PC'den `/exam-rooms` → "Pair phone" → QR çıkar
- [ ] Telefondan QR taranır → `/cam-pair` açılır → token validate
- [ ] getUserMedia izni → live preview başlar
- [ ] WS bağlanır → "Phone connected" PC'de görünür
- [ ] Token expire (5dk sonra) → regenerate akışı çalışır

### Sabit Kamera Validation
- [ ] Lab A'da fixed cam → Lab A oturumuna ekle: ✓
- [ ] Aynı cam Lab B oturumuna ekle: 409 + UI hata mesajı
- [ ] Aynı fixed cam 2 aktif oturumda: 409
- [ ] Mobile cam farklı odalardaki oturumlara serbestçe eklenir

### Sahiplik
- [ ] Personal cam sadece sahibinin pair-token endpoint'inde geçerli
- [ ] System cam (`owner_user_id NULL`) tüm authenticated kullanıcılarca pair'lenebilir
- [ ] Başka kullanıcının personal cam'ini pair etmeye kalk: 403

### Sağlık Eventleri
- [ ] Battery < 20% → low_battery → proctor toast
- [ ] Battery < 10% → critical_battery → proctor toast + email
- [ ] App background → notification gönderilir
- [ ] 3x background in 5 min → critical
- [ ] Camera permission revoke → critical event

### AI Pipeline Entegrasyonu
- [ ] Telefondan publish edilen JPEG frame → YOLO → detection
- [ ] Detection → ServerIncident → /exams/[id]/live'da görünür
- [ ] Multi-cam aynı oturum → her ikisinden frame'ler işlenir

---

## 12. Breaking Changes

| Versiyon | Değişiklik |
|---|---|
| 1.0 | İlk sürüm: telefon pair akışı, session_cameras junction, fixed/movable, sahiplik, sağlık izleme, AI publish route |

> **Camera @1.2 breaking change:** `cameras.room_id` artık nullable. Mevcut
> kayıtlar (Sprint 4'te kayıt edilmiş fixed cam'ler) `is_fixed=true`
> default'u ile uyumludur — `room_id NOT NULL` constraint kalktığı için
> ekstra migration gerektirmez. Yeni mobile cam'ler `room_id=NULL` ile
> oluşturulur.

---

## 13. Açık Tasarım Soruları (Phase 2 için)

1. **WebRTC peer-to-peer** vs WS-JPEG — Phase B'de düşük latency için P2P
   düşünülebilir (signaling server gerekir).
2. **TURN/STUN** — TEDU LAN dışındaki cihazlar için.
3. **Frame storage** — JPEG'ler diske/storage'a archive edilsin mi (incident
   evidence için)?
4. **Multi-account telefon** — bir telefon birden fazla proctor için
   farklı zamanlarda kullanılabilsin mi?
