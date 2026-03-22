# PRD-015 — Raporlar & Teslim Edilebilirler
**Versiyon:** 1.0
**Owner:** HorusEye Team
**Bağımlılıklar:** PRD-000, PRD-001, PRD-003, PRD-014
**Blocks:** —
**Durum:** AKTIF

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
HorusFile: @1.4
ReportDeliverable: @1.0
ChecklistItem: @1.0
-->

## ⚠️ LLM TALİMATI
`report_deliverables` ve `checklist_items` tablolarının sahibi bu PRD'dir.
Diğer PRD'ler bu tabloları sadece okuyabilir, şema değişikliği yapamaz.
`assigned_to` değiştiğinde e-posta bildirimi PRD-014 aracılığıyla gönderilir — loglama değil, fire-and-forget.
Interface bağımlılıkları yukarıdaki INTERFACE_DEPS bloğunda belirtilmiştir.
`report_deliverables` tablosunu PRD-003'teki `files` tablosuna `file_id` FK ile bağlanabilir (opsiyonel).

---

## 1. Amaç

Ekip içi proje teslim edilebilirlerini (deliverable) takip etmek için merkezi bir yönetim ekranı sağlar.
Her deliverable; başlık, açıklama, teslim tarihi, sorumlu kişi, bağlantılı dosya ve kontrol listesi (checklist) içerir.
Tüm authenticated kullanıcılar listeyi görebilir; güncelleme (status, assigned_to, checklist) tüm authenticated kullanıcılara açıktır.

---

## 2. Veritabanı Şeması

```sql
-- Teslim edilebilirler
CREATE TABLE public.report_deliverables (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  description        TEXT,
  deliverable_number TEXT NOT NULL,          -- Görüntüleme kodu, örn: "D-01"
  deadline           DATE NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'in_progress', 'completed')),
  assigned_to        UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  file_id            UUID REFERENCES public.files(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- Kontrol listesi öğeleri
CREATE TABLE public.checklist_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id  UUID NOT NULL REFERENCES public.report_deliverables(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  is_checked      BOOLEAN NOT NULL DEFAULT false,
  checked_by      UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON public.checklist_items (deliverable_id, sort_order);
```

**Not:** `deadline` alanı `DATE` tipindedir (TIMESTAMPTZ değil). Sadece tarih saklanır, saat bilgisi yoktur. UI'da tarih picker (date-only, saat yok) kullanılır.

**Dosya bağlantısı:** `file_id` FK `ON DELETE SET NULL` — dosya silinirse deliverable korunur, sadece dosya bağlantısı kopar.

**Migration:** `20260318101021_create_report_deliverables_and_checklist.sql`

---

## 3. RLS Politikaları

```sql
-- report_deliverables: tüm authenticated kullanıcılar okuyabilir
ALTER TABLE public.report_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read" ON public.report_deliverables
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write" ON public.report_deliverables
  FOR ALL USING (auth.role() = 'authenticated');

-- checklist_items: tüm authenticated kullanıcılar okuyabilir ve yazabilir
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read" ON public.checklist_items
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "authenticated write" ON public.checklist_items
  FOR ALL USING (auth.role() = 'authenticated');
```

---

## 4. API Route'ları

```
GET    /api/reports                          → Tüm deliverable'ları listele (checklist özet dahil)
GET    /api/reports/[id]                     → Tekil deliverable getir
PUT    /api/reports/[id]                     → Deliverable güncelle (status, assigned_to, file_id, title, description)

GET    /api/reports/[id]/checklist           → Deliverable'ın checklist öğelerini getir (sort_order ASC)
POST   /api/reports/[id]/checklist           → Yeni checklist öğesi ekle { label }
PUT    /api/reports/[id]/checklist/[itemId]  → Öğe güncelle { label?, is_checked?, sort_order? }
DELETE /api/reports/[id]/checklist/[itemId]  → Öğeyi sil
```

**Yetki:** Tüm route'lar authenticated kullanıcı gerektirir (Supabase `auth.getUser()` kontrolü).

### 4.1 GET /api/reports — Yanıt Formatı

