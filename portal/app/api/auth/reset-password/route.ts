import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

// POST /api/auth/reset-password — self-service password reset via magic link
export async function POST(request: NextRequest) {
  const { email } = await request.json();

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  const supabase = await createClient({ serviceRole: true });

  // Verify user exists and is active before sending reset
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, is_active')
    .eq('email', email.trim().toLowerCase())
    .maybeSingle();

  if (!profile || !profile.is_active) {
    // Return success even if user doesn't exist (prevent email enumeration)
    return NextResponse.json({ success: true });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, '');
  const redirectTo = `${base}/auth/callback?next=${encodeURIComponent('/reset-password')}`;

  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });

  if (error) {
    await log({
      event_type: 'system.error',
      severity: 'error',
      action: `Password reset email failed for: ${email}`,
      metadata: { email, error: error.message },
    });
    return NextResponse.json({ error: 'Failed to send reset email.' }, { status: 500 });
  }

  await log({
    event_type: 'auth.password_reset',
    severity: 'info',
    user_id: profile.id,
    action: `Password reset requested: ${email}`,
  });

  return NextResponse.json({ success: true });
}
