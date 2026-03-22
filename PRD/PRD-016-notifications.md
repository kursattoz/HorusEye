# PRD-016 — Bildirim Merkezi
**Versiyon:** 2.0
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000, PRD-001
**Blocks:** —
**Durum:** AKTIF (DB Backend — Tam Implementasyon)

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
Notification: @1.0
-->

## ⚠️ LLM TALİMATI
Bildirim Merkezi artık **tam veritabanı desteğine** sahiptir.
`notifications` tablosu, API route'ları ve `lib/notifications.ts` helper'ı mevcuttur.
Yeni bildirim tetikleyicileri eklerken `createNotification()` veya `notifyAdmins()` helper'larını kullanın.
Interface bağımlılıkları INTERFACE_DEPS bloğunda declare edilmiştir.
PRD-000'daki version değişirse bu bloğu güncelle, yoksa `validate:prd` script'i fail eder.

---

## 1. Amaç

Authenticated kullanıcıların sistem içi olayları (dosya yüklemeleri, feedback, takım değişiklikleri, sistem uyarıları) tek bir merkezden görmesini sağlar.

---

## 2. Veritabanı Şeması

```sql
CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  category    VARCHAR NOT NULL CHECK (category IN ('files', 'feedback', 'team', 'system')),
  title       TEXT NOT NULL,
  description TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  link        TEXT,           -- opsiyonel navigasyon linki (internal path, '/' ile başlar)
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON public.notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON public.notifications (user_id) WHERE is_read = false;

-- RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);
```

**Link kuralları:** `link` alanı internal path olmalıdır (`/` ile başlar). External URL kabul edilmez. Client link'e tıkladığında `router.push(link)` kullanılır. Link'in hedefi silinmişse → 404 sayfası (graceful).

**Metadata yapısı (kategori bazlı):**
```typescript
// files category
{ file_id: string, file_name: string }

// feedback category
{ file_id: string, feedback_id: string, author_name: string }

// team category
{ user_id: string, user_name: string, action: 'created' | 'deleted' | 'assigned' }

// system category
{ service: string, status: 'degraded' | 'down', message: string }
```

**Dil:** Tüm bildirim başlıkları ve açıklamaları Türkçe yazılır. Şimdilik tek dil desteği. İleride i18n eklenebilir (§9.1).

---

## 3. API Routes

```
GET  /api/notifications        → Kullanıcının bildirimlerini listele (son 50, ?unread=true filtresi)
GET  /api/notifications/count  → Okunmamış bildirim sayısı: { unread: number }
POST /api/notifications/read   → Bildirimleri okundu işaretle: { ids: string[] } veya { all: true }
```

Tüm route'lar authentication gerektirir. Kullanıcı sadece kendi bildirimlerini görebilir (RLS).

**API hata yanıtları:**
| Endpoint | Hata | HTTP | ApiErrorCode |
|----------|------|------|-------------|
| GET /api/notifications | Invalid unread param | 400 | `VALIDATION_ERROR` |
| POST /api/notifications/read | Boş ids array | 400 | `VALIDATION_ERROR` |
| POST /api/notifications/read | Başka user'ın notification'ı | 403 | `AUTH_FORBIDDEN` |
| GET /api/notifications/count | Auth yok | 401 | `AUTH_SESSION_EXPIRED` |

---

## 4. Helper Library

**Konum:** `portal/lib/notifications.ts`

```typescript
// Fire-and-forget — asla throw etmez
createNotification(payload: {
  user_id: string;
  category: NotificationCategory;
  title: string;
  description?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<void>

// Tüm aktif admin'lere bildirim gönder
notifyAdmins(
  category: NotificationCategory,
  title: string,
  description?: string,
  link?: string,
): Promise<void>
```

---

## 5. Bildirim Kategorileri

| Kategori | İkon | Açıklama |
|----------|------|----------|
| `files` | FileText | Dosya yükleme, güncelleme, silme |
| `feedback` | MessageSquare | Yeni feedback, çözüldü olarak işaretlendi |
| `team` | Users | Yeni kullanıcı, rol değişikliği |
| `system` | Activity | Sistem health uyarıları, monitör olayları |

