# PRD-003 — Dosya Yönetimi (Team Upload)
**Versiyon:** 1.0  
**Bağımlılıklar:** PRD-000, PRD-001  
**Bloke ettiği:** PRD-002, PRD-004  
**Durum:** AKTIF

---

<!-- INTERFACE_DEPS
AuthUser: @1.0
HorusFile: @1.0
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

### 2.2 Dosya Listesi (Dashboard)
- Tablo görünümü: isim, tip, boyut, tarih, durum (public/private), yükleyen
- Arama + filtre: tip, tarih aralığı, public/private
- Sıralama: tüm kolonlarda
- Pagination: 20 kayıt / sayfa

### 2.3 Dosya Düzenleme
- Display name değiştir
- Kategori değiştir
- Açıklama güncelle
- Public/private toggle (anlık, ayrı kaydet butonu yok)
- Slug otomatik güncellenir (display_name'den türetilir, Türkçe normalize)

### 2.4 Dosya Silme
- Soft delete (deleted_at alanı set edilir)
- Confirm modal: "Bu dosyayı silmek istediğinizden emin misiniz?"
- Silinen dosyalar public alanda anında kaybolur
- Storage'dan fiziksel silme: 30 gün sonra scheduled job ile
- Admin silinen dosyaları "Çöp Kutusu" görünümünde görebilir, geri yükleyebilir

### 2.5 Dosya Kategorileri
Sabit kategoriler (metadata.category):
- `reports` — Raporlar (Proposal, Analysis, Design vb.)
- `presentations` — Sunumlar
- `documents` — Genel dokümanlar
- `other` — Diğer

---

## 3. Veritabanı

```sql
CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,           -- Orijinal dosya adı
  display_name VARCHAR(255) NOT NULL,   -- Gösterilen isim
  file_type VARCHAR(20) NOT NULL
    CHECK (file_type IN ('pdf','pptx','docx','image','video','other')),
  storage_path TEXT NOT NULL,           -- Supabase storage path
  public_url TEXT NOT NULL,             -- Erişim URL'i
  file_size_bytes BIGINT NOT NULL,
  is_public BOOLEAN DEFAULT false,
  uploaded_by UUID NOT NULL REFERENCES public.user_profiles(id),
  team_id VARCHAR(50) DEFAULT 'horuseye-team',
  metadata JSONB DEFAULT '{}'::jsonb,
    -- metadata örnek: {"category": "reports", "description": "...", "slug": "proje-teklifi"}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
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
```

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
