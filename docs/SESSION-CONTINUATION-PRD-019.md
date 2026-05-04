# Sonraki Oturum İçin Başlangıç Prompt'u — PRD-019 (Camera Pairing)

> Bu doküman, sohbet penceresini kapatıp yeni bir AI oturumunda devam
> ettiğinde context'i kaybetmemen için yazıldı. Tek mesajda yeni AI'a
> ver; her şeyi tekrar açıklamana gerek kalmaz.

---

## 🎯 Bağlam (kopyala-yapıştır prompt)

Kopyalayıp yeni Claude Code / Claude.ai oturumunda **ilk mesaj** olarak gönder:

```
Selam. HorusEye AI-Based Exam Proctoring System projesi üzerinde
çalışıyorum (TED University CMPE 492 Senior Project, demo: 2026-05-22).
Önceki oturumda Sprint 1+2+3+4+5 tamamlandı, production canlı:
https://horuseye.app

Repo: /Users/kursatozturk/Documents/HorusEye
Working branch: main
Production deploy SHA: f95511c (or later — git log main -1)
Supabase project: lvannuajbkrbwamzussh ("Horus Eye")

DEVAM ETMEM GEREKEN İŞ:
PRD-019 (Camera Pairing & Multi-Camera Session Binding) - planlandı,
yazıldı, henüz IMPLEMENTE EDİLMEDİ. Tüm spec için oku:
- PRD/PRD-019-camera-pairing.md  (ana spec)
- PRD/PRD-000-master-matrix.md   (Camera @1.2 + SessionCamera @1.0 +
                                  CameraHealthEvent @1.0 interface'leri)

PRD-019'un özeti:
1. Telefon-as-camera flow (PWA + getUserMedia + QR pair, harici app yok)
2. session_cameras junction table (M:N, çoklu kamera per session)
3. cameras tablosuna is_fixed, owner_user_id, device_id, last_seen_at
   alanları + room_id nullable (movable cams için)
4. Sabit kamera yanlış-oda 409 validation
5. Sahiplik (system vs personal cam)
6. Telefon sağlık izleme (battery, app visibility, permission revoke)
7. AI service'te yeni WS publish route (/ws/sessions/{id}/publish)
   binary JPEG frame'leri kabul eden

ÇALIŞMA SIRASI (PRD-019 §10 Key Files'a göre):

FAZ 1 — Schema + AI Service (zorunlu, ilk):
  1. Migration: portal/supabase/migrations/{ts}_camera_pairing_extensions.sql
     - cameras: is_fixed, owner_user_id, device_id, last_seen_at, room_id NULLABLE
     - CHECK fixed_cameras_have_home_room
     - session_cameras + camera_health_events tabloları
     - Migration'ı MCP apply_migration ile uygula, AYRICA local file oluştur
  2. portal/types/index.ts: Camera @1.2 + SessionCamera @1.0 + CameraHealthEvent
  3. ai-service/src/api/protocol.py: protocol_version 1.1, ClientPublish msg
  4. ai-service/src/api/publish_handler.py: WS route, frame queue integration

FAZ 2 — Portal API (~250 satır):
  5. /api/cameras/pair-token/route.ts (POST: JWT 5dk + camera record)
  6. /api/cameras/pair/redeem/route.ts (GET, public route, token-only auth)
  7. /api/cameras/[id]/health-event/route.ts (POST/GET, telefondan)
  8. /api/exam-sessions/[id]/cameras/route.ts (GET/POST/DELETE, fixed-room
     validation 409 ile)
  9. JWT helper: portal/lib/auth/pair-token.ts

FAZ 3 — UI (~600 satır):
  10. portal/components/exams/PhonePairModal.tsx (PC tarafı, QR + status)
  11. portal/components/exams/CamPairCapture.tsx (telefon getUserMedia + WS)
  12. portal/app/cam-pair/page.tsx (telefon sayfası, public route)
  13. portal/components/exams/SessionCameraAttach.tsx (session'a cam ekle)
  14. portal/components/exams/CameraHealthBadge.tsx (live'da renk-kodlu)
  15. RoomCameraManager güncellenir (3 seçenek: IP/phone/USB)

FAZ 4 — Telefon Sağlık İzleme + Bildirim (~150 satır):
  16. CamPairCapture içinde Page Visibility / Battery / orientation /
      permission listeners
  17. Disconnect detection (heartbeat 5s, timeout 15s)
  18. Notification trigger logic (PRD-016 entegrasyon)

DEPENDENCIES:
- npm install qrcode.react   (PC tarafında QR render)
- ai-service: opencv-python-headless zaten var, ek bir şey gerekmez

TEST EDİLEN PRODUCTION URL'LERİ:
- https://horuseye.app — login OK
- /exam-rooms — room CRUD + camera form (RoomCameraManager bu PRD ile
  güncellenecek)
- /students — pool + CSV import çalışıyor
- /exams/new → /exams/[id] → /exams/[id]/live — WS connect (AI service
  AWS deploy değil, sadece "AI service offline" graceful state)

ENV VARS:
- AI_SERVICE_URL, AI_SERVICE_WS_URL, NEXT_PUBLIC_AI_SERVICE_WS_URL,
  AI_SERVICE_API_KEY (SSM'de hazır, CDK service-stack.ts'de wired)
- Yeni env var GEREKMEZ — pair token JWT için yeni bir secret eklenecek:
  PAIR_TOKEN_SECRET (yeni SSM param + CDK + .env.example)

CLAUDE.md KURALLARI (MUTLAKA UY):
- Migration via MCP → ardından local file (timestamp match)
- Yeni env var → SSM (String, NOT SecureString) + CDK + .env.example üçü birden
- Apostrof JSX'te &apos;
- Next.js 15+ params Promise — await params
- request.nextUrl.origin KULLANMA → process.env.NEXT_PUBLIC_APP_URL

GIT WORKFLOW:
- Tüm commit'ler main'e gider
- Her commit sonrası: git push origin main + 5 branch'e FF push
  (develop, Ali, Gizem, hilal, kursat) + local refs update
- Pre-commit hook PRD validation çalıştırır (.husky/pre-commit)
- Production deploy main push'unda otomatik tetiklenir

CI DURUMU:
- Lint, type-check, unit, e2e jobs çalışıyor
- Vitest unit: 12 files, 99 tests pass (mocked Supabase chain via Proxy)
- E2E: bazı testler flaky (storage 502, supabase restart) — production
  deploy'u bağımsız geçiyor

LÜTFEN BU SIRAYI TAKİP ET:
1. Önce Faz 1 (schema + AI publish route) — sonra commit + push
2. Faz 2 (portal API) — commit + push
3. Faz 3 (UI) — commit + push
4. Faz 4 (sağlık izleme) — commit + push
5. Test scenarios çalıştır (PRD-019 §11)
6. PRD-019 status='AKTIF (planning)' → 'AKTIF (in progress)' → 'TAMAM'

Sprint 5 zaten 'completed' (Phase B / Post-Graduation Backlog).
PRD-019 işi YENİ bir Sprint 6 yaratıp orada track edilebilir; ya da
mevcut Sprint 4'e ek backlog item olarak eklenebilir. Bana sor.

İlk soru: Sprint 6 mı yaratayım yoksa Sprint 4'e mi ekleyeyim?
PRD-019 tek bir mega-feature mı yoksa 7-8 ayrı backlog item mı olsun?
```

