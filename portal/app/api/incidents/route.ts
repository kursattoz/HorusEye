// PRD-013 §7 — Incident list + create
// Most incidents arrive from the AI service via service-role inserts;
// this endpoint also supports manual entry for testing and review tooling.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';
import { log } from '@/lib/logger';

const TYPES = [
  'phone_detected', 'earbuds_detected', 'paper_detected',
  'gaze_diversion', 'head_turn', 'empty_seat',
  'whispering', 'unauthorized_communication', 'position_uncertainty',
] as const;

const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

// BL-189 (Sprint 7) — paginated GET with severity / type / date-range filters.
// The AI service writes incidents via service-role; review tooling consumes
// this list. Default page size 20, hard cap 100 (PRD-013 §7.1 review queue).
const SELECT_COLUMNS =
  'id, session_id, student_id, track_id, incident_type, severity, confidence, ' +
  'risk_score, triggered_rules, camera_ids, evidence_paths, raw_signals, ' +
  'is_reviewed, reviewed_by, review_note, proctor_decision, decision_note, ' +
  'decided_by, decided_at, occurred_at, created_at';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const sessionId    = url.searchParams.get('session_id');
  const studentId    = url.searchParams.get('student_id');
  const severity     = url.searchParams.get('severity');
  const incidentType = url.searchParams.get('incident_type');
  const reviewed     = url.searchParams.get('is_reviewed');
  const from         = url.searchParams.get('from');
  const to           = url.searchParams.get('to');

  const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit') ?? 20), 100));
  const page  = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  const start = (page - 1) * limit;
  const end   = start + limit - 1;

  let q = auth.supabase
    .from('incidents')
    .select(SELECT_COLUMNS, { count: 'exact' })
    .order('occurred_at', { ascending: false })
    .range(start, end);

  if (sessionId)  q = q.eq('session_id',   sessionId);
  if (studentId)  q = q.eq('student_id',   studentId);
  // BL-191 — review queue across an exam's sessions: pass session_ids=a,b,c
  const sessionIdsCsv = url.searchParams.get('session_ids');
  if (sessionIdsCsv) {
    const ids = sessionIdsCsv.split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length > 0) q = q.in('session_id', ids);
  }
  if (severity     && (SEVERITIES as readonly string[]).includes(severity))     q = q.eq('severity', severity);
  if (incidentType && (TYPES      as readonly string[]).includes(incidentType)) q = q.eq('incident_type', incidentType);
  if (reviewed === 'true')  q = q.eq('is_reviewed', true);
  if (reviewed === 'false') q = q.eq('is_reviewed', false);
  if (from) q = q.gte('occurred_at', from);
  if (to)   q = q.lte('occurred_at', to);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    incidents: data ?? [],
    total:     count ?? 0,
    page,
    limit,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const session_id   = String(body.session_id   ?? '').trim();
  const incident_type = String(body.incident_type ?? '');
  const severity      = String(body.severity      ?? '');
  const confidence    = Number(body.confidence ?? -1);

  if (!session_id) return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
  if (!(TYPES as readonly string[]).includes(incident_type)) {
    return NextResponse.json({ error: `incident_type must be one of: ${TYPES.join(', ')}` }, { status: 400 });
  }
  if (!(SEVERITIES as readonly string[]).includes(severity)) {
    return NextResponse.json({ error: `severity must be one of: ${SEVERITIES.join(', ')}` }, { status: 400 });
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return NextResponse.json({ error: 'confidence must be 0-1' }, { status: 400 });
  }

  const occurred_at = body.occurred_at ?? new Date().toISOString();

  const { data, error } = await auth.supabase
    .from('incidents')
    .insert({
      session_id,
      student_id:      body.student_id ?? null,
      track_id:        body.track_id ?? null,
      incident_type,
      severity,
      confidence,
      risk_score:      body.risk_score ?? null,
      triggered_rules: body.triggered_rules ?? [],
      camera_ids:      body.camera_ids ?? [],
      evidence_paths:  body.evidence_paths ?? [],
      raw_signals:     body.raw_signals ?? null,
      occurred_at,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await log({
    event_type:    'system.warning',
    severity:      severity === 'critical' ? 'error' : severity === 'high' ? 'warn' : 'info',
    user_id:       auth.userId,
    resource_type: 'incident',
    resource_id:   data.id,
    action:        `Incident logged: ${incident_type} (${severity})`,
    metadata:      { session_id, student_id: data.student_id, confidence },
  });

  return NextResponse.json({ incident: data }, { status: 201 });
}
