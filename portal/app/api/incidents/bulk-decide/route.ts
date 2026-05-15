// BL-237 — Bulk incident decision endpoint.
// Body: { incident_ids: string[], decision: 'clean' | 'suspicious' | 'violation', note?: string }
// Writes one row per incident through the same audit helper (BL-241) so
// every bulk action leaves an individual audit_logs entry with a shared
// bulk_operation_id metadata field (queryable as one batch).
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logIncidentDecision } from '@/lib/audit/incident-decision';
import { log } from '@/lib/logger';
import type { ProctorDecision } from '@/types';

const DECISIONS: ProctorDecision[] = ['clean', 'suspicious', 'violation'];
const MAX_BULK = 500;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const ids: unknown = body.incident_ids;
  const decision = body.decision as ProctorDecision | undefined;
  const note = typeof body.note === 'string' ? body.note.slice(0, 1024) : null;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'incident_ids must be a non-empty array' }, { status: 400 });
  }
  if (ids.length > MAX_BULK) {
    return NextResponse.json({ error: `Too many incidents (max ${MAX_BULK})` }, { status: 400 });
  }
  const incidentIds = ids.filter((i): i is string => typeof i === 'string' && i.length > 0);
  if (incidentIds.length === 0) {
    return NextResponse.json({ error: 'No valid incident_ids' }, { status: 400 });
  }
  if (!decision || !DECISIONS.includes(decision)) {
    return NextResponse.json({ error: `decision must be one of: ${DECISIONS.join(', ')}` }, { status: 400 });
  }

  // Snapshot previous state for audit + downstream notifications.
  const { data: prevRows, error: prevErr } = await supabase
    .from('incidents')
    .select('id, session_id, student_id, incident_type, severity, proctor_decision')
    .in('id', incidentIds);
  if (prevErr) return NextResponse.json({ error: prevErr.message }, { status: 500 });

  const bulkOperationId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from('incidents')
    .update({
      proctor_decision: decision,
      decision_note:    note,
      decided_by:       user.id,
      decided_at:       now,
    })
    .in('id', incidentIds)
    .select('id');
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  const updatedIds = new Set((updated ?? []).map((r: { id: string }) => r.id));
  interface PrevRow {
    id: string;
    session_id: string | null;
    student_id: string | null;
    incident_type: string;
    severity: string;
    proctor_decision: ProctorDecision | null;
  }
  await Promise.all(
    ((prevRows ?? []) as PrevRow[]).map((row) => {
      if (!updatedIds.has(row.id)) return Promise.resolve();
      return logIncidentDecision({
        incidentId:       row.id,
        sessionId:        row.session_id,
        studentId:        row.student_id,
        incidentType:     row.incident_type,
        severity:         row.severity,
        previousDecision: row.proctor_decision,
        newDecision:      decision,
        decisionNote:     note,
        decidedBy:        user.id,
        bulkOperationId,
        source:           'bulk',
      });
    })
  );

  await log({
    event_type:    'system.info',
    severity:      decision === 'violation' ? 'warn' : 'info',
    user_id:       user.id,
    resource_type: 'incident_decision_bulk',
    resource_id:   bulkOperationId,
    action:        `Bulk decision: ${decision} on ${updatedIds.size} incident(s)`,
    metadata: {
      bulk_operation_id: bulkOperationId,
      decision,
      incident_ids:      Array.from(updatedIds),
      requested_count:   incidentIds.length,
      updated_count:     updatedIds.size,
    },
  });

  return NextResponse.json({
    ok: true,
    bulk_operation_id: bulkOperationId,
    decision,
    requested:         incidentIds.length,
    updated:           updatedIds.size,
  });
}
