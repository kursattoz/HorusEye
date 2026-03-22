# HorusEye PRD Sistemi — LLM Kullanım Rehberi

<!-- INTERFACE_DEPS
-->

> **Bu dosyayı session'in basinda LLM'e ver.** LLM, hangi PRD'ye ihtiyaci oldugunu sana soyleyecek. Tum PRD'leri birden gonderme. Sadece istenen PRD'leri gonder.

> **Guncelleme politikasi:** Bu dosya PRD icerigi degistiginde guncellenmez. Sadece yeni PRD eklenir/silinirse veya bagimlilk agaci degisirse guncellenir. Satir sayilari ve bolum numaralari bilerek dahil edilmemistir — PRD icerik degisikliklerine karsi dayaniklidir.

---

## Sistem Nedir?

HorusEye bir **AI-tabanli sinav gozetim sistemi**dir. 17 PRD dokumani ile yonetilir. Her PRD belirli bir modulun tam spesifikasyonunu icerir: veritabani semasi, API route'lari, UI davranislari, hata yonetimi, test senaryolari.

**Tech stack:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase (Postgres, Auth, Storage, RLS) + AWS ECS Fargate

---

## PRD Haritasi

### Ana Referans
| PRD | Icerik | Ne Zaman Gerekir |
|-----|--------|-------------------|
| **PRD-000** | Master matris, interface contract'lar, sistem sozlugu, DB sema agaci, API route haritasi, env var'lar, hata kodu standardi | **Her zaman.** Tum type tanimlari, enum degerleri, tablo sahiplikleri burada. |

### Faz 0-1 — Portal (mevcut, implemente)
| PRD | Icerik | Ne Zaman Gerekir |
|-----|--------|-------------------|
| **PRD-001** | Auth, login, RBAC, session, force password change | Kullanici yonetimi, login, yetkilendirme |
| **PRD-002** | Public dokuman alani, PDF/DOCX/PPTX viewer, blur sayfalar | Herkese acik sayfa, dosya goruntuleme |
| **PRD-003** | Dosya yonetimi, upload, soft delete, sort, document_date | Dosya CRUD, storage bucket, upload dialog |
| **PRD-004** | Feedback sistemi, inline annotation, resolved workflow | Yorum sistemi, inline secim, markdown render |
| **PRD-005** | CI/CD pipeline, GitHub Actions, Docker, CDK deploy | Deploy, pipeline, branch stratejisi |
| **PRD-006** | Error management, audit_logs, error_logs, Sentry | Loglama, hata yakalama, severity |
| **PRD-007** | System monitor dashboard (/dev/monitor) | Health check, servis durumu, admin monitoring |
| **PRD-008** | PWA, service worker, offline, responsive breakpoint | Offline davranis, mobil layout, cache |
| **PRD-009** | UI design system, shadcn/ui, renk token, tipografi, dark mode | Herhangi bir UI bileseni, tema, renk, ikon |
| **PRD-010** | Settings sayfasi, profil, tema, kullanici yonetimi, SMTP tab | Ayarlar sayfasi, kullanici CRUD |
| **PRD-011** | Test stratejisi, Vitest, Playwright, coverage threshold | Test yazma, CI test pipeline |
| **PRD-012** | Folder yapisi, import kurallari, dosya adlandirma | Yeni dosya/klasor olusturma, code conventions |
| **PRD-014** | E-posta, SMTP, OTP dogrulama, email template'ler | Email gonderme, OTP, public feedback gate |
| **PRD-015** | Raporlar & teslim edilebilirler, checklist sistemi | Deliverable CRUD, checklist, deadline |
| **PRD-016** | Bildirim merkezi, notification trigger'lari, realtime | Bildirim gonderme, NotificationBell, trigger |

### Faz 2 — Kamera & AI (henuz implemente edilmedi)
| PRD | Icerik | Ne Zaman Gerekir |
|-----|--------|-------------------|
| **PRD-013** | Kamera modulu, AI pipeline, sinav yonetimi, incident, raporlama, performans, altyapi | Kamera, YOLOv8, MediaPipe, sinav, gozetmen, dashboard, AI servis |
| **PRD-017** | Veri seti stratejisi, dataset pipeline, harici veri kaynaklari, egitim pipeline, augmentation | Dataset indirme, format donusum, veri temizleme, fine-tune egitim |

