# PRD-003 — Dosya Yönetimi (Team Upload)
**Versiyon:** 1.0  
**Bağımlılıklar:** PRD-000, PRD-001  
**Bloke ettiği:** PRD-002, PRD-004  
**Durum:** AKTIF

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
HorusFile: @1.4
-->

## ⚠️ LLM TALİMATI
`public.files` tablosunun tek sahibi bu PRD'dir.
Başka PRD'ler bu tabloyu okur ama write işlemi yapmaz.
HorusFile interface'i PRD-000 Section 3.2'de tanımlıdır, buradan değiştirilemez.
Interface bağımlılıkları INTERFACE_DEPS bloğunda declare edilmiştir.
PRD-000'daki version değişirse bu bloğu güncelle, yoksa `validate:prd` script'i fail eder.

---

## 1. Amaç

Admin ekip üyelerinin proje dosyalarını yükleyebileceği, yönetebileceği
ve public/private olarak işaretleyebileceği dosya yönetim sistemi.
Bu dosyalar HorusEye proje sürecinin belgelerini oluşturur.

---

## 2. Fonksiyonel Gereksinimler

### 2.1 Dosya Yükleme
- Drag & drop + dosya seçici
- Desteklenen formatlar: PDF, PPTX, DOCX, PNG, JPG, JPEG, WEBP
- Max dosya boyutu: 50MB
- Çoklu dosya yükleme: aynı anda max 5 dosya
- Yükleme sırasında: progress bar, iptal butonu
- Upload sonrası: display_name, kategori, açıklama, public/private toggle

**Dosya ismi çakışması:** Aynı `display_name` ile birden fazla dosya olabilir — unique constraint yok. Slug oluşturmada çakışma olursa suffix eklenir (PRD-002). Storage path'te UUID kullanıldığı için fiziksel çakışma olmaz.

### 2.2 Dosya Listesi (Dashboard)
- Tablo görünümü: isim, tip, boyut, tarih, durum (public/private), sıralama, blur page, aksiyonlar
- Satıra tıklayınca sağ tarafta Sheet panel ile dosya önizleme açılır
- Önizleme desteklenen formatlar: PDF (react-pdf, klavye nav destekli), PPTX (Google Docs Viewer), DOCX (Mammoth.js), Image (img)
- Önizleme panelinde Open / Download butonları, belge tarihi DatePicker'ı ve blur pages seçici (PDF için PdfPagePicker)
- **Sheet panel responsive genişlik:** `sm:max-w-xl`, `lg:max-w-2xl`, `2xl:max-w-4xl` — 2K/4K ekranlarda daha geniş

### 2.3 Dosya Düzenleme
- **Inline display name düzenleme:** Tablo satırındaki isim hücresine tıklayınca input'a dönüşür, Enter/blur ile kaydeder, Escape ile iptal eder

