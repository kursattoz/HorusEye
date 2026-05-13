// BL-240 — Email a generated PDF report to one or more recipients.
// Body: { scope, session_id?, student_id?, recipients: string[], message? }
// Uses BL-239 generator + lib/mailer.sendMail with PDF attachment.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendMail } from '@/lib/mailer';
import { reportReadyTemplate } from '@/lib/mailer/templates';
import {
  generateIncidentReportPdf,
  type ReportData,
  type ReportScope,
} from '@/lib/reports/incident-report-pdf';
import { createNotification, notifyAdmins } from '@/lib/notifications';
import { routes } from '@/constants/routes';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }

const ALLOWED_SCOPES: ReportScope[] = ['exam', 'session', 'student'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: NextRequest, { params }: Params) {
  const { id: examId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const scope = body.scope as ReportScope | undefined;
  if (!scope || !ALLOWED_SCOPES.includes(scope)) {
    return NextResponse.json({ error: `scope must be one of: ${ALLOWED_SCOPES.join(', ')}` }, { status: 400 });
  }
  const sessionId = body.session_id as string | undefined;
  const studentId = body.student_id as string | undefined;
  if (scope === 'session' && !sessionId) return NextResponse.json({ error: 'session_id required' }, { status: 400 });
  if (scope === 'student' && !studentId) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const recipients: string[] = Array.isArray(body.recipients) ? body.recipients : [];
  const cleanRecipients = recipients
    .map((r) => String(r).trim())
    .filter((r) => EMAIL_RE.test(r));
  if (cleanRecipients.length === 0) {
    return NextResponse.json({ error: 'recipients must include at least one valid email' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.slice(0, 2048) : null;

  const { data: exam } = await supabase
    .from('exams').select('id, title, scheduled_at').eq('id', examId).maybeSingle();
  if (!exam) return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

  interface SessionRow {
    id: string; started_at: string | null; ended_at: string | null;
    exam_rooms: { id: string; name: string } | null;
  }
  const { data: sessionsData } = await supabase
    .from('exam_sessions')
    .select('id, started_at, ended_at, exam_rooms(id, name)')
    .eq('exam_id', examId);
  const sessions = (sessionsData ?? []) as unknown as SessionRow[];
  const sessionIds = sessions.map((s) => s.id);

  let q = supabase
    .from('incidents')
    .select('id, occurred_at, incident_type, severity, confidence, student_id, proctor_decision, decision_note, decided_at')
    .order('occurred_at', { ascending: true });
  if (scope === 'session') q = q.eq('session_id', sessionId);
  else if (scope === 'student') q = q.eq('student_id', studentId).in('session_id', sessionIds);
  else q = q.in('session_id', sessionIds);

  const { data: incidents, error: incErr } = await q;
  if (incErr) return NextResponse.json({ error: incErr.message }, { status: 500 });

  let sessionCtx: ReportData['session'] | undefined;
  if (scope === 'session') {
    const sess = sessions.find((s) => s.id === sessionId);
    sessionCtx = sess ? {
      id: sess.id, started_at: sess.started_at, ended_at: sess.ended_at,
      room: sess.exam_rooms?.name ?? null,
    } : undefined;
  }
  let studentCtx: ReportData['student'] | undefined;
  if (scope === 'student' && studentId) {
    const { data: stu } = await supabase
      .from('students')
      .select('student_id, full_name, department')
      .eq('student_id', studentId)
      .maybeSingle();
    if (stu) studentCtx = { student_id: stu.student_id, full_name: stu.full_name, department: stu.department };
  }
  const { data: prof } = await supabase
    .from('user_profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle();

  const reportData: ReportData = {
    scope,
    generated_at: new Date().toISOString(),
    generated_by: prof?.full_name ?? prof?.email ?? user.email ?? 'unknown',
    exam,
    session: sessionCtx,
    student: studentCtx,
    incidents: (incidents ?? []) as ReportData['incidents'],
  };

  const buffer = await generateIncidentReportPdf(reportData);
  const fname = [
    'horuseye',
    exam.title.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40).toLowerCase(),
    scope,
    scope === 'session' ? sessionId?.slice(0, 8) : scope === 'student' ? studentId : null,
    new Date().toISOString().slice(0, 10),
  ].filter(Boolean).join('_') + '.pdf';

  // Send in parallel — mailer.sendMail never throws so we collect statuses.
  await Promise.all(cleanRecipients.map((to) =>
    sendMail({
      to,
      subject: `HorusEye report — ${exam.title}`,
      html:    reportReadyTemplate({
        examTitle:    exam.title,
        scope,
        sender:       reportData.generated_by,
        message,
        incidentCount: reportData.incidents.length,
      }),
      attachments: [{
        filename:    fname,
        content:     buffer,
        contentType: 'application/pdf',
      }],
    })
  ));

  // BL-244 — in-app notification for admins that a report was sent.
  await notifyAdmins(
    'system',
    `Report emailed — ${exam.title}`,
    `${cleanRecipients.length} recipient(s) · scope=${scope} · ${reportData.incidents.length} incident(s)`,
    routes.examDetail(examId),
  );

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       user.id,
    resource_type: 'incident_report_email',
    resource_id:   examId,
    action:        `Report emailed (scope=${scope}) to ${cleanRecipients.length} recipient(s)`,
    metadata: {
      scope,
      session_id:    sessionId,
      student_id:    studentId,
      recipients:    cleanRecipients,
      incident_count: reportData.incidents.length,
      message_provided: Boolean(message),
    },
  });

  return NextResponse.json({
    ok: true,
    recipients: cleanRecipients.length,
    incident_count: reportData.incidents.length,
  });
}
