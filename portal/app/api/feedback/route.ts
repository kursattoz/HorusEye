import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const fileId = searchParams.get('file_id');
  if (!fileId) return NextResponse.json({ error: 'file_id gereklidir.' }, { status: 400 });

  const supabase = await createClient();
  const { data } = await supabase
    .from('feedbacks')
    .select(`
      id, content, feedback_type, resolved, is_hidden, created_at, line_ref,
      author:author_id ( full_name, email )
    `)
    .eq('file_id', fileId)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false });

  return NextResponse.json({ feedbacks: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  if (!['admin', 'supervisor'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { file_id, content, feedback_type = 'general', line_ref } = await request.json();
  if (!file_id || !content) return NextResponse.json({ error: 'file_id ve content gereklidir.' }, { status: 400 });

  const { data: feedback, error } = await supabase.from('feedbacks').insert({
    file_id, author_id: user.id, content, feedback_type, line_ref: line_ref ?? null,
  }).select(`
    id, content, feedback_type, resolved, is_hidden, created_at,
    author:author_id ( full_name, email )
  `).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await log({ event_type: 'feedback.create', severity: 'info', user_id: user.id, action: `Feedback on file ${file_id}` });
  return NextResponse.json({ feedback }, { status: 201 });
}
