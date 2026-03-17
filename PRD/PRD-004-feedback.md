# PRD-004 — Feedback Sistemi
**Versiyon:** 1.0  
**Bağımlılıklar:** PRD-000, PRD-001, PRD-003  
**Bloke ettiği:** —  
**Durum:** AKTIF

---

<!-- INTERFACE_DEPS
AuthUser: @1.0
HorusFile: @1.0
Feedback: @1.0
-->

## ⚠️ LLM TALİMATI
Feedback interface'i PRD-000 Section 3.4'te tanımlıdır.
Bu PRD `public.files` tablosuna yazmaz, sadece `feedback.file_id` FK ile referans alır.
Interface bağımlılıkları INTERFACE_DEPS bloğunda declare edilmiştir.
PRD-000'daki version değişirse bu bloğu güncelle, yoksa `validate:prd` script'i fail eder.

---

## 1. Amaç

Hocaların (Supervisor) yüklenen dosyalar hakkında genel ve inline yorum yapabilmesi.
Ekibin (Admin) bu yorumları takip edebilmesi.
Tüm yorumlar audit trail ile korunur — hiçbir yorum fiziksel olarak silinmez.

---

## 2. Fonksiyonel Gereksinimler

### 2.1 Yetki Matrisi

| Eylem | Admin | Supervisor | Assistant | Guest |
|-------|-------|-----------|-----------|-------|
| Yorumları görüntüle | ✓ | ✓ | ✓ | ✓ |
| Genel yorum yaz | ✓ | ✓ | ✗ | ✗ |
| Inline yorum yaz | ✓ | ✓ | ✗ | ✗ |
| Kendi yorumunu düzenle | ✓ | ✓ | ✗ | ✗ |
| Yorumu resolved işaretle | ✓ | ✗ | ✗ | ✗ |
| Herhangi yorumu sil | ✓ | ✗ | ✗ | ✗ |

### 2.2 Genel Yorum
- Dosya görüntüleyicinin altında yorum kutusu
- Markdown destekli (bold, italic, link, code)
- Max 2000 karakter
- Submit sonrası liste anında güncellenir (optimistic update)
- Yorum listesi: avatar + isim + tarih + içerik + resolved rozeti

### 2.3 Inline Yorum (Annotation)
- PDF ve DOCX görüntüleyicide satır/paragraf seçilebilir
- Seçim sonrası tooltip: "Yorum ekle" butonu
- `line_ref`: seçilen satır numarası (sayfa:satır formatı, örn: "2:15")
- Inline yorumlar sağ kenarda sidebar'da listelenir
- Tıklanınca ilgili satıra scroll edilir

### 2.4 Resolved Sistemi
- Admin yorumu "Çözüldü" olarak işaretleyebilir
- Çözülen yorumlar default gizlenir, "Çözülenleri göster" toggle ile açılır
- Resolved yorumda kim/ne zaman çözdüğü gösterilir

---

## 3. Veritabanı

```sql
CREATE TABLE public.feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.user_profiles(id),
  feedback_type VARCHAR(10) NOT NULL
    CHECK (feedback_type IN ('general', 'inline')),
  content TEXT NOT NULL CHECK (char_length(content) <= 2000),
  line_ref VARCHAR(20),        -- "page:line" format, nullable
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES public.user_profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
  -- NOT: fiziksel DELETE yok. Soft delete de yok.
  -- Admin "siler" ama kayıt kalır, is_hidden=true olur.
);

ALTER TABLE public.feedbacks ADD COLUMN is_hidden BOOLEAN DEFAULT false;

-- RLS
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_read_visible_feedback" ON public.feedbacks
  FOR SELECT USING (is_hidden = false);

CREATE POLICY "auth_users_can_insert" ON public.feedbacks
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid()
            AND role IN ('admin', 'supervisor'))
  );

CREATE POLICY "authors_can_update_own" ON public.feedbacks
  FOR UPDATE USING (author_id = auth.uid());

CREATE POLICY "admin_full_access" ON public.feedbacks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles
            WHERE id = auth.uid() AND role = 'admin')
  );
```

---

## 4. API Routes

```
GET    /api/feedback?file_id=[id]     → Dosyanın yorumları (public erişim)
POST   /api/feedback                  → Yorum ekle (supervisor/admin)
PUT    /api/feedback/[id]             → Yorum güncelle (kendi yorumu)
POST   /api/feedback/[id]/resolve     → Resolved işaretle (admin)
DELETE /api/feedback/[id]             → Soft hide (admin)
```

---

## 5. Hata Yönetimi

| Durum | Gösterim | Log |
|-------|---------|-----|
| Yorum gönderilemedi | "Yorum kaydedilemedi. Tekrar deneyin." | error + Sentry |
| 2000 karakter aşımı | Karakter sayacı kırmızı, gönder butonu disabled | warn |
| Yetkisiz yorum girişimi | 403 + "Yorum yazmak için giriş yapın" | warn |

---

## 6. Loglanan Olaylar

| Olay | Tip | Severity |
|------|-----|----------|
| Yorum yazıldı | feedback.create | info |
| Yorum güncellendi | feedback.update | info |
| Yorum gizlendi | feedback.delete | warn |
| Resolved işaretlendi | feedback.update | info |

---

## 7. Test Senaryoları

- [ ] Supervisor yorum yazar → görünür
- [ ] Guest yorum kutusunu görür ama submit edemez
- [ ] Admin yorumu resolved işaretler → gizlenir (toggle ile açılır)
- [ ] 2001 karakter yazılır → gönder disabled
- [ ] Inline: PDF'de satır seçilir → tooltip görünür → yorum eklenir → sidebar'da görünür
