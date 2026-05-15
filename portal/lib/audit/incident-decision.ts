// BL-241 — Structured audit trail for every incident decision.
// Used by /api/incidents/[id] (single), /api/incidents/bulk-decide (BL-237),
// and the future review-page server actions. Guarantees a uniform
// metadata shape so analytics/compliance queries are stable.
import { log } from '@/lib/logger';
import type { ProctorDecision } from '@/types';

export interface IncidentDecisionAudit {
  incidentId:        string;
  sessionId:         string | null;
  studentId:         string | null;
  incidentType:      string;
  severity:          string;
  previousDecision:  ProctorDecision | null;
  newDecision:       ProctorDecision | null;
  decisionNote:      string | null;
  decidedBy:         string;
  bulkOperationId?:  string;    // shared by bulk-decide rows (BL-237)
  source:            'modal' | 'bulk' | 'api' | 'timeline';
}

const DECISION_ACTION_LABEL: Record<NonNullable<ProctorDecision>, string> = {
  clean:      'Cleared',
  suspicious: 'Flagged as suspicious',
  violation:  'Flagged as violation',
};

export async function logIncidentDecision(audit: IncidentDecisionAudit): Promise<void> {
  const verb = audit.newDecision
    ? DECISION_ACTION_LABEL[audit.newDecision]
    : 'Decision cleared';

  await log({
    event_type:    'system.info',
    severity:      audit.newDecision === 'violation' ? 'warn' : 'info',
    user_id:       audit.decidedBy,
    session_id:    audit.sessionId ?? undefined,
    resource_type: 'incident_decision',
    resource_id:   audit.incidentId,
    action:        `${verb} (${audit.incidentType})`,
    metadata: {
      incident_type:     audit.incidentType,
      severity:          audit.severity,
      student_id:        audit.studentId,
      previous_decision: audit.previousDecision,
      new_decision:      audit.newDecision,
      decision_note:     audit.decisionNote,
      bulk_operation_id: audit.bulkOperationId,
      source:            audit.source,
    },
  });
}
