import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendMail } from '@/lib/mailer';
import { reportAssignedTemplate } from '@/lib/mailer/templates';

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('report_deliverables')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ deliverable: data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Capture previous assigned_to BEFORE update (to detect changes)
  const { data: prev } = await supabase
    .from('report_deliverables')
    .select('assigned_to')
    .eq('id', id)
    .maybeSingle();

  const allowed: Record<string, unknown> = {};
  if (body.status !== undefined) allowed.status = body.status;
  if (body.assigned_to !== undefined) allowed.assigned_to = body.assigned_to;
  if (body.file_id !== undefined) allowed.file_id = body.file_id;
  if (body.title !== undefined) allowed.title = body.title;
  if (body.description !== undefined) allowed.description = body.description;

  const { data, error } = await supabase
    .from('report_deliverables')
    .update(allowed)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // ── Notify assignee when assigned_to changes to a new user ───────────────
  const newAssignee = body.assigned_to;
  if (newAssignee && newAssignee !== prev?.assigned_to) {
    const adminClient = await createClient({ serviceRole: true });

    const [{ data: assignee }, { data: actorProfile }] = await Promise.all([
      adminClient.from('user_profiles').select('full_name, email').eq('id', newAssignee).maybeSingle(),
      adminClient.from('user_profiles').select('full_name').eq('id', user.id).maybeSingle(),
    ]);

    if (assignee?.email) {
      const { subject, html } = reportAssignedTemplate({
        assigneeName:      assignee.full_name ?? assignee.email,
        deliverableTitle:  data.title ?? 'Untitled',
        deliverableNumber: data.deliverable_number ?? '',
        deadline:          data.deadline
          ? new Date(data.deadline).toLocaleDateString('tr-TR')
          : '—',
        assignedByName:    actorProfile?.full_name ?? 'A team member',
      });
      sendMail({ to: assignee.email, subject, html });
    }
  }

  return NextResponse.json({ deliverable: data });
}