---

## 6. Tetikleyiciler

### 6.1 Entegrasyon Tablosu

| Olay | Tetikleyen Route | Alıcı | Kategori | Kod |
|------|-----------------|-------|----------|-----|
| Dosya yüklendi | `POST /api/files/upload` | Tüm admin + supervisor | `files` | `createNotification()` success callback'te |
| Dosya güncellendi | `PUT /api/files/[id]` | Dosyayı yükleyen (self hariç) | `files` | `createNotification()` |
| Dosya silindi | `DELETE /api/files/[id]` | Tüm admin'ler | `files` | `notifyAdmins()` |
| Feedback geldi | `POST /api/feedback` | Dosyayı yükleyen (self hariç) | `feedback` | `createNotification()` |
| Feedback resolved | `POST /api/feedback/[id]/resolve` | Feedback yazarı | `feedback` | `createNotification()` |
| Public feedback geldi | `POST /api/public/feedback` | Tüm admin'ler | `feedback` | `notifyAdmins()` |
| Kullanıcı eklendi | `POST /api/users` | Tüm admin'ler | `team` | `notifyAdmins()` |
| Kullanıcı silindi | `DELETE /api/users/[id]` | Tüm admin'ler | `team` | `notifyAdmins()` |
| Deliverable atandı | `PUT /api/reports/[id]` (assigned_to değişti) | Yeni atanan | `team` | `createNotification()` |
| Checklist tamamlandı | `PUT /api/reports/[id]/checklist/[itemId]` (tümü checked) | Deliverable assigned_to | `team` | `createNotification()` |
| Sistem health degraded | `/api/health/detailed` (status != healthy) | Tüm admin'ler | `system` | `notifyAdmins()` |
| Dosya purge tamamlandı | `POST /api/files/purge` | Tüm admin'ler | `system` | `notifyAdmins()` |

