# PRD-005 — CI/CD Pipeline & Repo Yapısı
**Versiyon:** 1.0  
**Bağımlılıklar:** PRD-000  
**Bloke ettiği:** —  
**Durum:** AKTIF

---

<!-- INTERFACE_DEPS
-->
<!-- PRD-005 uses no shared interfaces from PRD-000. No interface validation needed. -->

## 1. Amaç

Her ekip üyesinin kendi branch'inde geliştirme yapabilmesi,
staging'e otomatik deploy edilmesi, production'a manuel onay ile geçilmesi.
Hiçbir DB migration elle uygulanmaz — her şey Git üzerinden gider.

---

## 2. Branch Stratejisi

```
main (production)
  └── develop (staging)
        └── feature/[isim]   → Her ekip üyesi kendi feature branch'i
        └── fix/[isim]       → Bug fix branch'leri
        └── chore/[isim]     → Config, refactor branch'leri
```

**Kurallar:**
- `main`'e direkt push yasak. Sadece develop'tan PR ile.
- `develop`'a direkt push yasak. Sadece feature branch'ten PR ile.
- Feature branch adı: `feature/PRD-XXX-kisa-aciklama`
- Her PR en az 1 ekip üyesi onayı gerektirir.
- PR açıklamasında hangi PRD etkilendiği yazılır.

---

## 3. Local Geliştirme Kurulumu

Her ekip üyesi şunları kurar:

```bash
# 1. Repo clone
git clone https://github.com/horuseye-team/horuseye-portal.git
cd horuseye-portal

# 2. Dependencies
npm install

# 3. Supabase CLI (Docker gerekli)
npm install -g supabase
supabase start   # Local Supabase başlatır (Docker)

# 4. Environment
cp .env.example .env.local
# .env.local'i local Supabase değerleriyle doldur
# NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
# NEXT_PUBLIC_SUPABASE_ANON_KEY=[supabase start çıktısından]

# 5. Migration uygula
supabase db reset   # Tüm migration'ları sıfırdan uygular

# 6. Dev server
npm run dev   # http://localhost:3000
```

**Her ekip üyesinin local'i tamamen izole çalışır.**
Supabase Docker container'ı kendi veritabanını çalıştırır.
Başka ekip üyesinin geliştirmesi local'i etkilemez.

---

## 4. Migration Yönetimi

```bash
# Yeni tablo/değişiklik için migration oluştur
supabase migration new add_files_table

# Bu komut şunu oluşturur:
# supabase/migrations/20250101120000_add_files_table.sql

# Migration yaz, test et
supabase db reset   # Local'de sıfırdan uygula, test et

# Commit et
git add supabase/migrations/
git commit -m "feat: add files table migration"
```

**Migration kuralları:**
- Migration dosyaları asla değiştirilmez (append-only)
- Geri almak için yeni migration yaz
- Migration adı: `[timestamp]_[açıklama].sql`

---

## 5. GitHub Actions Workflow

### 5.1 CI — PR Açılınca (develop veya main'e)

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [develop, main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci

      # ── PRD Interface Validation (runs first — fastest check) ──
      - name: Validate PRD interface dependencies
        run: npm run validate:prd
        # Fails if any PRD references an outdated interface version from PRD-000.
        # This is the first gate — no point running lint/tests if PRDs are stale.

      # ── Code Quality ──
      - run: npm run lint
      - run: npm run type-check

      # ── Tests ──
      - uses: supabase/setup-cli@v1
      - run: supabase start
      - run: supabase db reset    # Migration'ların temiz uygulandığını test et
      - run: supabase db lint     # SQL lint
      - run: npm run test:coverage
      - run: npm run test:e2e
```

### 5.2 Staging Deploy — develop'a merge olunca

```yaml
# .github/workflows/staging.yml
name: Deploy to Staging
on:
  push:
    branches: [develop]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - name: Apply DB migrations to staging
        run: |
          supabase link --project-ref ${{ secrets.STAGING_PROJECT_ID }}
          supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.STAGING_DB_PASSWORD }}
      - name: Deploy to Vercel (staging)
        run: vercel deploy --token ${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

### 5.3 Production Deploy — main'e merge olunca

```yaml
# .github/workflows/production.yml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy-production:
    runs-on: ubuntu-latest
    environment: production   # GitHub'da manuel onay gerektirir
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - name: Apply DB migrations to production
        run: |
          supabase link --project-ref ${{ secrets.PROD_PROJECT_ID }}
          supabase db push
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
          SUPABASE_DB_PASSWORD: ${{ secrets.PROD_DB_PASSWORD }}
      - name: Deploy to Vercel (production)
        run: vercel deploy --prod --token ${{ secrets.VERCEL_TOKEN }}
```

---

## 6. Ortam Yapısı

| Ortam | Branch | Supabase | Vercel URL | DB |
|-------|--------|----------|------------|-----|
| Local | feature/* | Docker local | localhost:3000 | Local Docker |
| Staging | develop | Supabase staging project | staging.horuseye.vercel.app | Staging DB |
| Production | main | Supabase prod project | horuseye.vercel.app | Prod DB |

**Her ortamın ayrı Supabase projesi var.**
Staging verisi production'a geçmez, tam izolasyon.

---

## 7. GitHub Secrets

```
# Tüm ortamlar
SUPABASE_ACCESS_TOKEN          # Personal access token

# Staging
STAGING_PROJECT_ID
STAGING_DB_PASSWORD

# Production
PROD_PROJECT_ID
PROD_DB_PASSWORD

# Vercel
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID

# Sentry (PRD-006)
SENTRY_AUTH_TOKEN
NEXT_PUBLIC_SENTRY_DSN
```

---

## 8. Repo Klasör Yapısı

```
horuseye-portal/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── staging.yml
│       └── production.yml
├── app/
│   ├── (public)/          → Guest erişimli sayfalar
│   ├── (protected)/       → Auth gerektiren sayfalar
│   └── api/               → API routes
├── components/
│   ├── auth/
│   ├── public/
│   ├── dashboard/
│   └── ui/                → shadcn/ui bileşenleri
├── lib/
│   ├── auth/
│   ├── supabase/
│   ├── logger/            → PRD-006 log sistemi
│   └── utils/
├── supabase/
│   ├── migrations/        → Tüm DB migration'ları
│   └── seed.sql           → Test verisi
├── public/
│   └── sw.js              → PWA service worker (PRD-008)
├── .env.example
├── .env.local             → Git'e commit edilmez
└── package.json
```

---

## 9. Code Review Checklist (PR Template)

```markdown
## Değişiklik Özeti
<!-- Ne değişti, neden -->

## Etkilenen PRD'ler
- [ ] PRD-XXX

## Test Edildi
- [ ] Local'de çalışıyor
- [ ] Lint geçiyor
- [ ] Type check geçiyor
- [ ] Migration temiz uygulanıyor

## Breaking Change var mı?
- [ ] Evet → PRD-000 güncellendi
- [ ] Hayır
```
