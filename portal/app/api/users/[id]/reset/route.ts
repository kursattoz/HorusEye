import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: me } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: target } = await supabase.from('user_profiles').select('email').eq('id', id).single();
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const base = process.env.NEXT_PUBLIC_APP_URL!.replace(/\/$/, '');
  const redirectTo = `${base}/auth/callback?next=${encodeURIComponent('/reset-password')}`;
  const { error } = await supabase.auth.resetPasswordForEmail(target.email, { redirectTo });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await log({ event_type: 'auth.password_reset', severity: 'info', user_id: user.id, action: `Password reset sent for ${target.email}` });
  return NextResponse.json({ ok: true });
}
