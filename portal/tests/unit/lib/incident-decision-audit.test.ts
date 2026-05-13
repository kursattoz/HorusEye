// BL-245 — Sprint 12 audit-trail unit test.
// Asserts that logIncidentDecision composes the structured metadata
// shape every callsite shares.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logSpy = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/logger', () => ({
  log: (...args: unknown[]) => logSpy(...args),
}));

import { logIncidentDecision } from '@/lib/audit/incident-decision';

beforeEach(() => {
  logSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logIncidentDecision', () => {
  it('emits structured metadata for a fresh violation decision', async () => {
    await logIncidentDecision({
      incidentId:       'inc-1',
      sessionId:        'sess-1',
      studentId:        'STU-001',
      incidentType:     'phone_detected',
      severity:         'high',
      previousDecision: null,
      newDecision:      'violation',
      decisionNote:     'Phone visible',
      decidedBy:        'user-1',
      source:           'modal',
    });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const arg = logSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.severity).toBe('warn');           // violations escalate
    expect(arg.resource_type).toBe('incident_decision');
    expect(arg.resource_id).toBe('inc-1');
    expect(arg.action).toContain('Flagged as violation');
    const meta = arg.metadata as Record<string, unknown>;
    expect(meta.previous_decision).toBeNull();
    expect(meta.new_decision).toBe('violation');
    expect(meta.source).toBe('modal');
  });

  it('keeps non-violation decisions at info severity', async () => {
    await logIncidentDecision({
      incidentId:       'inc-2',
      sessionId:        'sess-1',
      studentId:        'STU-002',
      incidentType:     'gaze_diversion',
      severity:         'medium',
      previousDecision: 'suspicious',
      newDecision:      'clean',
      decisionNote:     null,
      decidedBy:        'user-1',
      source:           'bulk',
      bulkOperationId:  'bulk-123',
    });
    const arg = logSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.severity).toBe('info');
    const meta = arg.metadata as Record<string, unknown>;
    expect(meta.bulk_operation_id).toBe('bulk-123');
    expect(meta.previous_decision).toBe('suspicious');
  });
});
