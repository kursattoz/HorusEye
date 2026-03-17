import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await log({ event_type: 'auth.logout', severity: 'info', user_id: user.id, action: 'Logout' });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
