// BL-226 — Paginated incident feed for a single student (chronological).
// Drives the BL-227 timeline UI and BL-231 charts.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '50', 10), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset') ?? '0',  10), 0);
  const since  = url.searchParams.get('since');                 // ISO ts
  const severity = url.searchParams.get('severity');            // low|medium|high|critical
  const type   = url.searchParams.get('type');                  // incident_type

  const { data: student, error: stuErr } = await supabase
    .from('students')
    .select('id, student_id')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();
  if (stuErr) return NextResponse.json({ error: stuErr.message }, { status: 500 });
  if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let q = supabase
    .from('incidents')
    .select(`
      id, session_id, incident_type, severity, confidence, risk_score,
      triggered_rules, evidence_paths, raw_signals,
      is_reviewed, proctor_decision, decision_note, decided_at,
      occurred_at, created_at,
      exam_sessions:session_id (
        id, started_at, ended_at,
        exams:exam_id (id, name)
      )
    `, { count: 'exact' })
    .eq('student_id', student.student_id)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (since)    q = q.gte('occurred_at', since);
  if (severity) q = q.eq('severity', severity);
  if (type)     q = q.eq('incident_type', type);

  const { data: rows, error: incErr, count } = await q;
  if (incErr) return NextResponse.json({ error: incErr.message }, { status: 500 });

  // ---- aggregates for the chart strip (90-day window, severity histogram) ----
  const since90d = new Date(Date.now() - 90 * 86400_000).toISOString();
  const { data: chartRows } = await supabase
    .from('incidents')
    .select('severity, occurred_at, incident_type')
    .eq('student_id', student.student_id)
    .gte('occurred_at', since90d)
    .order('occurred_at', { ascending: true });

  const dailyMap = new Map<string, { date: string; total: number } & Record<'low'|'medium'|'high'|'critical', number>>();
  const typeMap  = new Map<string, number>();
  for (const r of chartRows ?? []) {
    const day = (r.occurred_at as string).slice(0, 10);
    const slot = dailyMap.get(day) ?? { date: day, total: 0, low: 0, medium: 0, high: 0, critical: 0 };
    slot.total += 1;
    const sev = r.severity as 'low'|'medium'|'high'|'critical';
    slot[sev] = (slot[sev] ?? 0) + 1;
    dailyMap.set(day, slot);
    typeMap.set(r.incident_type as string, (typeMap.get(r.incident_type as string) ?? 0) + 1);
  }

  return NextResponse.json({
    incidents: rows ?? [],
    total: count ?? 0,
    limit,
    offset,
    charts: {
      daily: Array.from(dailyMap.values()),
      by_type: Array.from(typeMap.entries()).map(([type, count]) => ({ type, count })),
    },
  });
}
