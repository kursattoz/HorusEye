# PRD-005 — CI/CD Pipeline & Repo Yapısı
**Versiyon:** 2.0
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

**Altyapı:** AWS ECS Fargate + ECR + ALB. Domain: `horuseye.app`.

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

## 5. Deploy Mimarisi

```
                    ┌─────────────────────────────┐
                    │        Route53               │
                    │  horuseye.app                │
                    │  staging.horuseye.app        │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │     ALB + ACM (HTTPS)        │
                    │     :443 → :3000             │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │   ECS Fargate Cluster        │
                    │   Next.js Container          │
                    │   (0.25 vCPU, 512 MB)        │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
         Supabase         SSM Params      CloudWatch
         (DB/Auth)        (Secrets)        (Logs)
```

**Container:** Next.js `output: 'standalone'` ile multi-stage Docker build.
**Altyapı kodu:** `infra/` dizininde AWS CDK (TypeScript) ile tanımlı.

### CDK Stack'ler

| Stack | İçerik |
|-------|--------|
| `HorusEye-Network` | VPC (2 AZ, public + private subnet, NAT yok) |
| `HorusEye-Registry` | ECR repo (`horuseye/portal`) |
| `HorusEye-Staging` | ECS Fargate + ALB + ACM + Route53 (1 task) |
| `HorusEye-Production` | ECS Fargate + ALB + ACM + Route53 (2 task) |

---

## 6. GitHub Actions Workflow

### 6.1 CI — PR Açılınca (develop veya main'e)

CI pipeline 5 ayrı job'dan oluşur (paralel çalışır, build en sona):

```yaml
# .github/workflows/ci.yml (gerçek implementasyon)
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  validate:          # PRD interface version check (en hızlı, ilk çalışır)
  lint-typecheck:    # eslint + tsc --noEmit (validate sonrası)
  test:              # Vitest unit+integration, local Supabase Docker (lint sonrası)
  e2e:               # Playwright Chromium + Mobile Chrome (lint sonrası, test ile paralel)
  build:             # npm run build (test + e2e sonrası)
```

### 6.2 Staging Deploy — develop'a merge olunca

```yaml
# .github/workflows/staging.yml
name: Deploy — Staging
on:
  push:
    branches: [develop]

permissions:
  id-token: write   # GitHub OIDC → AWS IAM Role
  contents: read

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
      - name: Apply DB migrations
        run: supabase link && supabase db push
      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
      - name: Login to ECR
        uses: aws-actions/amazon-ecr-login@v2
      - name: Build & push Docker image
        run: docker build + push (sha + latest tag)
      - name: Deploy to ECS
        run: aws ecs update-service --force-new-deployment
```

### 6.3 Production Deploy — main'e merge olunca

```yaml
# .github/workflows/production.yml
name: Deploy — Production
on:
  push:
    branches: [main]

jobs:
  deploy-production:
    environment: production   # GitHub'da manuel onay gerektirir
    steps:
      # Staging ile aynı akış, production secrets ile
```

**Auth:** GitHub OIDC → IAM Role (uzun ömürlü AWS key yok).

---

## 7. Ortam Yapısı

| Ortam | Branch | Supabase | URL | DB |
|-------|--------|----------|-----|-----|
| Local | feature/* | Docker local | localhost:3000 | Local Docker |
| Staging | develop | Supabase staging project | staging.horuseye.app | Staging DB |
| Production | main | Supabase prod project | horuseye.app | Prod DB |

**Her ortamın ayrı Supabase projesi var.**
Staging verisi production'a geçmez, tam izolasyon.

---

## 8. GitHub Secrets

```
# AWS
AWS_DEPLOY_ROLE_ARN              # GitHub OIDC → IAM Role ARN

# Tüm ortamlar
SUPABASE_ACCESS_TOKEN            # Personal access token

# Staging
STAGING_PROJECT_ID
STAGING_DB_PASSWORD
STAGING_SUPABASE_URL
STAGING_SUPABASE_ANON_KEY
STAGING_SUPABASE_SERVICE_ROLE_KEY

# Production
PROD_PROJECT_ID
PROD_DB_PASSWORD
PROD_SUPABASE_URL
PROD_SUPABASE_ANON_KEY
PROD_SUPABASE_SERVICE_ROLE_KEY

# Sentry (PRD-006)
SENTRY_AUTH_TOKEN
NEXT_PUBLIC_SENTRY_DSN
```

---

## 9. AWS Manuel Kurulum (Bir Kez)

Bu adımlar CDK deploy öncesi AWS Console/CLI ile yapılır:

1. **Route53:** `horuseye.app` hosted zone oluştur → registrar'da NS kayıtlarını güncelle
2. **IAM OIDC Provider:** GitHub Actions için OIDC identity provider oluştur
3. **IAM Role:** `GitHubActionsDeployRole` — ECR push + ECS deploy + SSM read yetkileri
4. **SSM Parameter Store:** Her ortam için secret'ları gir (`/horuseye/staging/*`, `/horuseye/production/*`)
5. **CDK Bootstrap:** `cd infra && cdk bootstrap`
6. **CDK Deploy:** `cdk deploy --all`

---

## 10. Repo Klasör Yapısı

```
horuseye/
├── .github/
│   └── workflows/
│       ├── ci.yml              → CI pipeline (lint, test, build)
│       ├── staging.yml         → ECR push + ECS deploy (develop)
│       └── production.yml      → ECR push + ECS deploy (main)
├── portal/
│   ├── Dockerfile              → Multi-stage Next.js container
│   ├── .dockerignore
│   ├── app/
│   │   ├── (public)/           → Guest erişimli sayfalar
│   │   ├── (protected)/        → Auth gerektiren sayfalar
│   │   └── api/
│   │       └── health/         → ALB health check endpoint
│   ├── components/
│   ├── lib/
│   ├── supabase/
│   │   ├── migrations/         → Tüm DB migration'ları
│   │   └── seed.sql            → Test verisi
│   ├── public/
│   └── package.json
├── infra/
│   ├── bin/infra.ts            → CDK app entry
│   ├── lib/
│   │   ├── network-stack.ts    → VPC
│   │   ├── registry-stack.ts   → ECR
│   │   └── service-stack.ts    → ECS + ALB + ACM + Route53
│   ├── cdk.json
│   ├── package.json
│   └── tsconfig.json
├── PRD/
└── package.json
```

---

## 11. Code Review Checklist (PR Template)

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
- [ ] Docker build başarılı (infra değişikliğinde)

## Breaking Change var mı?
- [ ] Evet → PRD-000 güncellendi
- [ ] Hayır
```
