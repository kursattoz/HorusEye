import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { sendMail } from '@/lib/mailer';
import { fileFeedbackTemplate } from '@/lib/mailer/templates';
import { createNotification } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const fileId = searchParams.get('file_id');
  if (!fileId) return NextResponse.json({ error: 'file_id is required.' }, { status: 400 });

  const supabase = await createClient();
  let query = supabase
    .from('feedbacks')
    .select(`
      id, content, feedback_type, resolved, is_hidden, created_at, line_ref,
      author:author_id ( full_name, email )
    `)
    .eq('file_id', fileId)
    .eq('is_hidden', false);

  // Optional resolved filter: ?resolved=true or ?resolved=false
  const resolvedParam = searchParams.get('resolved');
  if (resolvedParam === 'true') query = query.eq('resolved', true);
  else if (resolvedParam === 'false') query = query.eq('resolved', false);

  const { data } = await query.order('created_at', { ascending: false });

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
  if (!file_id || !content) return NextResponse.json({ error: 'file_id and content are required.' }, { status: 400 });

  const { data: feedback, error } = await supabase.from('feedbacks').insert({
    file_id, author_id: user.id, content, feedback_type, line_ref: line_ref ?? null,
  }).select(`
    id, content, feedback_type, resolved, is_hidden, created_at,
    author:author_id ( full_name, email )
  `).single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await log({ event_type: 'feedback.create', severity: 'info', user_id: user.id, action: `Feedback on file ${file_id}` });

  // ── Notify file uploader (skip if they're the one leaving feedback) ────────
  const adminClient = await createClient({ serviceRole: true });
  const { data: fileRow } = await adminClient
    .from('files')
    .select('display_name, uploaded_by')
    .eq('id', file_id)
    .maybeSingle();

  if (fileRow?.uploaded_by && fileRow.uploaded_by !== user.id) {
    const { data: uploader } = await adminClient
      .from('user_profiles')
      .select('full_name, email')
      .eq('id', fileRow.uploaded_by)
      .maybeSingle();

    if (uploader?.email) {
      const authorName = (feedback as { author?: { full_name?: string; email?: string } })
        .author?.full_name ?? 'A team member';

      const { subject, html } = fileFeedbackTemplate({
        uploaderName: uploader.full_name ?? uploader.email,
        fileName:     fileRow.display_name,
        feedbackType: feedback_type,
        authorName,
        content,
        submittedAt:  new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' }),
      });
      sendMail({ to: uploader.email, subject, html });
    }
  }

  // Notify file uploader about new feedback (if different from author)
  if (fileRow?.uploaded_by && fileRow.uploaded_by !== user.id) {
    createNotification({
      user_id: fileRow.uploaded_by,
      category: 'feedback',
      title: `New feedback on ${fileRow.display_name}`,
      description: `"${content}" was submitted for ${fileRow.display_name}.`,
      link: `/feedback?file_id=${file_id}`,
    });
  }

  return NextResponse.json({ feedback }, { status: 201 });
}
