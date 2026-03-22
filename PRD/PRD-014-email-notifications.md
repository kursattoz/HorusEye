# PRD-014 — E-posta Bildirimleri & SMTP Entegrasyonu
**Version:** 1.0
**Owner:** HorusEye Team
**Dependencies:** PRD-000, PRD-001, PRD-004, PRD-010, PRD-015
**Blocks:** —
**Status:** ACTIVE

---

<!-- INTERFACE_DEPS
AuthUser: @1.1
HorusFile: @1.4
Feedback: @1.1
-->

## ⚠️ LLM INSTRUCTION
SMTP settings are stored in the `smtp_settings` table (singleton, id=1).
Password is encrypted with AES-256-GCM using `SMTP_ENCRYPTION_KEY` env var.
All mail sending is fire-and-forget — never throw errors that break the main request.
OTP verification state machine lives in `feedback_otps` table.
File access requests are rate-limited via `file_access_requests` table.
Interface dependencies are declared in INTERFACE_DEPS block above.

---

## 1. Purpose

Provide a configurable SMTP email notification system for:
- Internal team events (assignment, feedback)
- Public user identity verification (OTP)
- Public document access gating (access link)

All configuration is done by Admin via Settings → Integrations. No hardcoded credentials.

---

## 2. Infrastructure

