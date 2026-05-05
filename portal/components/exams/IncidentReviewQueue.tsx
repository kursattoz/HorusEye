'use client';

// BL-191 — Read-only post-exam incident review queue (Sprint 7).
// Decision actions land in Sprint 12 — this view simply paginates,
// filters, and lets the proctor click an evidence thumbnail to open
// the signed URL in a new tab.
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  proctor_decision: 'clean' | 'suspicious' | 'violation' | null;
};

const SEVERITY_BADGE: Record<string, string> = {
  low:      'bg-blue-100 text-blue-800',
  medium:   'bg-amber-100 text-amber-800',
  high:     'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',                          label: 'All types' },
  { value: 'phone_detected',            label: 'Phone detected' },
  { value: 'earbuds_detected',          label: 'Earbuds' },
  { value: 'paper_detected',            label: 'Paper / book' },
  { value: 'gaze_diversion',            label: 'Gaze diversion' },
  { value: 'head_turn',                 label: 'Head turn' },
  { value: 'empty_seat',                label: 'Empty seat' },
  { value: 'whispering',                label: 'Whispering' },
  { value: 'unauthorized_communication', label: 'Unauthorized comm' },
  { value: 'position_uncertainty',      label: 'Position uncertain' },
];

const SEVERITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',         label: 'All severities' },
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const PAGE_SIZE = 20;

interface Props {
  sessionIds: string[];
}

export function IncidentReviewQueue({ sessionIds }: Props) {
  const [severity, setSeverity]         = useState<string>('');
  const [incidentType, setIncidentType] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to,   setTo]   = useState<string>('');
  const [page, setPage] = useState<number>(1);

  const [rows, setRows]   = useState<IncidentRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError]     = useState<string | null>(null);

  const sessionIdsCsv = useMemo(() => sessionIds.join(','), [sessionIds]);

  // Reset to page 1 whenever filters change
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional cascade: filter change resets pagination
  useEffect(() => { setPage(1); }, [severity, incidentType, from, to]);

  useEffect(() => {
    if (sessionIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- empty-session no-op reset
      setRows([]);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- empty-session no-op reset
      setTotal(0);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- empty-session no-op reset
      setLoading(false);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading transition before async fetch
    setLoading(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears prior error before refetch
    setError(null);

    const params = new URLSearchParams({
      session_ids: sessionIdsCsv,
      page:        String(page),
      limit:       String(PAGE_SIZE),
    });
    if (severity)     params.set('severity', severity);
    if (incidentType) params.set('incident_type', incidentType);
    if (from)         params.set('from', new Date(from).toISOString());
    if (to)           params.set('to',   new Date(to).toISOString());

    void fetch(`/api/incidents?${params.toString()}`)
      .then(r => { if (!r.ok) throw new Error(`status ${r.status}`); return r.json(); })
      .then(body => {
        if (cancelled) return;
        setRows(body.incidents ?? []);
        setTotal(body.total ?? 0);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [sessionIdsCsv, page, severity, incidentType, from, to, sessionIds.length]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3">
        <FilterField label="Severity">
          <select
            value={severity}
            onChange={e => setSeverity(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-sm"
          >
            {SEVERITY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Type">
          <select
            value={incidentType}
            onChange={e => setIncidentType(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-sm"
          >
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="From">
          <input
            type="datetime-local"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-sm"
          />
        </FilterField>
        <FilterField label="To">
          <input
            type="datetime-local"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="rounded border bg-background px-2 py-1 text-sm"
          />
        </FilterField>
        <div className="ml-auto text-xs text-muted-foreground">
          {loading ? 'Loading…' : `${total} incident${total === 1 ? '' : 's'}`}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        {error ? (
          <div className="flex items-center gap-2 p-4 text-sm text-red-600">
            <AlertTriangle size={16} />
            <span>Failed to load: {error}</span>
          </div>
        ) : !loading && rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No incidents match these filters.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">Time</th>
                <th className="p-2">Severity</th>
                <th className="p-2">Type</th>
                <th className="p-2">Subject</th>
                <th className="p-2">Confidence</th>
                <th className="p-2">Evidence</th>
                <th className="p-2">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="whitespace-nowrap p-2 text-xs text-muted-foreground">
                    {new Date(r.occurred_at).toLocaleString()}
                  </td>
                  <td className="p-2">
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[r.severity] ?? 'bg-muted'}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="p-2">{r.incident_type.replace(/_/g, ' ')}</td>
                  <td className="p-2">
                    {r.student_id ? `Student ${r.student_id}` : `Track ${r.track_id ?? '?'}`}
                  </td>
                  <td className="p-2">{Math.round(r.confidence * 100)}%</td>
                  <td className="p-2">
                    {r.evidence_paths.length > 0 ? (
                      <EvidenceLink incidentId={r.id} path={r.evidence_paths[0]!} />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ImageOff size={12} /> none
                      </span>
                    )}
                  </td>
                  <td className="p-2 text-xs text-muted-foreground">
                    {r.proctor_decision ?? <span className="italic">pending</span>}
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
        <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}>
          <ChevronLeft size={14} /> Prev
        </Button>
        <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
          Next <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function EvidenceLink({ incidentId, path }: { incidentId: string; path: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="text-xs text-primary underline-offset-2 hover:underline disabled:opacity-50"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await fetch(
            `/api/incidents/${incidentId}/evidence?path=${encodeURIComponent(path)}`,
          );
          if (!r.ok) throw new Error(`evidence ${r.status}`);
          const { signed_url } = await r.json();
          if (signed_url) window.open(signed_url, '_blank', 'noopener,noreferrer');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? 'Loading…' : 'View'}
    </button>
  );
}