---

## 🛠️ Teknik Hatırlatıcılar

### Dosya Yapısı (mevcut sprint sonu)
```
HorusEye/
├── PRD/
│   ├── PRD-000-master-matrix.md     (Camera @1.2 + SessionCamera + CameraHealthEvent eklendi)
│   ├── PRD-013-camera-ai-analysis.md (Camera: @1.2 referansı güncellendi)
│   └── PRD-019-camera-pairing.md    (yeni — devam edilecek spec)
│
├── portal/
│   ├── app/
│   │   ├── api/
│   │   │   ├── cameras/route.ts            (CRUD - mevcut)
│   │   │   ├── cameras/[id]/route.ts       (mevcut)
│   │   │   ├── exam-sessions/[id]/...      (mevcut)
│   │   │   └── ... PRD-019 buraya yeni route'lar ekler
│   │   ├── (protected)/exams/...           (mevcut)
│   │   └── ... cam-pair/page.tsx eklenecek (PUBLIC, token-auth)
│   ├── components/
│   │   └── exams/
│   │       ├── RoomCameraManager.tsx       (mevcut, PRD-019 ile güncellenir)
│   │       ├── ExamDetail.tsx              (mevcut)
│   │       ├── SessionAssignModal.tsx      (mevcut, students+proctors)
│   │       └── ... PhonePairModal, CamPairCapture, SessionCameraAttach,
│   │              CameraHealthBadge eklenecek
│   ├── supabase/migrations/
│   │   └── 20260504* (5 migration)
│   └── types/index.ts                       (Camera @1.2 ile güncellenecek)
│
├── ai-service/
│   ├── src/api/
│   │   ├── protocol.py    (mevcut, protocol v1.0; v1.1 olarak bump'lanacak)
│   │   └── ws_handler.py  (mevcut subscribe; publish ayrı handler eklenecek)
│   └── src/detection/...
│
└── infra/lib/service-stack.ts               (env vars wired; yeni secret PAIR_TOKEN_SECRET eklenecek)
```

