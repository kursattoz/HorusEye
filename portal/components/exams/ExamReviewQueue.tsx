'use client';

// BL-235 — Post-exam review queue. Lists incidents for an exam's
// sessions, opens IncidentDecisionModal on click, supports bulk
// selection for BL-237.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IncidentDecisionModal } from '@/components/exams/IncidentDecisionModal';
import type { ProctorDecision } from '@/types';

type IncidentRow = {
  id:               string;
  session_id:       string;
  student_id:       string | null;
  track_id:         number | null;
  incident_type:    string;
  severity:         'low' | 'medium' | 'high' | 'critical';
  confidence:       number;
  triggered_rules:  string[];
  evidence_paths:   string[];
  occurred_at:      string;
  proctor_decision: ProctorDecision | null;
  decision_note:    string | null;
};

const SEVERITY_BADGE: Record<string, string> = {
  low:      'bg-blue-100 text-blue-800',
  medium:   'bg-amber-100 text-amber-800',
  high:     'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const DECISION_BADGE: Record<NonNullable<ProctorDecision>, string> = {
  clean:      'bg-emerald-100 text-emerald-800',
  suspicious: 'bg-amber-100 text-amber-800',
  violation:  'bg-red-100 text-red-800',
};

const TYPE_OPTIONS = [
  '', 'phone_detected', 'earbuds_detected', 'paper_detected', 'gaze_diversion',
  'head_turn', 'empty_seat', 'whispering', 'unauthorized_communication',
  'position_uncertainty',
] as const;

const PAGE_SIZE = 25;

interface Props {
  sessionIds: string[];
  onBulkDecide?: (incidentIds: string[], decision: ProctorDecision) => Promise<void>;
}

export function ExamReviewQueue({ sessionIds, onBulkDecide }: Props) {
  const [severity, setSeverity]         = useState('');
  const [incidentType, setIncidentType] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<'all'|'pending'|'decided'>('pending');
  const [page, setPage] = useState(1);

  const [rows, setRows]   = useState<IncidentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [openIncident, setOpenIncident] = useState<IncidentRow | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const sessionIdsCsv = useMemo(() => sessionIds.join(','), [sessionIds]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- filter change resets pagination
  useEffect(() => { setPage(1); }, [severity, incidentType, decisionFilter, sessionIdsCsv]);

  useEffect(() => {
    if (sessionIds.length === 0) {
      setRows([]); setTotal(0); setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      session_ids: sessionIdsCsv,
      page:        String(page),
      limit:       String(PAGE_SIZE),
    });
    if (severity)     params.set('severity', severity);
    if (incidentType) params.set('incident_type', incidentType);
    if (decisionFilter === 'pending') params.set('only_undecided', 'true');
    if (decisionFilter === 'decided') params.set('only_decided',   'true');

    void fetch(`/api/incidents?${params.toString()}`)
      .then((r) => { if (!r.ok) throw new Error(`status ${r.status}`); return r.json(); })
      .then((body) => {
        if (cancelled) return;
        setRows(body.incidents ?? []);
        setTotal(body.total ?? 0);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [sessionIdsCsv, page, severity, incidentType, decisionFilter, sessionIds.length, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const toggleAll = () => {
    const allSelected = rows.every((r) => selected[r.id]);
    setSelected(allSelected ? {} : Object.fromEntries(rows.map((r) => [r.id, true])));
  };

  const handleBulk = async (decision: ProctorDecision) => {
    if (!onBulkDecide || selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      await onBulkDecide(selectedIds, decision);
      setSelected({});
      setReloadKey((k) => k + 1);
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters + bulk actions */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <FilterField label="Status">
          <select value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value as typeof decisionFilter)} className="rounded border bg-background px-2 py-1 text-sm">
            <option value="pending">Pending</option>
            <option value="decided">Decided</option>
            <option value="all">All</option>
          </select>
        </FilterField>
        <FilterField label="Severity">
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded border bg-background px-2 py-1 text-sm">
            <option value="">All</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </FilterField>
        <FilterField label="Type">
          <select value={incidentType} onChange={(e) => setIncidentType(e.target.value)} className="rounded border bg-background px-2 py-1 text-sm">
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t === '' ? 'All' : t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </FilterField>

        <div className="ml-auto flex items-center gap-2">
          {selectedIds.length > 0 && onBulkDecide ? (
            <>
              <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => handleBulk('clean')}>Mark clean</Button>
              <Button size="sm" variant="outline" disabled={bulkBusy} onClick={() => handleBulk('suspicious')}>Suspicious</Button>
              <Button size="sm" variant="destructive" disabled={bulkBusy} onClick={() => handleBulk('violation')}>Violation</Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {loading ? 'Loading…' : `${total} incident${total === 1 ? '' : 's'}`}
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {error ? (
          <Alert variant="destructive" className="m-3">
            <AlertTriangle size={14} />
            <AlertDescription>Failed to load: {error}</AlertDescription>
          </Alert>
        ) : !loading && rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No incidents match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {onBulkDecide && (
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={rows.length > 0 && rows.every((r) => selected[r.id])}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                <th className="p-2">Time</th>
                <th className="p-2">Severity</th>
                <th className="p-2">Type</th>
                <th className="p-2">Subject</th>
                <th className="p-2">Conf</th>
                <th className="p-2">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="hover:bg-muted/30 cursor-pointer"
                  onClick={() => setOpenIncident(r)}
                >
                  {onBulkDecide && (
                    <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.id}`}
                        checked={Boolean(selected[r.id])}
                        onChange={(e) => setSelected((s) => ({ ...s, [r.id]: e.target.checked }))}
                      />
                    </td>
                  )}
                  <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">
                    {new Date(r.occurred_at).toLocaleString()}
                  </td>
                  <td className="p-2">
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[r.severity]}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="p-2">{r.incident_type.replace(/_/g, ' ')}</td>
                  <td className="p-2">
                    {r.student_id ? <span className="font-mono">{r.student_id}</span> : `Track ${r.track_id ?? '?'}`}
                  </td>
                  <td className="p-2">{Math.round(r.confidence * 100)}%</td>
                  <td className="p-2 text-xs">
                    {r.proctor_decision ? (
                      <span className={`uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${DECISION_BADGE[r.proctor_decision]}`}>
                        {r.proctor_decision}
                      </span>
                    ) : (
                      <span className="italic text-muted-foreground">pending</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
        <span>Page {page} of {totalPages}</span>
        <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
          <ChevronLeft size={14} /> Prev
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
          Next <ChevronRight size={14} />
        </Button>
      </div>

      <IncidentDecisionModal
        open={openIncident !== null}
        onClose={() => setOpenIncident(null)}
        incident={openIncident}
        onDecided={() => setReloadKey((k) => k + 1)}
      />
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

// EvidenceLink reused via IncidentReviewQueue is fine; this minimal table
// doesn't show a thumbnail column — the decision modal opens on click and
// will surface evidence as part of BL-238.
const _evidenceUnused = ImageOff;  // keep import side-effect-free
void _evidenceUnused;
