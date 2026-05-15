// BL-239 — Exam PDF report endpoint.
// Query params:
//   scope=exam|session|student (default: exam)
//   session_id=<uuid>  (required when scope=session)
//   student_id=<text>  (required when scope=student; school student_id)
// Returns a PDF body with appropriate Content-Disposition.
import { type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  generateIncidentReportPdf,
  type ReportData,
  type ReportScope,
} from '@/lib/reports/incident-report-pdf';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ id: string }> }
const ALLOWED_SCOPES: ReportScope[] = ['exam', 'session', 'student'];

export async function GET(req: NextRequest, { params }: Params) {
  const { id: examId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const scope = (url.searchParams.get('scope') ?? 'exam') as ReportScope;
  if (!ALLOWED_SCOPES.includes(scope)) {
    return new Response(`scope must be one of: ${ALLOWED_SCOPES.join(', ')}`, { status: 400 });
  }
  const sessionId = url.searchParams.get('session_id');
  const studentId = url.searchParams.get('student_id');
  if (scope === 'session' && !sessionId) return new Response('session_id required', { status: 400 });
  if (scope === 'student' && !studentId) return new Response('student_id required', { status: 400 });

  const { data: exam, error: examErr } = await supabase
    .from('exams')
    .select('id, name, scheduled_date')
    .eq('id', examId)
    .maybeSingle();
  if (examErr) return new Response(examErr.message, { status: 500 });
  if (!exam)   return new Response('Exam not found', { status: 404 });

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

  // Build the incidents query for the chosen scope.
  let q = supabase
    .from('incidents')
    .select('id, occurred_at, incident_type, severity, confidence, student_id, proctor_decision, decision_note, decided_at')
    .order('occurred_at', { ascending: true });

  if (scope === 'session') {
    q = q.eq('session_id', sessionId);
  } else if (scope === 'student') {
    q = q.eq('student_id', studentId).in('session_id', sessionIds);
  } else {
    q = q.in('session_id', sessionIds);
  }

  const { data: incidents, error: incErr } = await q;
  if (incErr) return new Response(incErr.message, { status: 500 });

  // Scope-specific top-of-doc context.
  let sessionCtx: ReportData['session'] | undefined;
  if (scope === 'session') {
    const sess = sessions.find((s) => s.id === sessionId);
    sessionCtx = sess ? {
      id: sess.id,
      started_at: sess.started_at,
      ended_at: sess.ended_at,
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

  await log({
    event_type:    'system.info',
    severity:      'info',
    user_id:       user.id,
    resource_type: 'incident_report_pdf',
    resource_id:   examId,
    action:        `PDF report generated (scope=${scope}, incidents=${reportData.incidents.length})`,
    metadata:      { scope, session_id: sessionId, student_id: studentId, count: reportData.incidents.length },
  });

  const fname = [
    'horuseye',
    exam.name.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 40).toLowerCase(),
    scope,
    scope === 'session' ? sessionId?.slice(0, 8) : scope === 'student' ? studentId : null,
    new Date().toISOString().slice(0, 10),
  ].filter(Boolean).join('_') + '.pdf';

  // Buffer → Uint8Array satisfies BodyInit narrowly.
  const body = new Uint8Array(buffer);
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Content-Length':      String(body.byteLength),
      'Cache-Control':       'private, no-store',
    },
  });
}