**Implementasyon durumu:** Aşağıdaki trigger'lar henüz koda entegre edilmemiştir ve implementasyon sırasında ilgili API route'lara eklenmesi gerekir:
- Dosya güncellendi → `PUT /api/files/[id]`
- Feedback resolved → `POST /api/feedback/[id]/resolve`
- Checklist tamamlandı → `PUT /api/reports/[id]/checklist/[itemId]` (tüm item'lar checked ise)
- Sistem health degraded → `/api/health/detailed` (cron check)
- Dosya purge → `POST /api/files/purge`

Trigger ekleme template'i:
```typescript
// İlgili API route'un success path'inde:
createNotification({
  user_id: targetUserId,
  category: 'files', // veya 'feedback', 'team', 'system'
  title: 'Bildirim başlığı',
  description: 'Detay',
  link: '/hedef/sayfa',
}).catch(() => {}); // fire-and-forget
```

### 6.2 Entegrasyon Kuralı

Her tetikleyici ilgili API route'un **success path'inde** çağrılır:

```typescript
// Örnek: POST /api/files/upload route.ts
const file = await uploadFile(formData);
// ... upload success ...

// Fire-and-forget — hata fırlatmaz, upload'u bloklamaz
createNotification({
  user_id: supervisorId,
  category: 'files',
  title: 'Yeni dosya yüklendi',
  description: `${user.full_name} "${file.display_name}" dosyasını yükledi`,
  link: `/files?highlight=${file.id}`,
}).catch(() => {}); // sessiz hata

return NextResponse.json(file);
```

**Self-notification engelleme:** Eylemi yapan kullanıcıya kendi eylemi hakkında bildirim gönderilmez. `createNotification()` çağrılmadan önce `if (user_id === actor_id) return;` kontrolü yapılır.

**Self-notification engelleme kuralları:**
| Olay | Self-notification? | Neden |
|------|--------------------|-------|
| Dosya yükleme | ❌ Engelle | Kendi yüklediğini bilir |
| Dosya güncelleme | ❌ Engelle | Kendi güncellediğini bilir |
| Feedback yazma | ❌ Engelle (kendi dosyasına) | Kendi dosyasına yorum yazdığını bilir |
| Feedback resolved | ✅ Gönder | Başkası çözdü, yazar bilmeli |
| Kullanıcı ekleme | ✅ Gönder (diğer admin'lere) | Tüm admin'ler bilmeli |
| Deliverable atama | ✅ Gönder (atanan kişiye) | Atanan kişi bilmeli |
| Sistem health | ✅ Gönder (tüm admin'lere) | Sistem uyarısı, herkes bilmeli |

### 6.3 Realtime Güncelleme

Bildirim sayacının (NotificationBell badge) anlık güncellenmesi için:

```typescript
// components/layout/NotificationBell.tsx
const channel = supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${user.id}`,
  }, (payload) => {
    setUnreadCount(prev => prev + 1);
    // Opsiyonel: toast göster
    toast.info(payload.new.title);
  })
  .subscribe();
```

**Fallback tetikleyici:** Supabase Realtime `CHANNEL_ERROR` veya `TIMED_OUT` event'i alındığında fallback aktif olur. 30s interval ile `GET /api/notifications/count` poll yapılır. Realtime bağlantı yeniden kurulursa poll durur.

**UI gösterimi:** Fallback modunda NotificationBell'de küçük sarı nokta gösterilir (tooltip: 'Gerçek zamanlı bağlantı kesildi, 30s aralıkla kontrol ediliyor').

**Race condition önleme:** Realtime INSERT event'i ile poll sonucu çakışabilir. Çözüm: poll sonucu her zaman local state'i override eder (authoritative source). Realtime event'i sadece increment yapar, decrement yapmaz. Mark-read işlemi sonrası poll tetiklenir.

### 6.4 Bildirim Retention

- Bildirimler **90 gün** sonra otomatik silinir (cron veya Supabase pg_cron)
- Kullanıcı kendi bildirimlerini manuel silemez (sadece okundu işaretler)
- Admin panel'den toplu silme yapılabilir (ileride)

**Cron implementasyonu:** Supabase pg_cron ile:
```sql
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *',  -- Her gün 03:00 UTC
  $$DELETE FROM public.notifications WHERE created_at < now() - interval '90 days'$$
);
```
Bu SQL, notification migration dosyasına eklenir. Hard delete yapılır (soft delete değil). Silinen kullanıcıların bildirimleri CASCADE ile zaten silinir.

---

## 7. UI Bileşenleri

### 7.1 Sayfa
**Route:** `/notifications`
**Konum:** `app/(protected)/notifications/page.tsx`
**Erişim:** Tüm authenticated kullanıcılar

### 7.2 NotificationBell (Topbar)
**Konum:** `components/layout/NotificationBell.tsx`
Topbar'da bildirim ikonu; okunmamış bildirim sayısını badge olarak gösterir.
Tıklandığında popover ile son bildirimleri gösterir, "View all" linki ile `/notifications` sayfasına yönlendirir.

**NotificationBell detayları:**
- Unread count > 99: '99+' gösterilir
- Popover: son 5 bildirim gösterilir, 'Tümünü gör' linki
- Yeni bildirim gelince: badge sayısı anında güncellenir (Realtime)
- Badge rengi: `bg-destructive text-destructive-foreground` (PRD-009 design token, kırmızı)
- Animasyon: yeni bildirimde badge 1 kez pulse (scale 1→1.2→1, 300ms)

### 7.3 UI Davranışı
- Okunmamış bildirimler: açık `bg-primary/5` arkaplan + mavi nokta
- Okunmuş bildirimler: normal arkaplan
- Üst bilgi: "X unread notification(s)" sayacı
- Kategori badge'i + zaman etiketi her bildirimde görünür
- "Mark all as read" butonu

**Zaman gösterimi:**
- < 1 dakika: 'Az önce'
- < 1 saat: 'X dakika önce'
- < 24 saat: 'X saat önce'
- < 7 gün: 'X gün önce'
- >= 7 gün: 'DD.MM.YYYY' (TR locale)
Timezone: kullanıcının tarayıcı timezone'u (`Intl.DateTimeFormat`)

---

## 8. Key Files

| Dosya | Rol |
|-------|-----|
| `portal/app/(protected)/notifications/page.tsx` | Bildirim listesi sayfası |
| `portal/components/layout/NotificationBell.tsx` | Topbar bildirim ikonu + badge |
| `portal/app/api/notifications/route.ts` | GET — bildirim listesi |
| `portal/app/api/notifications/count/route.ts` | GET — okunmamış sayısı |
| `portal/app/api/notifications/read/route.ts` | POST — okundu işaretleme |
| `portal/lib/notifications.ts` | createNotification + notifyAdmins helper |
| `portal/supabase/migrations/20260319084008_create_notifications.sql` | DB migration |

---

## 9. İlerideki Faz

### 9.1 Bildirim Tercihleri
Kullanıcıların hangi kategorilerden bildirim almak istediklerini seçebilmesi (`/settings` → Notifications tab).

### 9.2 Faz 2 Tetikleyicileri (PRD-013)

`CAMERA_MODULE_ENABLED=true` olduğunda §6.1 tablosuna ek olarak:

| Olay | Tetikleyen | Alıcı | Kategori | Koşul |
|------|-----------|-------|----------|-------|
| Sınav başladı | Session status → `active` | Atanmış gözetmenler | `system` | Her session start |
| Sınav bitti | Session status → `ended` | Atanmış gözetmenler + admin | `system` | Her session end |
| TIER 1 incident (severity >= high) | AI servis → incident POST | Atanmış gözetmenler + admin | `system` | **Push notification + sesli uyarı** |
| TIER 2 incident (severity = medium, tekrarlayan) | Escalation kuralı tetiklendi | Atanmış gözetmenler | `system` | 5dk'da 3+ medium |
| Kamera offline | Camera health → offline | Admin'ler | `system` | RTSP 3× retry başarısız |
| AI servis degraded/down | Health check fail | Admin'ler | `system` | 3 ardışık miss |
| Rapor hazır | Background job tamamlandı | Oturumu oluşturan admin | `system` | Async report done |
| Proctor karar verdi | PUT /api/incidents/[id]/decide | Admin'ler (violation ise) | `system` | decision = violation |

**Severity >= high kuralı:** Bu seviyedeki incident'lar için `createNotification()` + Web Push (`requireInteraction: true`) tetiklenir. Proctor dismiss edene kadar bildirim kaybolmaz.

---

## 10. Test Senaryoları

- [ ] `/notifications` sayfası authenticated kullanıcıya açılıyor
- [ ] Okunmamış bildirimler vurgulanıyor (mavi arkaplan + nokta)
- [ ] Topbar'daki NotificationBell unread sayacı doğru gösteriyor
- [ ] GET /api/notifications → kullanıcının kendi bildirimlerini döndürüyor
- [ ] GET /api/notifications?unread=true → sadece okunmamış bildirimler
- [ ] GET /api/notifications/count → { unread: N } doğru sayı
- [ ] POST /api/notifications/read → { ids: [...] } ile bildirimler okundu işaretleniyor
- [ ] POST /api/notifications/read → { all: true } ile tüm bildirimler okundu
- [ ] RLS: kullanıcı başka kullanıcının bildirimlerini göremez
- [ ] createNotification() fire-and-forget — hata fırlatmaz
- [ ] notifyAdmins() tüm aktif admin'lere bildirim oluşturuyor

---

## 11. Breaking Changes Geçmişi

| Tarih | Değişiklik | Etkilenen PRD |
|-------|-----------|---------------|
| v1.0 | İlk versiyon — UI shell, hardcoded mock data | — |
| v2.0 | DB backend eklendi: notifications tablosu, API routes, helper lib, Notification interface | PRD-000 |