### Önemli Komutlar (kopyala-yapıştır)
```bash
# Migration uygula (MCP'den)
# → ardından list_migrations ile version'ı al
# → portal/supabase/migrations/{version}_{name}.sql olarak local kopya yaz

# Type-check
cd portal && npx tsc --noEmit

# Lint
cd portal && npm run lint

# Unit test
cd portal && npm test

# Build
cd portal && npm run build

# Commit + push (her commit sonrası)
cd /Users/kursatozturk/Documents/HorusEye
git add ...
git commit -m "..."
git push origin main && \
  git push origin main:develop main:Ali main:Gizem main:hilal main:kursat && \
  git update-ref refs/heads/develop refs/heads/main && \
  git update-ref refs/heads/kursat refs/heads/main

# AI service test (Python venv'de)
cd ai-service && .venv/bin/python -m pytest tests/ -x -q

# Production health check
curl -s https://horuseye.app/api/health
```

### Kritik Schema Bilgisi

```sql
-- cameras tablosunda OLAN alanlar (Sprint 4 sonu):
id, room_id, label, stream_url, camera_type, role,
position_x, position_y, quality_score, is_active, created_at

-- PRD-019 ile EKLENECEK alanlar:
is_fixed (default true), owner_user_id (FK user_profiles.id),
device_id, last_seen_at

-- room_id constraint: NOT NULL → NULLABLE olacak
-- CHECK constraint: is_fixed=true ise room_id zorunlu
```

### Pair Token JWT Yapısı

```typescript
// İçeride taşınan veri
interface PairTokenPayload {
  iss: 'horuseye-pair';
  camera_id: string;
  session_id: string | null;
  owner_user_id: string;
  iat: number;     // issued at (unix sec)
  exp: number;     // 5 dk sonra (iat + 300)
}

// HS256 ile imzalanır, secret = process.env.PAIR_TOKEN_SECRET
// Tahmin etmesi imkansız 32-byte hex string olmalı
// SSM /horuseye/{staging,production}/PAIR_TOKEN_SECRET (String type)
```

---

## 📝 Bu Oturum'un Sonu — Bilinen Durum

**Production:** `f95511c` SHA'sında. CI'da bazı E2E flake'ler var ama
deploy'u etkilemiyor. Tüm sayfalar canlıda:
- /exam-rooms (kamera ekleme dahil — IP camera için)
- /students (CSV import)
- /exams /exams/new /exams/[id] /exams/[id]/live
- Sidebar "Exam Module" group ile

**Sprint State:**
- Sprint 1+2+3+4 tamamen completed
- Sprint 5 (Phase B / Post-Graduation Backlog) completed (77 deferred items)
- Tüm 168 backlog item: done
- D1-D10 deliverable: completed
- 19 PRD coverage: 100%

**PRD-019 Status:** AKTIF (planning) — spec yazıldı, IMPLEMENT EDİLMEDİ.

**Sonraki adım:** Sprint 6 yarat veya Sprint 4'e ek; PRD-019'u 7-8 ayrı
BL- item'ına böl; Faz 1'den başla.

---

## 🚨 Yapılmaması Gerekenler (Memory)

- ❌ Production'daki Sprint 1+2+3+4+5 done item'larını ELLE TEKRAR DEĞİŞTİRME
- ❌ PRD-019 olmadan camera tablosuna alan ekleme — schema bu PRD'ye bağlı
- ❌ AI service'in mevcut subscribe handler'ını (PRD-013 §3.2) kırma — yeni publish handler ekleyerek genişlet
- ❌ qrcode.react YERINE qrcode kütüphanesi kurma — qrcode.react React-friendly
- ❌ Pair token süresini 5 dakikadan uzun tutma — güvenlik

---

**Bu doküman ile yeni oturuma başla, prompt'u kopyala-yapıştır,
work başlasın.**
