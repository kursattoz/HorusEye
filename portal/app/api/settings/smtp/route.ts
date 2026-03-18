import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/mailer/crypto';
import { log } from '@/lib/logger';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401, userId: '' };
  const { data: profile } = await supabase
    .from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403, userId: user.id };
  return { error: null, status: 200, userId: user.id };
}

// GET — return current settings (password masked)
export async function GET() {
  const { error, status } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const supabase = await createClient({ serviceRole: true });
  const { data } = await supabase
    .from('smtp_settings')
    .select('host, port, secure, username, from_name, from_email, admin_email, updated_at')
    .eq('id', 1)
    .single();

  // Never expose password_enc to client
  return NextResponse.json({ settings: data ?? null });
}

// PUT — save settings (re-encrypt password only if a new one is provided)
export async function PUT(request: NextRequest) {
  const { error, status, userId } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const body = await request.json();
  const { host, port, secure, username, password, from_name, from_email, admin_email } = body;

  if (!host || !port || !from_email || !admin_email) {
    return NextResponse.json(
      { error: 'host, port, from_email, and admin_email are required.' },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = {
    host,
    port: Number(port),
    secure: Boolean(secure),
    username: username ?? '',
    from_name: from_name ?? '',
    from_email,
    admin_email,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };

  // Only re-encrypt if a new password was supplied
  if (typeof password === 'string' && password.length > 0) {
    update.password_enc = encrypt(password);
  }

  const supabase = await createClient({ serviceRole: true });
  const { error: dbErr } = await supabase
    .from('smtp_settings')
    .update(update)
    .eq('id', 1);

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  await log({
    event_type: 'system.warning',
    severity:   'info',
    user_id:    userId,
    action:     'SMTP settings updated',
  });

  return NextResponse.json({ success: true });
}