**Inline edit hata yönetimi:** Tablo hücresine tıklayıp isim düzenlenir → blur/enter → API call. Başarısız olursa: input eski değere döner + toast: 'İsim güncellenemedi. Tekrar deneyin.' Optimistic update yapılmaz (edit sonrası API yanıtı beklenir).
- Kategori değiştir
- Açıklama güncelle
- Public/private toggle (anlık, ayrı kaydet butonu yok)
- Slug otomatik güncellenir (display_name'den türetilir, Türkçe normalize)

### 2.4 Dosya Silme
- Soft delete (deleted_at alanı set edilir)
- Confirm modal: "Bu dosyayı silmek istediğinizden emin misiniz?"
- Silinen dosyalar public alanda anında kaybolur
- Storage'dan fiziksel silme: 30 gün sonra `POST /api/files/purge` endpoint'i ile (admin veya cron secret)
- Admin silinen dosyaları "Çöp Kutusu" görünümünde görebilir, geri yükleyebilir

**Soft delete ve bağlı veriler:**
- Dosya soft-delete edildiğinde (`deleted_at` set):
  - Public alanda görünmez (RLS: `deleted_at IS NULL` filtresi)
  - `feedbacks` tablosu etkilenmez (yorumlar korunur ama dosya görünmez)
  - `report_deliverables.file_id` korunur (deliverable orphan olmaz)
- Dosya purge edildiğinde (fiziksel silme):
  - `feedbacks` CASCADE delete (FK constraint)
  - `report_deliverables.file_id` SET NULL

### 2.5 Dosya Kategorileri
Sabit kategoriler (metadata.category):
- `reports` — Raporlar (Proposal, Analysis, Design vb.)
- `presentations` — Sunumlar
- `documents` — Genel dokümanlar
- `other` — Diğer

### 2.6 PDF Sayfa Bulanıklaştırma (blurred_pages — çoklu sayfa)
- Admin, bir PDF dosyası için **birden fazla sayfayı** bulanıklaştırılacak olarak işaretleyebilir.
- Amaç: sınav sorusu veya hassas içerik içeren sayfaları görüntüleyicide gizlemek.
- Sayfa numaraları `blurred_pages INTEGER[]` kolonu ile saklanır (null veya boş array ise bulanıklaştırma yok).
- Sadece PDF formatındaki dosyalar için geçerlidir; diğer formatlarda bu alan ignore edilir.
- Görüntüleyicide ilgili sayfalar, yarı saydam overlay ile kaplı gösterilir (içerik erişilemez değil, görsel uyarı amaçlı).
- **Düzenleme yolları:**
  1. Dosya önizleme Sheet panelindeki PdfPagePicker ile görsel çoklu sayfa seçimi (thumbnail'lara tıklayarak toggle)
  2. Tablo satırındaki "Blur Pages" kolonunda seçili sayfa sayısını gösteren badge
- **Yükleme sırasında:** FileUploadDialog'da tek PDF seçildiğinde PdfPagePicker görünür, çoklu sayfa seçilebilir

### 2.7 Belge Tarihi (document_date)
- Admin, dosya için bir belge tarihi (document_date) atayabilir — yükleme tarihi (created_at) ile karıştırılmamalıdır.
- **Yükleme sırasında:** FileUploadDialog'da DatePicker ile seçilebilir.
- **PDF otomatik algılama:** PDF dosyası yüklenirken ilk 3 sayfadan tarih otomatik algılanır (TR/EN format desteği). Algılanan tarih DatePicker'a otomatik set edilir, kullanıcı değiştirebilir.
- **Sonradan düzenleme:** FilesTable'daki "Date" kolonundaki DatePicker ile veya dosya önizleme Sheet panelindeki DatePicker ile düzenlenebilir.
- **DB kolonu:** `document_date DATE` (nullable). NULL ise `created_at` fallback olarak gösterilir.
- **Desteklenen tarih formatları (otomatik algılama):** DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD, "Month DD, YYYY", "DD Ay YYYY" (Türkçe ay adları)

**PDF tarih algılama implementasyonu:**
- Kütüphane: `pdf-parse` (Node.js) ile ilk 3 sayfanın metin içeriği çıkarılır
- Desteklenen formatlar:
  - `DD.MM.YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`
  - `D Ay YYYY` (Türkçe: '15 Mart 2026', İngilizce: '15 March 2026')
  - Türkçe ay adları: Ocak, Şubat, Mart, Nisan, Mayıs, Haziran, Temmuz, Ağustos, Eylül, Ekim, Kasım, Aralık
- Birden fazla tarih bulunursa: en yeni tarih seçilir
- Tarih bulunamazsa: `document_date` null bırakılır, kullanıcı manuel girer
- Hata durumunda: sessiz fail, `document_date` null

### 2.8 Manuel Dosya Sıralama (sort_order)
- Admin, dosya listesindeki sıralamayı manuel olarak ayarlayabilir.
- FilesTable'da her satırda yukarı (↑) ve aşağı (↓) butonları vardır.
- `sort_order` kolonu set edilmiş dosyalar önce gösterilir (ASC), set edilmemişler en sona düşer.
- Public alanda (`public_files` view) aynı sıralama korunur.

**Sort order davranışı:** Admin drag-and-drop ile sıra değiştirir. Silinen dosyanın sort_order'ı boşluk bırakır — normalizasyon yapılmaz (performans). Yeni dosya: `max(sort_order) + 1` veya null (sona eklenir).

---

## 3. Veritabanı

```sql
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,              -- Orijinal dosya adı
  display_name VARCHAR(255) NOT NULL,      -- Gösterilen isim
  file_type VARCHAR(20) NOT NULL
    CHECK (file_type IN ('pdf','pptx','docx','image','video','other')),
  storage_path TEXT NOT NULL,              -- Supabase storage path
  public_url TEXT,                         -- Erişim URL'i; is_public=false ise NULL (/d/[id] proxy kullanılır)
  file_size_bytes BIGINT NOT NULL,         -- Bayt cinsinden dosya boyutu
  is_public BOOLEAN DEFAULT false,
  uploaded_by UUID NOT NULL REFERENCES public.user_profiles(id),
  team_id VARCHAR(50) DEFAULT 'horuseye-team',
  blurred_pages INTEGER[],                 -- PDF'de bulanıklaştırılacak sayfa numaraları (bkz. §2.6)
  document_date DATE,                      -- Kullanıcının belirlediği belge tarihi (bkz. §2.7)
  sort_order INTEGER DEFAULT NULL,         -- Admin manuel sıralama; NULL ise sort_order NULLS LAST (bkz. §2.7)
  metadata JSONB DEFAULT '{}'::jsonb,
    -- metadata örnek: {"category": "reports", "description": "...", "slug": "proje-teklifi"}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL      -- Soft delete
);

-- Index'ler
CREATE INDEX idx_files_is_public ON public.files(is_public) WHERE deleted_at IS NULL;
CREATE INDEX idx_files_team ON public.files(team_id);
CREATE INDEX idx_files_slug ON public.files((metadata->>'slug'));

-- RLS
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_files_readable_by_all" ON public.files
  FOR SELECT USING (is_public = true AND deleted_at IS NULL);

CREATE POLICY "admin_full_access" ON public.files
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin')
  );

-- updated_at trigger (PRD-001'den tekrar kullan)
CREATE TRIGGER update_files_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
```

### Supabase Storage Bucket

```
Bucket: horuseye-files
├── public/           → is_public=true dosyaları (CDN cached)
│   └── [uuid]/[filename]
└── private/          → is_public=false dosyaları
    └── [uuid]/[filename]
```

---

## 4. API Routes

```
GET    /api/files              → Dosya listesi (admin only)
POST   /api/files/upload       → Dosya yükle (admin only, multipart)
PUT    /api/files/[id]         → Dosya güncelle (admin only)
DELETE /api/files/[id]         → Soft delete (admin only)
POST   /api/files/[id]/restore → Geri yükle (admin only)
GET    /api/files/trash        → Silinmiş dosyalar (admin only)
POST   /api/files/purge        → 30 günlük soft-deleted dosyaları kalıcı sil (admin veya x-cron-secret header)
```

**Bildirim:** Dosya yüklendiğinde `createNotification()` ile tüm supervisor'lara bildirim gönderilir (PRD-016 §6.1).

**Kullanılan ApiErrorCode'lar:** `FILE_NOT_FOUND`, `FILE_TOO_LARGE`, `FILE_INVALID_TYPE`, `FILE_UPLOAD_FAILED`, `AUTH_FORBIDDEN`

### 4.1 Otomatik Temizlik (Auto-Purge)

`POST /api/files/purge` endpoint'i 30 günden eski soft-deleted dosyaları kalıcı olarak siler:
1. `deleted_at` < now() - 30 gün olan dosyaları bulur
2. Supabase Storage'dan fiziksel dosyayı siler
3. DB'den hard-delete yapar
4. Her silme işlemini `file.delete` event'i olarak loglar

**Erişim:** Admin oturumu veya `x-cron-secret` header'ı (CRON_SECRET env var ile).
**Cron:** Supabase Pro+ ortamlarında `pg_cron` ile günlük 03:00'te çalıştırılabilir.

**Purge endpoint güvenliği:**
- Admin oturumu ile: normal auth middleware
- Cron job ile: `x-cron-secret` header'ı = `CRON_SECRET` env var (SSM'de saklanır)
- `CRON_SECRET` GitHub Actions'da secret olarak tanımlıdır
- Her iki auth yöntemi de geçerlidir, en az biri gereklidir

---

## 5. Hata Yönetimi

| Durum | Kullanıcıya | Log |
|-------|------------|-----|
| Dosya çok büyük | "Maksimum dosya boyutu 50MB" | warn |
| Desteklenmeyen format | "Bu dosya tipi desteklenmiyor" | warn |
| Upload başarısız | "Yükleme başarısız. Tekrar deneyin." | error + Sentry |
| Storage quota aşıldı | "Depolama alanı dolu. Lütfen eski dosyaları silin." | error + Sentry |

**Dev mode:** Upload hatasında tam Supabase error kodu + mesajı gösterilir.

---

## 6. Loglanan Olaylar

| Olay | Tip | Severity |
|------|-----|----------|
| Dosya yüklendi | file.upload | info |
| Dosya güncellendi | file.update | info |
| Dosya silindi | file.delete | warn |
| Dosya geri yüklendi | file.restore | info |
| Public toggle değişti | file.update | info |

---

## 7. Test Senaryoları

- [ ] PDF yüklenir → listede görünür, public false
- [ ] Public toggle açılır → public alanda görünür
- [ ] 51MB dosya yüklenir → hata mesajı
- [ ] Dosya silinir → public alanda kaybolur, çöp kutusunda görünür
- [ ] Soft delete sonrası geri yüklenir → tekrar görünür
- [ ] Admin dışı kullanıcı upload endpoint'ini çağırır → 403
