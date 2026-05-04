// Shared auth helper for /api routes. Returns either an error response or
// the resolved user + supabase client, matching the existing pattern in
// /api/students and /api/users.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface AuthOk {
  ok: true;
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId:   string;
  role:     'admin' | 'supervisor' | 'assistant' | null;
}

interface AuthErr {
  ok: false;
  response: NextResponse;
}

export async function requireAuth(): Promise<AuthOk | AuthErr> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  return { ok: true, supabase, userId: user.id, role: (profile?.role as AuthOk['role']) ?? null };
}

export async function requireAdmin(): Promise<AuthOk | AuthErr> {
  const result = await requireAuth();
  if (!result.ok) return result;
  if (result.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return result;
}
