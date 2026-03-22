import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Users can view own profile; admins can view anyone
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin && user.id !== id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role, is_active, avatar_url, team_id, created_at')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error || !data) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  return NextResponse.json({ user: data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Allow user to update their own profile; admin can update anyone
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  const isAdmin = profile?.role === 'admin';
  if (!isAdmin && user.id !== id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const allowed: Record<string, unknown> = {};
  // Admin can update role, is_active
  if (isAdmin) {
    if (body.role      !== undefined) allowed.role      = body.role;
    if (body.is_active !== undefined) allowed.is_active = body.is_active;
  }
  // Anyone can update their own full_name
  if (user.id === id && body.full_name !== undefined) allowed.full_name = body.full_name;
  // Admin updating anyone's is_public etc
  if (isAdmin && body.is_public !== undefined) allowed.is_public = body.is_public;

  const { data: updated, error } = await supabase
    .from('user_profiles')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await log({ event_type: 'user.update', severity: 'info', user_id: user.id, action: `Updated user ${id}`, metadata: allowed });
  return NextResponse.json({ user: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await supabase.from('user_profiles').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  await log({ event_type: 'user.delete', severity: 'warn', user_id: user.id, action: `Soft-deleted user ${id}` });
  return NextResponse.json({ ok: true });
}