### 2.1 Sending Stack
- **Transport:** nodemailer with admin-configurable SMTP
- **Production SMTP:** Hostinger (`smtp.hostinger.com:465`, TLS)
- **From address:** `info@horuseye.app`
- **DNS records (Route 53):**
  - **MX:** `mx1.hostinger.com` (priority 10), `mx2.hostinger.com` (priority 20)
  - **SPF:** `v=spf1 include:_spf.mail.hostinger.com ~all`
  - **DKIM:** 3× CNAME (selector names Hostinger dashboard'dan alınır, genellikle `default._domainkey`)
  - **DMARC:** `v=DMARC1; p=quarantine; rua=mailto:admin@horuseye.app` (üretimde `p=reject`'e geçilecek)
- **Anti-spam:** plain text fallback + `X-Mailer`, `X-Priority: 3`, `Importance: Normal` headers

**Ek email header'ları:**
- `Reply-To`: `smtp_settings.admin_email` (From'dan farklı olabilir)
- `List-Unsubscribe`: Eklenmez (transactional email, marketing değil)
- `Return-Path`: nodemailer otomatik set eder (SMTP envelope sender)

### 2.2 Email Retry Stratejisi

Email gönderimi **fire-and-forget** olmasına rağmen, sessiz kayıp olmaması için retry mekanizması:

```typescript
// lib/mailer/index.ts — sendMail() içi
async function sendMailWithRetry(options: MailOptions): Promise<void> {
  const MAX_RETRIES = 3;
  const BACKOFF_MS = [1000, 3000, 10000]; // 1s, 3s, 10s

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      await transporter.sendMail(options);
      return; // başarılı
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        // Son deneme de başarısız — log + devam et
        logger.error('email.send_failed', {
          to: options.to,
          template: options.template,
          attempt: attempt + 1,
          error: error.message,
        });
        return; // throw etme — ana isteği bloklamaz
      }
      await sleep(BACKOFF_MS[attempt]);
    }
  }
}
```

**SMTP bağlantı havuzu:** nodemailer'ın built-in connection pooling kullanılır (`pool: true, maxConnections: 3`). Uzun süreli bağlantı sorunlarında transporter otomatik yeniden oluşturulur.

**Hata loglama seviyeleri:**
| Durum | Severity | Log Hedefi |
|-------|----------|-----------|
| SMTP yapılandırılmamış | warn | `audit_logs` + console |
| Geçici bağlantı hatası (retry ile çözüldü) | info | console only |
| 3 retry sonrası başarısız | error | `error_logs` + Sentry |
| Template render hatası | error | `error_logs` + Sentry |

Client'a hata dönülmez (fire-and-forget). Ama her hata en az bir yere loglanır.

### 2.3 Encryption Key Rotation

`SMTP_ENCRYPTION_KEY` değiştirilmesi gerekirse:

1. Yeni key'i SSM'e `SMTP_ENCRYPTION_KEY_NEW` olarak ekle
2. Migration kodu: eski key ile decrypt → yeni key ile encrypt → `smtp_settings.password_enc` güncelle
3. `SMTP_ENCRYPTION_KEY` SSM'de yeni değerle değiştir, `_NEW` sil
4. CDK deploy (`npx cdk context --clear` + deploy)

**Doğrulama adımları:**
- Adım 2 sonrası: eski key ile decrypt → yeni key ile encrypt → yeni key ile tekrar decrypt → orijinal eşleşme kontrolü
- Eşleşmezse: migration iptal, eski key korunur
- Partial failure (yarıda kalan encrypt): transaction rollback (tek SQL transaction içinde)

**Dikkat:** Key rotation sırasında kısa süreliğine (deploy anı) email gönderilemeyebilir. Planlı bakım penceresinde yapılmalı.

### 2.4 Environment Variables

| Variable | Description |
|---|---|
| `SMTP_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM password encryption |
| `NEXT_PUBLIC_APP_URL` | Public base URL — used in email logo `<img>` src (e.g. `https://horuseye.app`) |

### 2.5 Key Files

| File | Role |
|---|---|
| `portal/lib/mailer/index.ts` | `sendMail()`, `getSmtpSettings()`, `verifySmtp()` |
| `portal/lib/mailer/crypto.ts` | AES-256-GCM encrypt/decrypt for stored password |
| `portal/lib/mailer/templates.ts` | All 5 HTML email templates |

---

## 3. Database Schema

```sql
-- SMTP configuration (singleton)
CREATE TABLE public.smtp_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1,
  host          TEXT,
  port          INTEGER DEFAULT 587,
  secure        BOOLEAN DEFAULT false,
  username      TEXT,
  password_enc  TEXT,        -- AES-256-GCM: "iv:authTag:ciphertext" hex
  from_name     TEXT,
  from_email    TEXT,
  admin_email   TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT singleton CHECK (id = 1)
);

-- OTP verification for public feedback
CREATE TABLE public.feedback_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,     -- @tedu.edu.tr only
  code_hash   TEXT NOT NULL,     -- SHA-256 of the 6-digit code
  verified_at TIMESTAMPTZ,       -- set on successful verification
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON public.feedback_otps (email, expires_at);

-- File access link requests (rate limiting)
CREATE TABLE public.file_access_requests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,     -- @tedu.edu.tr only
  file_id    UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON public.file_access_requests (email, created_at);

-- Public (OTP-verified) feedback kayıtları (auth.users DIŞI)
-- NOT: Bu tablo PRD-004'teki `feedbacks` tablosundan AYRIDIR.
-- feedbacks = authenticated kullanıcı yorumları (admin/supervisor)
-- public_feedback = OTP ile doğrulanmış misafir yorumları
CREATE TABLE public.public_feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id     UUID NOT NULL REFERENCES public.files(id) ON DELETE CASCADE,
  otp_id      UUID NOT NULL REFERENCES public.feedback_otps(id),
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,      -- @tedu.edu.tr
  content     TEXT NOT NULL CHECK (char_length(content) <= 2000),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ON public.public_feedback (file_id, created_at DESC);

-- RLS: public read, service_role insert
ALTER TABLE public.public_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_read" ON public.public_feedback FOR SELECT USING (true);
```

---

## 4. Notification Events

### 4.1 Public Feedback Submitted → Admin
**Trigger:** POST `/api/public/feedback` succeeds
**Template:** `publicFeedbackTemplate`
**Recipient:** `smtp_settings.admin_email`
**Content:** author name, file name, submission time, feedback content

### 4.2 Report Deliverable Assigned → Assignee
**Trigger:** PUT `/api/reports/[id]` changes `assigned_to`
**Template:** `reportAssignedTemplate`
**Recipient:** newly assigned user's email (from `user_profiles`)
**Content:** deliverable title, number, deadline, assigned-by name

### 4.3 Internal File Feedback → File Uploader
**Trigger:** POST `/api/feedback` succeeds
**Template:** `fileFeedbackTemplate`
**Recipient:** `files.uploaded_by` user's email
**Skip if:** feedback author === file uploader (no self-notification)
**Content:** file name, feedback type, author name, submission time, content

---

## 5. OTP Verification (Public Feedback Gate)

Prevents anonymous spam on the public Document Hub feedback form.

### Flow
```
1. User fills feedback form → clicks "Submit Feedback"
2. Modal opens: enters @tedu.edu.tr username
3. POST /api/public/feedback/otp  { email, file_id }
   → generates 6-digit code, stores SHA-256 hash in feedback_otps
   → sends otpVerificationTemplate email
   → returns { otp_id }
4. User enters 6-digit code
5. POST /api/public/feedback/otp/verify  { otp_id, code }
   → checks code_hash match, expiry (10 min), not already used
   → sets verified_at
6. POST /api/public/feedback  { file_id, author_name, content, otp_id }
   → verifies otp row has verified_at, expires_at in future
   → inserts feedback
```

### Rate Limits
- OTP sends: max 3 per email per hour
- Feedback submits: max 5 per IP per hour

**OTP state kuralları:**
- Aynı email için yeni OTP istendiğinde: önceki doğrulanmamış OTP geçersiz kalır (expires_at = now())
- Aynı anda tek geçerli OTP olabilir (email başına)
- Doğrulanmış OTP tekrar kullanılamaz (verified_at set → reject)
- Expired OTP'ler 24 saat sonra cron ile temizlenir
- OTP kodu: 6 haneli numerik, leading zero geçerli (örn: 012345)

**Rate limit kuralları:**
| Endpoint | Limit | Bazı | Pencere |
|----------|-------|------|---------|
| POST /api/public/feedback/otp | 3 | **per email** | 1 saat |
| POST /api/public/feedback | 5 | **per IP** | 1 saat |
| POST /api/public/files/access-link | 3 | **per email** | 1 saat |

OTP rate limit email bazlıdır (aynı email 1 saatte max 3 OTP). Feedback submit IP bazlıdır (aynı IP'den max 5 feedback).

### Template: `otpVerificationTemplate`
**Subject:** `[HorusEye] Your verification code: {code}`
**Content:** 6-digit code in monospace box, 10-minute expiry warning, spam folder note

---

## 6. File Access Link Gate (Open / Download)

Public Document Hub "Open" and "Download" buttons require @tedu.edu.tr verification.

### Flow
```
1. User clicks Open or Download
2. Modal: enters @tedu.edu.tr username
3. POST /api/public/files/access-link  { email, file_id }
   → checks file is public
   → rate limit: max 3 per email per hour (file_access_requests table)
   → sends fileAccessLinkTemplate with public_url
4. Modal shows success: "Link sent to {email}"
5. User opens email → clicks "Open Document" CTA
```

**İşlem sırası:** 1) Dosya varlığı + public kontrolü, 2) Rate limit kontrolü, 3) Email gönderimi. Rate limit sayacı sadece dosya geçerli ise artırılır (geçersiz file_id quota tüketmez).

### Template: `fileAccessLinkTemplate`
**Subject:** `[HorusEye] Your access link for "{fileName}"`
**Content:** CTA button → public_url, fallback plain-text URL, spam folder warning box

---

## 7. Email Templates

All templates use a shared `layout()` wrapper with:
- Dark header: HorusEye logo (VML fallback for Outlook) + "horuseye" wordmark
- White body
- Light footer with automated notification disclaimer

| Template | Function | Trigger |
|---|---|---|
| `publicFeedbackTemplate` | Public feedback received → admin | POST /api/public/feedback |
| `reportAssignedTemplate` | Deliverable assigned → assignee | PUT /api/reports/[id] |
| `fileFeedbackTemplate` | File feedback → uploader | POST /api/feedback |
| `otpVerificationTemplate` | OTP code → @tedu.edu.tr user | POST /api/public/feedback/otp |
| `fileAccessLinkTemplate` | Document access link → @tedu.edu.tr user | POST /api/public/files/access-link |

### Outlook Compatibility
Logo uses VML conditional comment fallback:
- **Outlook desktop:** red rounded rectangle with "H" text (VML)
- **Gmail / Apple Mail / web:** hosted PNG from `NEXT_PUBLIC_APP_URL/icons/icon-192.png`

**Template değişken sanitizasyonu:** Tüm template değişkenleri (`author_name`, `file_name`, `content` vb.) HTML escape edilir:
```typescript
function escapeHtml(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```
Bu fonksiyon her template interpolasyonunda çağrılır. Raw HTML inject edilemez.

**Tarih/saat formatı:** Tüm email template'lerinde tarih `tr-TR` locale, `Europe/Istanbul` timezone ile formatlanır: `new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })`

---

## 8. API Routes

```
POST /api/settings/smtp              → Save SMTP settings (admin only)
GET  /api/settings/smtp              → Get settings without password (admin only)
POST /api/settings/smtp/test         → Test SMTP connection (admin only)

POST /api/public/feedback/otp        → Generate & send OTP
POST /api/public/feedback/otp/verify → Verify OTP code

POST /api/public/files/access-link   → Send file access link
```

**API hata yanıtları:**
| Endpoint | Hata | HTTP | ApiErrorCode |
|----------|------|------|-------------|
| POST /api/settings/smtp | Validation hatası | 400 | `VALIDATION_ERROR` |
| POST /api/settings/smtp | Non-admin | 403 | `AUTH_FORBIDDEN` |
| POST /api/settings/smtp/test | Bağlantı hatası | 200 | `{ success: false, error: 'Connection refused' }` |
| POST /api/settings/smtp/test | Auth hatası | 200 | `{ success: false, error: 'Authentication failed' }` |
| POST /api/public/feedback/otp | Rate limit | 429 | `EMAIL_OTP_RATE_LIMITED` |
| POST /api/public/feedback/otp | Domain hatası | 400 | `EMAIL_DOMAIN_NOT_ALLOWED` |
| POST /api/public/feedback/otp/verify | Expired | 403 | `EMAIL_OTP_EXPIRED` |
| POST /api/public/feedback/otp/verify | Yanlış kod | 400 | `EMAIL_OTP_INVALID` |
| POST /api/public/files/access-link | Rate limit | 429 | `RATE_LIMITED` |
| POST /api/public/files/access-link | Dosya yok/private | 404 | `FILE_NOT_FOUND` |

---

## 9. UI — Settings → Integrations

See PRD-010 Section 7 for the Integrations tab layout.
SMTP form fields: Server (host, port, TLS toggle), Authentication (username, password),
Sender (from name, from email), Notifications (admin email).
Connection status badge: `not_configured | connected | error`.

**SMTP settings validasyon kuralları:**
| Alan | Kural | Hata Mesajı |
|------|-------|-------------|
| host | Zorunlu, min 3 karakter | 'SMTP sunucu adresi gerekli' |
| port | Zorunlu, 1-65535 arası integer | 'Geçersiz port numarası' |
| username | Zorunlu, min 1 karakter | 'Kullanıcı adı gerekli' |
| password | Zorunlu, min 1 karakter | 'Şifre gerekli' |
| from_email | Zorunlu, email formatı (regex) | 'Geçerli bir email adresi girin' |
| from_name | Opsiyonel, max 100 karakter | — |
| admin_email | Zorunlu, email formatı | 'Admin email adresi gerekli' |

Özel karakterler (şifrede `@`, `#`, `!` vb.) desteklenir — AES-256-GCM binary-safe.

---

## 10. Test Scenarios

- [ ] Save SMTP settings → encrypted in DB, plain password never stored
- [ ] Test Connection → green badge on success, red with error message on failure
- [ ] Public feedback submit → admin receives `publicFeedbackTemplate` email
- [ ] Report assigned → assignee receives `reportAssignedTemplate` email
- [ ] File feedback → uploader receives `fileFeedbackTemplate` email (skip if same person)
- [ ] OTP flow → code arrives in email → verify → feedback submits
- [ ] OTP rate limit → 4th request in 1h returns 429
- [ ] Expired OTP (>10 min) → feedback POST returns 403
- [ ] Already-used OTP → verify returns 400
- [ ] Access link → email arrives with "Open Document" CTA → link works
- [ ] Access link rate limit → 4th request in 1h returns 429
- [ ] Outlook: email logo renders as red VML box (not broken image)
- [ ] Gmail: email logo renders as favicon PNG
- [ ] Plain text fallback present in all emails