---

## LLM'e Talimatlar

Asagidaki kurallari bu session boyunca uygula:

### Kural 1: PRD Isteme Protokolu
Kullanici sana bir gorev verdiginde:
1. Once bu rehberdeki PRD haritasina bak
2. Hangi PRD'lere ihtiyacin oldugunu belirle
3. Kullanicidan **sadece gerekli PRD'leri** iste: "Bu gorev icin PRD-004 ve PRD-014'e ihtiyacim var, gonderir misin?"
4. **Tum PRD'leri birden isteme** — context window'u gereksiz doldurur
5. PRD-000'i her zaman iste — interface tanimlari ve API haritasi orada

> **UYARI:** PRD-000 bir **index ve referans dokumanidir**, modul spesifikasyonu degildir. PRD-000'daki interface tanimlari, tech stack tablosu veya API route listesinden modul-spesifik sorulara cevap VERME. Bu bilgiler ozet niteligindedir ve detayli mimari, pipeline, algoritma, config, test stratejisi gibi bilgileri icermez. Module ait soruyu cevaplamak icin o modulun PRD'sini iste. Ornek: "AI kamera sistemi nasil calisiyor?" sorusu icin PRD-000'dan cevap verme, PRD-013'u iste.

### Kural 2: Bagimlilik Zinciri
Bir PRD istediginde, o PRD'nin bagimliligini da dikkate al. Bagimlilik agaci:
```
PRD-000 (her zaman)
+-- PRD-001 (Auth) -> PRD-002, PRD-003, PRD-004, PRD-007, PRD-010, PRD-016
|   +-- PRD-003 (Files) -> PRD-004, PRD-015
|   +-- PRD-004 (Feedback) -> PRD-014 (OTP email)
|   +-- PRD-010 (Settings) -> PRD-009, PRD-014
|   +-- PRD-016 (Notifications) -> tum moduller tarafindan tetiklenir
+-- PRD-005 (CI/CD) -> PRD-011 (Testing)
+-- PRD-006 (Logging) -> PRD-007 (Monitor)
+-- PRD-009 (UI) -> tum frontend PRD'ler
+-- PRD-013 (Camera AI) -> PRD-001, PRD-006, PRD-007, PRD-016, PRD-017
|   +-- PRD-017 (Dataset Pipeline) -> PRD-013
+-- PRD-014 (Email) -> PRD-004, PRD-010, PRD-015
```

Not: Bagimliliklarin hepsini istemen gerekmiyor. Sadece gorevle dogrudan ilgili olanlari iste. Ornegin feedback sistemi icin PRD-004 yeterli, PRD-001'i (Auth) istemen gerekmez — auth zaten implemente.

### Kural 3: Gorev -> PRD Eslestirme Tablosu
| Gorev Tipi | Gereken PRD'ler |
|------------|----------------|
| **Login/auth degisikligi** | PRD-000, PRD-001 |
| **Yeni API route** | PRD-000 (route haritasi), ilgili modul PRD'si |
| **Dosya upload/goruntuleme** | PRD-000, PRD-003, PRD-002 |
| **Feedback sistemi** | PRD-000, PRD-004, PRD-014 (OTP varsa) |
| **Email gonderme** | PRD-000, PRD-014 |
| **Bildirim ekleme** | PRD-000, PRD-016 + tetikleyici modulun PRD'si |
| **UI bileseni** | PRD-009, ilgili sayfa PRD'si |
| **Tema/dark mode** | PRD-009 |
| **Yeni sayfa olusturma** | PRD-012 (folder), PRD-009 (UI), sayfa modulunun PRD'si |
| **Settings sayfasi** | PRD-000, PRD-010, PRD-009 |
| **Test yazma** | PRD-011 + test edilen modulun PRD'si |
| **Deploy/CI sorun** | PRD-005 |
| **Health check / monitoring** | PRD-007, PRD-006 |
| **PWA / offline** | PRD-008 |
| **Rapor / deliverable** | PRD-000, PRD-015 |
| **Kamera / AI / sinav** | PRD-000, PRD-013 (buyuk — belirli bolum numarasi iste) |
| **Dataset / egitim verisi** | PRD-000, PRD-017 (+ PRD-013 §14 genel strateji) |
| **DB migration** | PRD-000 (sema bolumu), ilgili modul PRD'si |
| **Env var ekleme** | PRD-000 (env var bolumu), PRD-005 (CDK) |
| **Hata yonetimi** | PRD-006, PRD-000 (ApiErrorCode bolumu) |