```typescript
{
  deliverables: Array<ReportDeliverable & {
    checklist_total: number;   // Toplam checklist öğe sayısı
    checklist_checked: number; // İşaretlenmiş öğe sayısı
  }>
}
```

Sıralama: `deadline ASC`, ardından `deliverable_number ASC`.

### 4.2 PUT /api/reports/[id] — E-posta Tetikleyici

`assigned_to` alanı değiştiğinde (yeni değer eskisinden farklıysa):
- PRD-014'teki `reportAssignedTemplate` kullanılarak atanan kişiye e-posta gönderilir
- E-posta fire-and-forget'tir — hata durumunda istek başarısız olmaz
- Atayan kişinin adı (`actorProfile.full_name`) e-postaya eklenir

**Bildirim kategorisi:** Deliverable atandığında `category: 'team'` kullanılır (dosya değil, kişi ataması). Email: PRD-014 `reportAssignedTemplate`.

**Atama kuralları:**
- Sadece `is_active=true` olan kullanıcılar atanabilir
- Tüm roller atanabilir (admin, supervisor, assistant)
- İnaktif kullanıcı atanamaz (dropdown'da görünmez)
- Atanan kişi silinirse: `assigned_to` NULL olur (ON DELETE SET NULL)

### 4.3 Response Formatları

**Response formatları:**
```typescript
// GET /api/reports
{ deliverables: Array<ReportDeliverable & { checklist_total: number, checklist_checked: number }> }

// GET /api/reports/[id]
{ deliverable: ReportDeliverable, checklist: ChecklistItem[] }

// PUT /api/reports/[id]
{ deliverable: ReportDeliverable } // güncellenmiş hali

// POST /api/reports/[id]/checklist
{ item: ChecklistItem } // yeni oluşturulan

// PUT /api/reports/[id]/checklist/[itemId]
{ item: ChecklistItem } // güncellenmiş
```

**Kullanılan ApiErrorCode'lar:** `REPORT_NOT_FOUND`, `VALIDATION_ERROR`, `AUTH_FORBIDDEN`

---

## 5. UI — `/reports` Sayfası

**Konum:** `app/(protected)/reports/page.tsx`
**Component:** `components/reports/ReportsList.tsx`

### Liste Görünümü
- Grid layout: `sm:grid-cols-2 lg:grid-cols-3`
- Her kart:
  - Deliverable numarası (monospace, küçük) + başlık
  - Durum badge'i (`pending` / `in_progress` / `completed`)
  - Teslim tarihi (`tr-TR` locale) — gecikmiş ise kırmızı + "OVERDUE" etiketi
  - Checklist ilerleme çubuğu (`checked/total`)
- Tıklandığında `/reports/[id]` detay sayfasına yönlenir

### Durum Renk Sistemi
| Durum | Renk |
|-------|------|
| `pending` | `bg-muted text-muted-foreground` |
| `in_progress` | `bg-primary/10 text-primary` |
| `completed` | `bg-green-500/10 text-green-600` |

**Overdue hesaplama:**
```
overdue = status !== 'completed' AND deadline < CURRENT_DATE
```
Timezone: UTC (DATE tipi timezone-agnostic). Geç tamamlanan deliverable: `completed` status ama `deadline < completed_at` → 'Geç tamamlandı' etiketi (kırmızı değil, sarı).

**Progress bar:**
- `total=0`: 'Checklist yok' gösterilir, progress bar gizli
- `checked/total`: '3/5 tamamlandı' formatında metin
- `%100`: yeşil progress bar + ✅ ikonu
- `%0`: gri progress bar

**Sıralama:** `deadline ASC NULLS LAST` — deadline'ı olmayan deliverable'lar sona eklenir. `deliverable_number` text olarak lexicographic sıralanır ('D-01' < 'D-02' < 'D-10' ✅).

**Sorumlu kişi dropdown:** `user_profiles` tablosundan `is_active=true` olanlar listelenir. Rol filtresi yok (tüm roller atanabilir). Pagination yok (takım küçük, max 20-30 kişi).

---

## 6. UI — `/reports/[id]` Sayfası

**Konum:** `app/(protected)/reports/[id]/page.tsx`
**Component:** `components/reports/ReportDetail.tsx`

Tekil deliverable detayı gösterir:
- Başlık, açıklama, teslim tarihi, durum
- Sorumlu kişi seçimi (dropdown, user_profiles listesinden)
- Bağlantılı dosya seçimi (opsiyonel, files tablosundan)
- Checklist yönetimi (`components/reports/ChecklistSection.tsx`)

### ChecklistSection
**Konum:** `components/reports/ChecklistSection.tsx`

- Öğe listesi (sort_order sırasında)
- Checkbox toggle → `PUT /api/reports/[id]/checklist/[itemId]` ile `is_checked` güncellenir
- Yeni öğe ekleme: `label` input + kaydet
- Öğe silme
- `sort_order` otomatik artan (mevcut max + 1)

**Sort order kuralları:**
- İlk item: `sort_order = 0`
- Yeni item: `MAX(sort_order) + 1`
- Silme: boşluk kalır (normalizasyon yapılmaz)
- Drag-and-drop: batch update `PATCH /api/reports/[id]/checklist/reorder` → `{ items: [{ id, sort_order }] }`

**Tamamlanma tespiti:** Son checklist item işaretlendiğinde (`is_checked=true`) ve tüm item'lar checked ise:
1. `createNotification({ user_id: deliverable.assigned_to, category: 'team', title: 'Checklist tamamlandı', ... })`
2. Deliverable status otomatik `completed`'a **geçmez** — manuel güncelleme gerekir (proactive değil, informative)

---

## 7. Tip Tanımları

`portal/types/index.ts` dosyasında tanımlıdır:

```typescript
// @interface ReportDeliverable @version 1.0
export type DeliverableStatus = 'pending' | 'in_progress' | 'completed';

export interface ReportDeliverable {
  id: string;
  title: string;
  description: string | null;
  deliverable_number: string;
  deadline: string;            // ISO 8601
  status: DeliverableStatus;
  assigned_to: string | null;  // user_id FK
  file_id: string | null;      // FK → files (opsiyonel)
  created_at: string;
  updated_at: string;
}

// @interface ChecklistItem @version 1.0
export interface ChecklistItem {
  id: string;
  deliverable_id: string;
  label: string;
  is_checked: boolean;
  checked_by: string | null;  // user_id — son işaretleyen
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

---

## 8. Key Files

| Dosya | Rol |
|-------|-----|
| `portal/app/(protected)/reports/page.tsx` | Liste sayfası |
| `portal/app/(protected)/reports/[id]/page.tsx` | Detay sayfası |
| `portal/app/api/reports/route.ts` | GET — deliverable listesi |
| `portal/app/api/reports/[id]/route.ts` | GET/PUT — tekil deliverable |
| `portal/app/api/reports/[id]/checklist/route.ts` | GET/POST — checklist öğeleri |
| `portal/app/api/reports/[id]/checklist/[itemId]/route.ts` | PUT/DELETE — tekil öğe |
| `portal/components/reports/ReportsList.tsx` | Liste grid componenti |
| `portal/components/reports/ReportDetail.tsx` | Detay sayfası componenti |
| `portal/components/reports/ChecklistSection.tsx` | Checklist yönetim componenti |
| `portal/types/index.ts` | ReportDeliverable + ChecklistItem interface tanımları |

---

## 9. Test Senaryoları

- [ ] GET /api/reports → deadline'a göre sıralı, checklist özeti doğru
- [ ] Gecikmiş deliverable → listede kırmızı border + "OVERDUE" label
- [ ] Status güncelleme → badge rengi ve DB'de güncelleniyor
- [ ] assigned_to değiştirme → atanan kişiye e-posta gidiyor (PRD-014)
- [ ] assigned_to aynı kalıyorsa → e-posta gitmiyor
- [ ] Checklist öğesi ekleme → sort_order doğru artıyor
- [ ] Checkbox toggle → is_checked + checked_by DB'de güncelleniyor
- [ ] Checklist öğesi silme → listeden kaldırılıyor
- [ ] file_id bağlantısı → dosya silinirse NULL'a düşüyor (ON DELETE SET NULL)
