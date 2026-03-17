import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401, supabase, adminId: '' };
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return { error: 'Forbidden', status: 403, supabase, adminId: user.id };
  return { error: null, status: 200, supabase, adminId: user.id };
}

export async function GET() {
  const { error, status, supabase } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role, is_active, avatar_url, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { error, status, supabase, adminId } = await requireAdmin();
  if (error) return NextResponse.json({ error }, { status });

  const { email, full_name, role } = await request.json();
  if (!email || !role) return NextResponse.json({ error: 'Email and role are required.' }, { status: 400 });
  if (role === 'admin') return NextResponse.json({ error: 'Admin role cannot be assigned through the UI.' }, { status: 400 });

  // Create auth user with service role client
  const adminClient = await createClient({ serviceRole: true });
  const { data: authData, error: authErr } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });

  // Create profile
  const { data: profile } = await supabase.from('user_profiles').insert({
    id:        authData.user.id,
    email,
    full_name: full_name ?? null,
    role,
  }).select().single();

  await log({ event_type: 'user.create', severity: 'info', user_id: adminId, action: `Created user: ${email}`, metadata: { role } });
  return NextResponse.json({ user: profile }, { status: 201 });
}
