import nodemailer, { type Transporter } from 'nodemailer';
import { decrypt } from './crypto';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SmtpSettings {
  host:         string;
  port:         number;
  secure:       boolean;
  username:     string;
  password_enc: string;
  from_name:    string;
  from_email:   string;
  admin_email:  string;
}

export interface SendMailOptions {
  to:      string;
  subject: string;
  html:    string;
}

// ─── Fetch SMTP settings from DB (service role, bypasses RLS) ─────────────────
export async function getSmtpSettings(): Promise<SmtpSettings | null> {
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient({ serviceRole: true });
  const { data, error } = await supabase
    .from('smtp_settings')
    .select('host, port, secure, username, password_enc, from_name, from_email, admin_email')
    .eq('id', 1)
    .single();
  if (error || !data || !data.host) return null;
  return data as SmtpSettings;
}

// ─── Build a nodemailer transporter from stored settings ──────────────────────
function buildTransporter(settings: SmtpSettings): Transporter {
  const password = decrypt(settings.password_enc);
  return nodemailer.createTransport({
    host:   settings.host,
    port:   settings.port,
    secure: settings.secure,
    auth: {
      user: settings.username,
      pass: password,
    },
  });
}

// ─── Send a single email — fire-and-forget safe ───────────────────────────────
export async function sendMail(options: SendMailOptions): Promise<void> {
  const settings = await getSmtpSettings();
  if (!settings) {
    console.warn('[Mailer] SMTP not configured — email skipped:', options.subject);
    return;
  }

  const transporter = buildTransporter(settings);
  const from = settings.from_name
    ? `"${settings.from_name}" <${settings.from_email}>`
    : settings.from_email;

  try {
    await transporter.sendMail({
      from,
      to:      options.to,
      subject: options.subject,
      html:    options.html,
      text:    htmlToPlainText(options.html),
      headers: {
        'X-Mailer':   'HorusEye Mailer',
        'X-Priority': '3',
        'Importance': 'Normal',
      },
    });
  } catch (err) {
    // Never throw — email failure must not break the main request
    console.error('[Mailer] Failed to send email:', (err as Error).message);
  }
}

// ─── Verify SMTP connection (used by test endpoint) ───────────────────────────
export async function verifySmtp(settings: SmtpSettings): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = buildTransporter(settings);
    await transporter.verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
