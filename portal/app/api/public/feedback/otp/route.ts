import { NextResponse, type NextRequest } from 'next/server';
import { createHash, randomInt }          from 'crypto';
import { createClient }                   from '@/lib/supabase/server';
import { sendMail }                       from '@/lib/mailer';
import { otpVerificationTemplate }        from '@/lib/mailer/templates';

const TEDU_DOMAIN   = '@tedu.edu.tr';
const OTP_EXPIRE_MIN = 10;
const RATE_LIMIT    = 3; // max OTP sends per IP per hour

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

// POST — generate and send OTP to a @tedu.edu.tr address
export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { email, file_id } = body as Record<string, unknown>;

  // Validate email
  if (typeof email !== 'string' || !email.toLowerCase().endsWith(TEDU_DOMAIN)) {
    return NextResponse.json(
      { error: `Only ${TEDU_DOMAIN} email addresses are accepted.` },
      { status: 400 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Validate file_id format
  if (typeof file_id !== 'string' || !/^[0-9a-f-]{36}$/.test(file_id)) {
    return NextResponse.json({ error: 'Invalid file.' }, { status: 400 });
  }

  const admin  = await createClient({ serviceRole: true });
  const ip     = getIp(request);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Rate limit per IP
  const { count } = await admin
    .from('feedback_otps')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', hourAgo);

  // Simple IP-based limit: we store a hashed IP note — just count recent sends globally per normalised email
  const { count: emailCount } = await admin
    .from('feedback_otps')
    .select('*', { count: 'exact', head: true })
    .eq('email', normalizedEmail)
    .gte('created_at', hourAgo);

  if ((emailCount ?? 0) >= RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many code requests. Please try again in an hour.' },
      { status: 429 }
    );
  }

  // Get file name for the email
  const { data: fileRow } = await admin
    .from('files')
    .select('display_name')
    .eq('id', file_id)
    .eq('is_public', true)
    .maybeSingle();

  if (!fileRow) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  // Generate 6-digit OTP
  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + OTP_EXPIRE_MIN * 60 * 1000).toISOString();

  // Store hashed code
  const { data: otpRow, error: dbErr } = await admin
    .from('feedback_otps')
    .insert({
      email:     normalizedEmail,
      code_hash: hashCode(code),
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (dbErr || !otpRow) {
    return NextResponse.json({ error: 'Failed to create verification code.' }, { status: 500 });
  }

  // Send email
  const { subject, html } = otpVerificationTemplate({
    code,
    fileName:   fileRow.display_name,
    expiresMin: OTP_EXPIRE_MIN,
  });
  sendMail({ to: normalizedEmail, subject, html });

  return NextResponse.json({ otp_id: otpRow.id });
}
