import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_DEV_ROLES = ['product_owner', 'portal_frontend', 'portal_backend', 'ai_backend', 'fullstack', 'project_coordinator'];

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, full_name, email, dev_role, avatar_url')
    .eq('is_active', true)
    .order('full_name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ members: data ?? [] });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only admins can change dev roles
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  // body: { assignments: [{ user_id, dev_role }] }
  if (!Array.isArray(body.assignments)) {
    return NextResponse.json({ error: 'assignments array required' }, { status: 400 });
  }

  const adminClient = await createClient({ serviceRole: true });

  for (const a of body.assignments) {
    if (!a.user_id) continue;
    const devRole = a.dev_role && VALID_DEV_ROLES.includes(a.dev_role) ? a.dev_role : null;

    await adminClient
      .from('user_profiles')
      .update({ dev_role: devRole })
      .eq('id', a.user_id);

    // Auto-transfer unstarted backlog items to new role holder
    if (devRole) {
      // Find items assigned to the OLD holder of this role
      const { data: oldHolder } = await adminClient
        .from('user_profiles')
        .select('id')
        .eq('dev_role', devRole)
        .neq('id', a.user_id)
        .eq('is_active', true)
        .maybeSingle();

      if (oldHolder) {
        // Transfer backlog/todo items (not in_progress or review)
        await adminClient
          .from('backlog_items')
          .update({ assigned_to: a.user_id })
          .eq('assigned_to', oldHolder.id)
          .eq('dev_role', devRole)
          .in('status', ['backlog', 'todo']);
      }
    }
  }

  // Return updated members
  const { data: members } = await adminClient
    .from('user_profiles')
    .select('id, full_name, email, dev_role, avatar_url')
    .eq('is_active', true)
    .order('full_name');

  return NextResponse.json({ members: members ?? [] });
}
