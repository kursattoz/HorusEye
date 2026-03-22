# PRD-002 — Public Dokümantasyon Alanı
**Versiyon:** 1.0  
**Bağımlılıklar:** PRD-000, PRD-001  
**Bloke ettiği:** PRD-008 (PWA offline cache bu sayfayı cacheler)  
**Durum:** AKTIF

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
HorusFile: @1.4
Feedback: @1.1
-->

## ⚠️ LLM TALİMATI
Bu PRD HorusFile interface'ini PRD-000 Section 3.2'den okur.
Feedback bileşeni PRD-004'ten gelir. Bu PRD dosya veritabanına yazmaz, sadece okur.
Interface bağımlılıkları INTERFACE_DEPS bloğunda declare edilmiştir.
PRD-000'daki version değişirse bu bloğu güncelle, yoksa `validate:prd` script'i fail eder.

---

## 1. Amaç

Ana sayfanın sol panelinde, login gerektirmeden herkese açık olan dokümantasyon alanı.
Hocalar (%90 ihtimalle) sadece bu alana erişecek — login bile olmayacaklar.
Bu alan HorusEye'ın vitrini ve proje belgelerinin deposudur.

---

## 2. Sayfa Yapısı (`/` root)

```
┌─────────────────────────────────────────────────┐
│  [HorusEye Logo]              [Login Butonu →]  │
├──────────────────┬──────────────────────────────┤
│                  │                              │
│  PUBLIC DOCS     │   DOKÜMAN İÇERİĞİ            │
│  (Sol Panel)     │   (Sağ Ana Alan)             │
│                  │                              │
│  📁 Raporlar     │   Seçilen dosya burada       │
│    📄 Proje...   │   görüntülenir               │
│    📄 Analiz...  │                              │
│    📄 Tasarım... │   PDF → embed viewer         │
│                  │   PPTX → slide viewer        │
│  📁 Sunumlar     │   DOCX → rendered HTML       │
│    📄 ...        │   Image → direkt göster      │
│                  │                              │
│  📁 Diğer        │   [Feedback bölümü]          │
│                  │   (PRD-004'ten gelir,        │
│                  │    sadece auth users yazar)  │
└──────────────────┴──────────────────────────────┘
```

**Mobil layout:** Sol panel drawer/bottom sheet'e geçer.
Sağ alan tam ekran olur, üstte hamburger menu ile panel açılır.

---

## 3. Fonksiyonel Gereksinimler

