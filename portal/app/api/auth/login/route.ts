import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    await log({ event_type: 'auth.failed', severity: 'warn', action: `Login failed: ${email}`, metadata: { email } });
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  await log({ event_type: 'auth.login', severity: 'info', user_id: data.user.id, action: `Login: ${email}` });
  return NextResponse.json({ user: data.user });
}
