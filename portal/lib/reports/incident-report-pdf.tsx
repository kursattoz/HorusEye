// BL-239 — PDF report generator. Builds a self-contained PDF that
// summarises an exam's incident outcomes. Three scopes: per-exam,
// per-session, per-student. Same renderer; the data layer slices the
// incidents before they reach the document.
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { ProctorDecision } from '@/types';

export type ReportScope = 'exam' | 'session' | 'student';

export interface IncidentRow {
  id: string;
  occurred_at: string;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  student_id: string | null;
  proctor_decision: ProctorDecision | null;
  decision_note: string | null;
  decided_at: string | null;
}

export interface ReportData {
  scope: ReportScope;
  generated_at: string;
  generated_by: string;
  exam: { id: string; title: string; scheduled_at: string | null };
  session?: { id: string; started_at: string | null; ended_at: string | null; room: string | null };
  student?: { student_id: string; full_name: string; department: string | null };
  incidents: IncidentRow[];
}

const styles = StyleSheet.create({
  page:     { fontFamily: 'Helvetica', fontSize: 10, padding: 32, lineHeight: 1.35 },
  h1:       { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  h2:       { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 14, marginBottom: 6 },
  meta:     { fontSize: 9, color: '#555', marginBottom: 12 },
  rowMeta:  { flexDirection: 'row', gap: 12, marginBottom: 2 },
  metaLabel:{ color: '#666', width: 95 },
  table:    { marginTop: 6, borderTopWidth: 1, borderColor: '#ccc' },
  tr:       { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eee', paddingVertical: 4 },
  th:       { fontFamily: 'Helvetica-Bold', color: '#222' },
  c_time:   { width: 110 },
  c_type:   { width: 110 },
  c_sev:    { width: 50 },
  c_stu:    { width: 70 },
  c_dec:    { width: 65 },
  c_note:   { flex: 1, color: '#333' },
  sevLow:   { color: '#1d4ed8' },
  sevMedium:{ color: '#b45309' },
  sevHigh:  { color: '#c2410c' },
  sevCrit:  { color: '#b91c1c', fontFamily: 'Helvetica-Bold' },
  decClean: { color: '#047857' },
  decSusp:  { color: '#b45309' },
  decViol:  { color: '#b91c1c', fontFamily: 'Helvetica-Bold' },
  summary:  { marginTop: 10, padding: 8, backgroundColor: '#f7f7f7' },
  footer:   { position: 'absolute', bottom: 18, left: 32, right: 32, fontSize: 8, color: '#888', textAlign: 'center' },
});

const SEV_STYLE = {
  low: styles.sevLow, medium: styles.sevMedium, high: styles.sevHigh, critical: styles.sevCrit,
} as const;

const DEC_STYLE = {
  clean: styles.decClean, suspicious: styles.decSusp, violation: styles.decViol,
} as const;

function summarize(incidents: IncidentRow[]) {
  const total = incidents.length;
  let violations = 0, suspicious = 0, clean = 0, pending = 0;
  const bySeverity: Record<string, number> = {};
  for (const i of incidents) {
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1;
    switch (i.proctor_decision) {
      case 'violation':  violations += 1; break;
      case 'suspicious': suspicious += 1; break;
      case 'clean':      clean      += 1; break;
      default:           pending    += 1;
    }
  }
  return { total, violations, suspicious, clean, pending, bySeverity };
}

function HorusEyeReport({ data }: { data: ReportData }) {
  const summary = summarize(data.incidents);
  const title = data.scope === 'session' ? 'Session report'
              : data.scope === 'student' ? 'Student report'
              : 'Exam report';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>HorusEye — {title}</Text>
        <Text style={styles.meta}>
          Generated {new Date(data.generated_at).toLocaleString()} by {data.generated_by}
        </Text>

        <View>
          <Row label="Exam"    value={data.exam.title} />
          {data.exam.scheduled_at && <Row label="Scheduled" value={new Date(data.exam.scheduled_at).toLocaleString()} />}
          {data.session && <Row label="Session"  value={`${data.session.room ?? 'Room ?'}${data.session.started_at ? ' · ' + new Date(data.session.started_at).toLocaleString() : ''}`} />}
          {data.student && <Row label="Student"  value={`${data.student.full_name} (${data.student.student_id})${data.student.department ? ' · ' + data.student.department : ''}`} />}
        </View>

        <Text style={styles.h2}>Summary</Text>
        <View style={styles.summary}>
          <Row label="Total incidents" value={String(summary.total)} />
          <Row label="Violations"      value={String(summary.violations)} />
          <Row label="Suspicious"      value={String(summary.suspicious)} />
          <Row label="Cleared"         value={String(summary.clean)} />
          <Row label="Pending"         value={String(summary.pending)} />
          <Row label="By severity"     value={Object.entries(summary.bySeverity).map(([s, n]) => `${s}: ${n}`).join('  ·  ') || '—'} />
        </View>

        <Text style={styles.h2}>Incidents</Text>
        <View style={styles.table}>
          <View style={[styles.tr, { backgroundColor: '#f0f0f0' }]}>
            <Text style={[styles.c_time, styles.th]}>Time</Text>
            <Text style={[styles.c_type, styles.th]}>Type</Text>
            <Text style={[styles.c_sev,  styles.th]}>Severity</Text>
            {data.scope !== 'student' && <Text style={[styles.c_stu, styles.th]}>Student</Text>}
            <Text style={[styles.c_dec,  styles.th]}>Decision</Text>
            <Text style={[styles.c_note, styles.th]}>Note</Text>
          </View>
          {data.incidents.map((inc) => (
            <View key={inc.id} style={styles.tr} wrap={false}>
              <Text style={styles.c_time}>{new Date(inc.occurred_at).toLocaleString()}</Text>
              <Text style={styles.c_type}>{inc.incident_type.replace(/_/g, ' ')}</Text>
              <Text style={[styles.c_sev, SEV_STYLE[inc.severity]]}>{inc.severity}</Text>
              {data.scope !== 'student' && <Text style={styles.c_stu}>{inc.student_id ?? '—'}</Text>}
              <Text style={inc.proctor_decision
                ? [styles.c_dec, DEC_STYLE[inc.proctor_decision]]
                : styles.c_dec}>
                {inc.proctor_decision ?? 'pending'}
              </Text>
              <Text style={styles.c_note}>{inc.decision_note ?? ''}</Text>
            </View>
          ))}
          {data.incidents.length === 0 && (
            <View style={styles.tr}>
              <Text style={{ color: '#999', fontStyle: 'italic' }}>No incidents in this scope.</Text>
            </View>
          )}
        </View>

        <Text style={styles.footer}>HorusEye — confidential.  Decisions are audit-logged.</Text>
      </Page>
    </Document>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowMeta}>
      <Text style={styles.metaLabel}>{label}:</Text>
      <Text>{value}</Text>
    </View>
  );
}

export async function generateIncidentReportPdf(data: ReportData): Promise<Buffer> {
  return await renderToBuffer(<HorusEyeReport data={data} />);
}
