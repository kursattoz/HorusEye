import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false };
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  return { user, isAdmin: profile?.role === 'admin' };
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user, isAdmin } = await requireAdmin(supabase);
  if (!user || !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body    = await request.json();
  const allowed: Record<string, unknown> = {};
  if (body.is_public    !== undefined) allowed.is_public    = body.is_public;
  if (body.display_name !== undefined) allowed.display_name = body.display_name;
  if (body.metadata     !== undefined) allowed.metadata     = body.metadata;
  if (body.blurred_page !== undefined) allowed.blurred_page = body.blurred_page;
  if (body.sort_order   !== undefined) allowed.sort_order   = body.sort_order;

  const { data, error } = await supabase.from('files').update(allowed).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await log({ event_type: 'file.update', severity: 'info', user_id: user.id, action: `Updated file ${id}`, metadata: allowed });
  return NextResponse.json({ file: data });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user, isAdmin } = await requireAdmin(supabase);
  if (!user || !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await supabase.from('files').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  await log({ event_type: 'file.delete', severity: 'warn', user_id: user.id, action: `Soft-deleted file ${id}` });
  return NextResponse.json({ ok: true });
}
