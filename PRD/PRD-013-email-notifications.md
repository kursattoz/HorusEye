# PRD-013 — E-posta Bildirimleri & SMTP Entegrasyonu
**Version:** 1.0
**Owner:** HorusEye Team
**Dependencies:** PRD-000, PRD-001, PRD-004, PRD-010
**Blocks:** —
**Status:** ACTIVE

---

<!-- INTERFACE_DEPS
AuthUser: @1.0
HorusFile: @1.0
Feedback: @1.0
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
- **DNS records (Route 53):** MX, SPF (include:_spf.mail.hostinger.com), DKIM (3× Hostinger CNAME), DMARC (p=none)
- **Anti-spam:** plain text fallback + `X-Mailer`, `X-Priority: 3`, `Importance: Normal` headers

### 2.2 Environment Variables

| Variable | Description |
|---|---|
| `SMTP_ENCRYPTION_KEY` | 32-byte hex key for AES-256-GCM password encryption |
| `NEXT_PUBLIC_APP_URL` | Public base URL — used in email logo `<img>` src (e.g. `https://horuseye.app`) |

### 2.3 Key Files

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

---

## 9. UI — Settings → Integrations

See PRD-010 Section 7 for the Integrations tab layout.
SMTP form fields: Server (host, port, TLS toggle), Authentication (username, password),
Sender (from name, from email), Notifications (admin email).
Connection status badge: `not_configured | connected | error`.

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
