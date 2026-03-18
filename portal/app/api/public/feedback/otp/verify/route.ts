import { NextResponse, type NextRequest } from 'next/server';
import { createHash }                     from 'crypto';
import { createClient }                   from '@/lib/supabase/server';

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

// POST — verify an OTP code
export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { otp_id, code } = body as Record<string, unknown>;

  if (typeof otp_id !== 'string' || !/^[0-9a-f-]{36}$/.test(otp_id)) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: 'Code must be 6 digits.' }, { status: 400 });
  }

  const admin = await createClient({ serviceRole: true });

  const { data: otpRow } = await admin
    .from('feedback_otps')
    .select('id, code_hash, verified_at, expires_at')
    .eq('id', otp_id)
    .maybeSingle();

  if (!otpRow) {
    return NextResponse.json({ error: 'Invalid or expired code.' }, { status: 400 });
  }

  // Check expiry
  if (new Date(otpRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This code has expired. Please request a new one.' }, { status: 400 });
  }

  // Check already verified
  if (otpRow.verified_at) {
    return NextResponse.json({ error: 'This code has already been used.' }, { status: 400 });
  }

  // Check code matches
  if (hashCode(code.trim()) !== otpRow.code_hash) {
    return NextResponse.json({ error: 'Incorrect code. Please try again.' }, { status: 400 });
  }

  // Mark as verified
  await admin
    .from('feedback_otps')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', otp_id);

  return NextResponse.json({ success: true });
}
