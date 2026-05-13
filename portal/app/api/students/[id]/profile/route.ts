// BL-226 — PRD-018 §7.x Student profile detail (demographics + risk + past sessions).
// Returns the same payload /students/[id] profile page needs in a single round-trip.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params { params: Promise<{ id: string }> }

interface RiskRow {
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_trend: 'rising' | 'stable' | 'falling';
  incident_count: number;
  recent_count: number;
  prior_count: number;
  severity_breakdown: Record<string, number>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: student, error: stuErr } = await supabase
    .from('students')
    .select(`
      id, student_id, full_name, email, department, metadata, is_active,
      risk_score, risk_level, risk_trend, incident_count, risk_updated_at,
      face_embedding_updated_at, face_consent_at,
      created_at, updated_at
    `)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500 });
  if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: liveRisk } = await supabase
    .rpc('calculate_student_risk', { p_student_uuid: id })
    .maybeSingle<RiskRow>();

  interface SessionRow {
    session_id: string;
    seat_number: string | null;
    created_at: string;
    exam_sessions: {
      id: string;
      status: string;
      started_at: string | null;
      ended_at: string | null;
      exams: { id: string; title: string; scheduled_at: string | null } | null;
      exam_rooms: { id: string; name: string } | null;
    } | null;
  }

  const { data: sessionsData } = await supabase
    .from('session_students')
    .select(`
      session_id,
      seat_number,
      created_at,
      exam_sessions:session_id (
        id, status, started_at, ended_at,
        exams:exam_id (id, title, scheduled_at),
        exam_rooms:room_id (id, name)
      )
    `)
    .eq('student_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const sessions = (sessionsData ?? []) as unknown as SessionRow[];

  const sessionIds = sessions
    .map((s) => s.session_id)
    .filter((v): v is string => typeof v === 'string');

  const incidentCountsBySession: Record<string, number> = {};
  if (sessionIds.length) {
    const { data: incRows } = await supabase
      .from('incidents')
      .select('session_id')
      .eq('student_id', student.student_id)
      .in('session_id', sessionIds);
    for (const row of incRows ?? []) {
      const sid = row.session_id as string;
      incidentCountsBySession[sid] = (incidentCountsBySession[sid] ?? 0) + 1;
    }
  }

  const pastSessions = sessions.map((s) => ({
    session_id: s.session_id,
    seat_number: s.seat_number,
    enrolled_at: s.created_at,
    session: s.exam_sessions ? {
      id: s.exam_sessions.id,
      status: s.exam_sessions.status,
      started_at: s.exam_sessions.started_at,
      ended_at: s.exam_sessions.ended_at,
      exam: s.exam_sessions.exams,
      room: s.exam_sessions.exam_rooms,
    } : null,
    incident_count: incidentCountsBySession[s.session_id] ?? 0,
  }));

  return NextResponse.json({
    student,
    risk: liveRisk ?? {
      risk_score: Number(student.risk_score ?? 0),
      risk_level: student.risk_level,
      risk_trend: student.risk_trend,
      incident_count: student.incident_count,
      recent_count: 0,
      prior_count: 0,
      severity_breakdown: {},
    },
    past_sessions: pastSessions,
  });
}
