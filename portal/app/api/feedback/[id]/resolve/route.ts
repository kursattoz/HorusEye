import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { createNotification } from '@/lib/notifications';

interface Params { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch current state to toggle
  const { data: current } = await supabase.from('feedbacks').select('resolved').eq('id', id).single();
  if (!current) return NextResponse.json({ error: 'Feedback not found.' }, { status: 404 });

  const nowResolved = !current.resolved;
  const { data, error } = await supabase.from('feedbacks')
    .update(
      nowResolved
        ? { resolved: true,  resolved_by: user.id, resolved_at: new Date().toISOString() }
        : { resolved: false, resolved_by: null,    resolved_at: null }
    )
    .eq('id', id)
    .select(`
      *,
      author:author_id (full_name),
      file:files (display_name)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await log({
    event_type: 'feedback.update',
    severity: 'info',
    user_id: user.id,
    action: `${nowResolved ? 'Resolved' : 'Unresolved'} feedback ${id}`,
  });

  // Notify feedback author only when resolving (not unresolving)
  if (nowResolved && data.author_id) {
    createNotification({
      user_id: data.author_id,
      category: 'feedback',
      title: `Your feedback on ${data.file?.display_name ?? 'a file'} has been resolved`,
      description: `Your feedback "${data.content ?? '...' }" for ${data.file?.display_name ?? 'the file'} was marked resolved.`,
      link: `/feedback?file_id=${data.file_id}`,
    });
  }

  return NextResponse.json({ feedback: data, resolved: nowResolved });
}
