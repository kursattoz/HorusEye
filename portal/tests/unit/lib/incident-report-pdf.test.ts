// BL-245 — Sprint 12 unit test: PDF report buffer is generated and
// contains the well-known %PDF- header. Exercises the rendering pipeline
// end-to-end with a minimal incident set.
import { describe, expect, it } from 'vitest';
import {
  generateIncidentReportPdf,
  type ReportData,
} from '@/lib/reports/incident-report-pdf';

function makeData(overrides?: Partial<ReportData>): ReportData {
  return {
    scope: 'exam',
    generated_at: '2026-05-13T10:00:00Z',
    generated_by: 'Test Proctor',
    exam: { id: 'exam-1', name: 'CMPE 491 Final', scheduled_date: '2026-05-13' },
    incidents: [
      {
        id: 'inc-1',
        occurred_at: '2026-05-13T09:30:00Z',
        incident_type: 'phone_detected',
        severity: 'high',
        confidence: 0.82,
        student_id: 'STU-001',
        proctor_decision: 'violation',
        decision_note: 'Phone clearly visible',
        decided_at: '2026-05-13T10:00:00Z',
      },
      {
        id: 'inc-2',
        occurred_at: '2026-05-13T09:45:00Z',
        incident_type: 'gaze_diversion',
        severity: 'medium',
        confidence: 0.65,
        student_id: 'STU-002',
        proctor_decision: null,
        decision_note: null,
        decided_at: null,
      },
    ],
    ...overrides,
  };
}

describe('generateIncidentReportPdf', () => {
  it('returns a non-empty PDF buffer for exam scope', async () => {
    const buffer = await generateIncidentReportPdf(makeData());
    expect(buffer.length).toBeGreaterThan(500);
    // PDF header magic bytes
    expect(buffer.slice(0, 4).toString()).toBe('%PDF');
  });

  it('handles empty incident lists', async () => {
    const buffer = await generateIncidentReportPdf(makeData({ incidents: [] }));
    expect(buffer.slice(0, 4).toString()).toBe('%PDF');
  });

  it('renders session scope with session context', async () => {
    const buffer = await generateIncidentReportPdf(makeData({
      scope: 'session',
      session: { id: 'sess-1', started_at: null, ended_at: null, room: 'Z-201' },
    }));
    expect(buffer.slice(0, 4).toString()).toBe('%PDF');
  });

  it('renders student scope with student context', async () => {
    const buffer = await generateIncidentReportPdf(makeData({
      scope: 'student',
      student: { student_id: 'STU-001', full_name: 'Jane Doe', department: 'CMPE' },
    }));
    expect(buffer.slice(0, 4).toString()).toBe('%PDF');
  });
});
