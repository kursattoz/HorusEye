import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/mailer/crypto';
import { verifySmtp, getSmtpSettings, type SmtpSettings } from '@/lib/mailer';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403 };
  return { error: null, status: 200 };
}

// POST — test SMTP connection
// Body: can be empty (uses saved settings) or a full settings object with plain-text password
export async function POST(request: NextRequest) {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  let settings: SmtpSettings | null;

  const body = await request.json().catch(() => ({}));

  if (body?.host) {
    // Use settings from request body — if password not provided, fall back to saved DB password
    const saved = await getSmtpSettings();
    settings = {
      host:         body.host,
      port:         Number(body.port) || 587,
      secure:       Boolean(body.secure),
      username:     body.username ?? '',
      password_enc: body.password ? encrypt(body.password) : (saved?.password_enc ?? ''),
      from_name:    body.from_name ?? '',
      from_email:   body.from_email ?? '',
      admin_email:  body.admin_email ?? '',
    };
  } else {
    // Use saved settings from DB
    settings = await getSmtpSettings();
  }

  if (!settings || !settings.host) {
    return NextResponse.json({ error: 'No SMTP settings configured.' }, { status: 400 });
  }

  const result = await verifySmtp(settings);

  if (result.ok) {
    return NextResponse.json({ success: true, message: 'SMTP connection verified successfully.' });
  } else {
    return NextResponse.json({ success: false, error: result.error }, { status: 422 });
  }
}