### 3.1 Sol Panel (Dosya Listesi)
- Public olarak işaretlenmiş dosyaları listeler (PRD-003'ten gelir)
- Klasör yapısı: `file_category` alanına göre gruplar
- Her dosya kartında: ikon (dosya tipine göre), isim, tarih, boyut
- Arama: anlık filtreleme (client-side)
- Sıralama: tarihe göre (yeni → eski default)
- Dosya tipi filtresi: Hepsi / PDF / PPTX / Diğer
- Seçili dosya highlight edilir
- Dosya yoksa: "Henüz yayınlanmış doküman bulunmuyor." mesajı

### 3.2 Sağ Alan (Doküman Görüntüleyici)
Sayfa ilk açıldığında: karşılama mesajı + proje açıklaması

Dosya seçildiğinde türe göre görüntüleme:

**PDF:** `react-pdf` tabanlı sayfa sayfa görüntüleme (PdfViewer bileşeni).
- Sayfa navigasyonu: önceki/sonraki butonları + klavye ok tuşları (ArrowLeft/Right/Up/Down)

**PDF render hatası:** react-pdf yükleme/render başarısız olursa:
- Hata mesajı: 'PDF görüntülenemiyor'
- Direkt download linki gösterilir (`/d/[id]` proxy route)
- Retry butonu: sayfayı yeniden yükler
- `error_logs`'a kaydedilir (severity: warn)

- Blur desteği: `blurred_pages` array'indeki sayfalar `backdrop-filter: blur(12px)` overlay ile gizlenir (pointer-events-none)
- Sayfa sayacı: "Page X of Y"
Fallback: "PDF görüntülenemiyor" + direkt download linki.

**Blur overlay davranışı:** `blurred_pages` dizisindeki sayfa numaraları kontrol edilir. Kullanıcı o sayfaya navigate ettiğinde `backdrop-filter: blur(12px)` overlay tam sayfa kaplar + `pointer-events: none`. Sayfa geçişlerinde overlay anında uygulanır/kaldırılır (no flash).

**PPTX:** `react-pptx` veya Google Docs Viewer embed.
`https://docs.google.com/viewer?url={file_url}&embedded=true`

**DOCX:** Mammoth.js ile HTML'e çevir, render et.

**DOCX render sınırlaması:** Mammoth.js CSS stillerinin çoğunu strip eder. Başlık hiyerarşisi (h1-h6) korunur, bold/italic korunur, tablolar basitleştirilir. Karmaşık layout'lu DOCX'ler bozuk görünebilir — bu kabul edilir. Alternatif: Google Docs Viewer iframe (online gerektirir).

**Image:** `<img>` tag, lightbox ile büyüt.

**Diğer:** Dosya bilgisi göster + download butonu.

### 3.3 Doküman URL'leri
Her dokümanın kalıcı URL'si vardır: `/docs/[file-slug]`
Bu URL paylaşılabilir. Sayfaya direkt girildiğinde o dosya seçili açılır.
Slug: dosya adından türetilir, Türkçe karakter normalize edilir.

**Slug oluşturma:** `display_name` → slug dönüşümü:
- Kütüphane: `slugify` (`npm install slugify`) + `locale: 'tr'`
- Türkçe karakter: ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u
- Boşluk → `-`, özel karakterler kaldırılır, lowercase
- Çakışma: aynı slug varsa → `slug-2`, `slug-3` (suffix eklenir)
- Slug `files.name` alanında saklanır

### 3.4 Feedback Bölümü (PRD-004 bileşeni)
Doküman görüntüleyicinin altında feedback alanı bulunur.
- **Guest:** Yorumları okuyabilir, yazamaz. "Yorum yazmak için giriş yapın" linki gösterilir.
- **Supervisor/Admin:** Yorum yazabilir, inline annotation ekleyebilir.
- **Assistant:** Yorumları okuyabilir, yazamaz.

**Feedback kaynakları:** Public dokümantasyon sayfasında iki tür feedback görüntülenir:
- **Authenticated feedback** (`feedbacks` tablosu, PRD-004): Supervisor/Admin yorumları
- **Public feedback** (`public_feedback` tablosu, PRD-014): OTP ile doğrulanmış misafir yorumları
Her iki tablo birleştirilerek zaman sırasına göre gösterilir. Public feedback'ler 'Misafir' etiketi ile ayırt edilir.

### 3.5 Download
Her dosyanın yanında download ikonu. Herkese açık (auth gerekmez).
Download eventi loglanır (PRD-006: file.download, user_id null ise guest).

**Guest download takibi:** Guest kullanıcının kimliği bilinmez. `audit_logs`'a yazılırken:
- `user_id`: null
- `session_id`: `crypto.randomUUID()` (tarayıcı session'ı, sessionStorage'da tutulur)
- `ip_address`: request header'dan
- `user_agent`: request header'dan

---

## 4. Non-Fonksiyonel Gereksinimler

- İlk sayfa yükleme: < 1.5s (LCP)
- Dosya listesi: < 300ms (Supabase cached query)
- PDF görüntüleme: iframe load, kullanıcıya loading indicator gösterilir
- PWA offline (PRD-008): public dosyalar ve dosya listesi cache'lenir
  - Offline'da "Bu içerik çevrimdışı görüntüleniyor" banner gösterilir
  - Yeni dosyalar online olunca sync edilir

---

## 5. Veritabanı

Bu PRD kendi tablosu oluşturmaz.
`public.files` tablosunu okur (PRD-003 sahibi).

```sql
-- Bu PRD için gerekli view (okuma optimizasyonu)
CREATE VIEW public.public_files AS
  SELECT
    id, display_name, file_type, public_url,
    storage_path, sort_order, created_at, updated_at,
    metadata->>'category' AS category,
    metadata->>'description' AS description,
    metadata->>'slug' AS slug
  FROM public.files
  WHERE is_public = true
    AND deleted_at IS NULL
  ORDER BY sort_order ASC NULLS LAST, created_at ASC;
  -- sort_order: admin'in belirlediği sıralamaya uy; set edilmemişse tarihe göre

-- RLS: Herkes okuyabilir
ALTER VIEW public.public_files OWNER TO authenticated;
GRANT SELECT ON public.public_files TO anon;
GRANT SELECT ON public.public_files TO authenticated;
```

---

## 6. API Routes

```
GET /api/public/files          → Public dosya listesi (no auth)
GET /api/public/files/[slug]   → Tekil dosya bilgisi (no auth)
GET /api/public/files/[slug]/download → Download URL (no auth, loglanır)
```

---

## 7. Hata Yönetimi

| Durum | Kullanıcıya gösterilen | Loglama |
|-------|----------------------|---------|
| Dosya listesi yüklenemedi | "Dokümanlar yüklenirken hata oluştu. Sayfayı yenileyin." + retry butonu | error_logs + Sentry |
| Dosya görüntülenemiyor | "Bu dosya görüntülenemiyor." + download butonu | warn |
| Slug bulunamadı | 404 sayfası: "Doküman bulunamadı." | info |
| Offline mod | "Çevrimdışısınız. Önbelleğe alınmış içerik gösteriliyor." | — |

**Developer mode (local/staging):**
Hata toast'larında tam hata detayı + stack trace gösterilir.
Production'da sadece kullanıcı dostu mesaj gösterilir.

---

## 8. UI Bileşenleri

```
/components/public/
├── PublicLayout.tsx         → Sol panel + sağ alan layout
├── FileTree.tsx             → Klasörlü dosya listesi
├── FileCard.tsx             → Tekil dosya kartı
├── DocumentViewer.tsx       → Tür bazlı viewer router
├── PdfViewer.tsx            → PDF iframe viewer
├── PptxViewer.tsx           → Google Docs embed
├── DocxViewer.tsx           → Mammoth.js renderer
├── ImageViewer.tsx          → Lightbox
├── FileSearch.tsx           → Client-side arama
└── OfflineBanner.tsx        → PWA offline bildirimi

/app/(public)/
├── page.tsx                 → Ana sayfa
└── docs/[slug]/
    └── page.tsx             → Tekil doküman sayfası
```

---

## 9. SEO & Metadata

```typescript
// Her doküman sayfası için dynamic metadata
export async function generateMetadata({ params }) {
  const file = await getFileBySlug(params.slug);
  return {
    title: `${file.display_name} — HorusEye`,
    description: file.metadata?.description,
    openGraph: { title, description, type: 'article' }
  };
}
```

---

## 10. Loglanan Olaylar (PRD-006)

| Olay | Tip | Severity | Not |
|------|-----|----------|-----|
| Sayfa ziyareti | page.visit | info | user_id null ise guest |
| Dosya görüntüleme | file.view | info | hangi slug |
| Dosya indirme | file.download | info | user_id null ise guest |

---

## 11. Breaking Changes Geçmişi

| Tarih | Değişiklik | Etkilenen PRD |
|-------|-----------|---------------|
| v1.0 | İlk versiyon | — |

---

## 12. Test Senaryoları

- [ ] Login olmadan ana sayfaya girilir → dosya listesi görünür
- [ ] Dosyaya tıklanır → sağ alanda görüntülenir
- [ ] `/docs/proje-teklifi` URL'i direkt girilir → o dosya seçili açılır
- [ ] Geçersiz slug girilir → 404 sayfası
- [ ] Guest yorum bölümüne bakar → okur ama "giriş yap" linki görür
- [ ] Supervisor giriş yapar, yorum yazar → kayıt görünür
- [ ] Offline modda sayfaya girilir → cached içerik + banner
- [ ] Dosya indirilir → audit log'a yazılır
