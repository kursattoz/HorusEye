// BL-243 — /exams/analytics aggregations (cross-exam patterns).
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ProctorDecision } from '@/types';

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const since = new Date(Date.now() - 180 * 86400_000).toISOString();

  const [{ data: exams }, { data: incidents }] = await Promise.all([
    supabase
      .from('exams')
      .select('id, name, scheduled_date')
      .gte('scheduled_date', since.slice(0, 10))
      .order('scheduled_date', { ascending: false })
      .limit(30),
    supabase
      .from('incidents')
      .select('id, session_id, occurred_at, incident_type, severity, proctor_decision, decided_at')
      .gte('occurred_at', since),
  ]);

  interface Incident {
    id: string;
    session_id: string;
    occurred_at: string;
    incident_type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    proctor_decision: ProctorDecision | null;
    decided_at: string | null;
  }
  const inc = (incidents ?? []) as Incident[];

  // session_id → exam_id lookup
  const { data: sessions } = await supabase
    .from('exam_sessions').select('id, exam_id');
  const sessionToExam = new Map<string, string>();
  for (const s of (sessions ?? []) as Array<{ id: string; exam_id: string }>) {
    sessionToExam.set(s.id, s.exam_id);
  }

  // Aggregations
  const byExam   = new Map<string, { total: number; clean: number; suspicious: number; violation: number; pending: number }>();
  const byType   = new Map<string, number>();
  const byMonth  = new Map<string, { month: string; total: number; violation: number; suspicious: number; clean: number; pending: number }>();
  const decisionLatencyHours: number[] = [];

  for (const r of inc) {
    const examId = sessionToExam.get(r.session_id);
    if (examId) {
      const slot = byExam.get(examId) ?? { total: 0, clean: 0, suspicious: 0, violation: 0, pending: 0 };
      slot.total += 1;
      slot[(r.proctor_decision ?? 'pending') as keyof typeof slot] += 1;
      byExam.set(examId, slot);
    }
    byType.set(r.incident_type, (byType.get(r.incident_type) ?? 0) + 1);

    const month = r.occurred_at.slice(0, 7);
    const mSlot = byMonth.get(month) ?? { month, total: 0, violation: 0, suspicious: 0, clean: 0, pending: 0 };
    mSlot.total += 1;
    const mKey: 'clean' | 'suspicious' | 'violation' | 'pending' = r.proctor_decision ?? 'pending';
    mSlot[mKey] += 1;
    byMonth.set(month, mSlot);

    if (r.decided_at) {
      const dt = new Date(r.decided_at).getTime() - new Date(r.occurred_at).getTime();
      if (dt >= 0) decisionLatencyHours.push(dt / 3_600_000);
    }
  }

  const examRows = ((exams ?? []) as Array<{ id: string; name: string; scheduled_date: string | null }>).map((e) => ({
    id:             e.id,
    name:           e.name,
    scheduled_date: e.scheduled_date,
    ...byExam.get(e.id) ?? { total: 0, clean: 0, suspicious: 0, violation: 0, pending: 0 },
  }));

  const totals = {
    incidents:  inc.length,
    violations: inc.filter((r) => r.proctor_decision === 'violation').length,
    suspicious: inc.filter((r) => r.proctor_decision === 'suspicious').length,
    clean:      inc.filter((r) => r.proctor_decision === 'clean').length,
    pending:    inc.filter((r) => !r.proctor_decision).length,
    decided:    inc.filter((r) => r.proctor_decision !== null).length,
  };

  const avgDecisionHours = decisionLatencyHours.length
    ? decisionLatencyHours.reduce((a, b) => a + b, 0) / decisionLatencyHours.length
    : null;

  return NextResponse.json({
    window_days: 180,
    totals,
    avg_decision_hours: avgDecisionHours,
    by_type:  Array.from(byType.entries()).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    by_month: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
    exams:    examRows,
  });
}
