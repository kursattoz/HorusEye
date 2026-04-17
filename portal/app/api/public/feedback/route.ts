import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createHash } from 'crypto';
import { sendMail, getSmtpSettings } from '@/lib/mailer';
import { publicFeedbackTemplate } from '@/lib/mailer/templates';
import { log } from '@/lib/logger';

// ─── Security constants ────────────────────────────────────────────────────
const MAX_NAME    = 100;
const MIN_NAME    = 2;
const MAX_CONTENT = 1000;
const MIN_CONTENT = 10;
const RATE_LIMIT  = 5;          // max submissions per IP per hour

// Name: unicode letters, spaces, dots, hyphens, apostrophes only
const NAME_RE = /^[\p{L}\p{M}\s.\-']{2,100}$/u;

// Reject patterns that suggest injection / code
const BLOCKED_CONTENT_RE = /[<>`]|--\s|\/\*|\*\/|;\s*drop|;\s*select|;\s*insert|;\s*update|;\s*delete|;\s*alter|<script/i;

function hashIp(ip: string): string {
  return createHash('sha256').update(ip + process.env.SUPABASE_SERVICE_ROLE_KEY!.slice(-16)).digest('hex');
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

// ─── POST — anyone can submit public feedback ──────────────────────────────
export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const { file_id, author_name, content, otp_id, session_id } = body as Record<string, unknown>;
  const sessionId = typeof session_id === 'string' ? session_id : undefined;

  // ── Validate ──────────────────────────────────────────────────────────────
  if (typeof file_id !== 'string' || !/^[0-9a-f-]{36}$/.test(file_id)) {
    return NextResponse.json({ error: 'Invalid file.' }, { status: 400 });
  }

  if (typeof author_name !== 'string') {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }
  const name = author_name.trim();
  if (name.length < MIN_NAME || name.length > MAX_NAME) {
    return NextResponse.json({ error: `Name must be ${MIN_NAME}–${MAX_NAME} characters.` }, { status: 400 });
  }
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: 'Name contains invalid characters.' }, { status: 400 });
  }

  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'Feedback content is required.' }, { status: 400 });
  }
  const text = content.trim();
  if (text.length < MIN_CONTENT || text.length > MAX_CONTENT) {
    return NextResponse.json({ error: `Feedback must be ${MIN_CONTENT}–${MAX_CONTENT} characters.` }, { status: 400 });
  }
  if (BLOCKED_CONTENT_RE.test(text)) {
    return NextResponse.json({ error: 'Feedback contains disallowed content.' }, { status: 400 });
  }

  // ── Require verified OTP ──────────────────────────────────────────────────
  if (typeof otp_id !== 'string' || !/^[0-9a-f-]{36}$/.test(otp_id)) {
    return NextResponse.json({ error: 'Email verification is required.' }, { status: 403 });
  }

  // ── Rate limiting (service role to bypass RLS on SELECT) ──────────────────
  const admin = await createClient({ serviceRole: true });
  const ip    = getIp(request);
  const ipHash = hashIp(ip);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await admin
    .from('public_feedback')
    .select('*', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', hourAgo);

  if ((count ?? 0) >= RATE_LIMIT) {
    return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 });
  }

  // ── Verify OTP is valid and recently verified ─────────────────────────────
  const { data: otpRow } = await admin
    .from('feedback_otps')
    .select('verified_at, expires_at')
    .eq('id', otp_id)
    .maybeSingle();

  if (!otpRow?.verified_at) {
    return NextResponse.json({ error: 'Email verification is required.' }, { status: 403 });
  }
  if (new Date(otpRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Verification expired. Please verify again.' }, { status: 403 });
  }

  // ── Verify file exists ────────────────────────────────────────────────────
  const { data: fileRow } = await admin
    .from('files')
    .select('id')
    .eq('id', file_id)
    .eq('is_public', true)
    .maybeSingle();

  if (!fileRow) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  // ── Insert ────────────────────────────────────────────────────────────────
  const { data, error } = await admin
    .from('public_feedback')
    .insert({ file_id, author_name: name, content: text, ip_hash: ipHash })
    .select('id, author_name, content, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to save feedback.' }, { status: 500 });
  }

  // ── Notify admin via email (fire-and-forget) ──────────────────────────────
  const { data: fileInfo } = await admin
    .from('files')
    .select('display_name')
    .eq('id', file_id)
    .maybeSingle();

  const smtpSettings = await getSmtpSettings();
  if (smtpSettings?.admin_email) {
    const { subject, html } = publicFeedbackTemplate({
      authorName:  name,
      content:     text,
      fileName:    fileInfo?.display_name ?? file_id,
      submittedAt: new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
    });
    sendMail({ to: smtpSettings.admin_email, subject, html });
  }

  // Log to audit_logs with guest session_id (BL-90)
  log({
    event_type:    'feedback.create',
    severity:      'info',
    session_id:    sessionId,
    resource_type: 'file',
    resource_id:   file_id as string,
    action:        `Guest submitted public feedback on file: ${fileInfo?.display_name ?? file_id}`,
    metadata:      { file_id, author_name: name },
  }).catch(() => {});

  return NextResponse.json({ feedback: data }, { status: 201 });
}

// ─── GET — authenticated users only ───────────────────────────────────────
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  const fileId = request.nextUrl.searchParams.get('file_id');
  if (!fileId || !/^[0-9a-f-]{36}$/.test(fileId)) {
    return NextResponse.json({ error: 'Invalid file_id.' }, { status: 400 });
  }

  const admin = await createClient({ serviceRole: true });
  const { data, error } = await admin
    .from('public_feedback')
    .select('id, author_name, content, created_at')
    .eq('file_id', fileId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ feedbacks: data ?? [] });
}