### Kural 4: PRD-013 Ozel Kurali
PRD-013 cok buyuk bir dosyadir (~4500+ satir). Tamamini isteme. Kullaniciya hangi bolumu istedigini soyle:

| PRD-013 Bolum | Konu |
|---------------|------|
| Bolum 1-3 | Mimari, pipeline, frame processing, kalibrasyon |
| Bolum 4-5 | Teknoloji kararlari, ogrenci yonetimi |
| Bolum 6 | Sinav yonetimi (wizard, checkout, yerlestirme) |
| Bolum 7-8 | Incident yonetimi, proctor bildirimleri |
| Bolum 9 | Multi-kamera fuzyon (Phase B) |
| Bolum 10-11 | Dashboard sayfalari, API route haritasi |
| Bolum 12-14 | AI servis, test stratejisi, model yonetimi |
| Bolum 15-16 | Canli izleme, overlay, ortam degiskenleri |
| Bolum 17 | Performans, FPS, darbogaz, demo checklist |
| Bolum 18 | **Altyapi, Redis, config master, state machine, SLA** |
| Bolum 19-21 | Implementation fazlari, key files, evidence |
| Bolum 22 | Raporlama & analitik |
| Bolum 23-25 | Proctor is akisi, privacy, changelog |

### Kural 5: Interface Contract Sistemi
- Tum paylasilan tipler PRD-000'in 3. bolumunde tanimlidir (14 interface)
- Her PRD, kullandigi interface versiyonlarini `INTERFACE_DEPS` blogunda bildirir
- Bir interface degistiginde: PRD-000'da versiyon artir -> tum bagimli PRD'lerde INTERFACE_DEPS guncelle
- Validasyon: `npm run validate:prd`

### Kural 6: Ne Zaman PRD Istemene Gerek Yok
- Sadece mevcut kodu okuyup anlaman gerekiyorsa -> kodu oku, PRD'ye gerek yok
- Basit bug fix (typo, CSS duzeltme) -> PRD'ye gerek yok
- Git/deploy sorusu -> CLAUDE.md yeterli

### Kural 7: Hata Kodu Standardi
Tum API route'lar PRD-000'daki `ApiErrorCode` enum'unu kullanir. Yeni error code eklemen gerekirse PRD-000'a ekle.

---

## Ornek Session Akisi

```
Kullanici: "Feedback sistemine dosya eki destegi eklemek istiyorum"

LLM: "Bu gorev icin su PRD'lere ihtiyacim var:
  1. PRD-000 (interface tanimlari ve API haritasi)
  2. PRD-004 (feedback sistemi detaylari)
  3. PRD-003 (dosya storage yapisi — ek dosya Supabase'e nasil yuklenecek)
  Gonderir misin?"

Kullanici: [PRD-000, PRD-004, PRD-003 gonderir]

LLM: [PRD'leri okur, implementasyon plani yapar]
LLM: "Ayrica email bildirimini guncellemem gerekecek. PRD-014'u de alabilir miyim?"

Kullanici: [PRD-014 gonderir]

LLM: [Tam implementasyon yapar]
```

---

## Bu Dosya Ne Zaman Guncellenir?

| Durum | Guncelleme Gerekir mi? |
|-------|----------------------|
| PRD iceriginde degisiklik (yeni ozellik, bug fix) | **Hayir** — bu rehber icerik detaylarindan bagimsizdir |
| Interface versiyonu degisti | **Hayir** — LLM zaten PRD-000'dan guncel versiyonu okur |
| Yeni PRD eklendi veya silindi | **Evet** — PRD haritasina yeni satir ekle/cikar |
| Bagimlilik agaci degisti | **Evet** — Kural 2'deki agaci guncelle |
| PRD-013'e yeni ana bolum eklendi | **Evet** — Kural 4'teki tabloyu guncelle |
| Gorev -> PRD eslestirmesi degisti | **Evet** — Kural 3'u guncelle |
