'use client';

// BL-227 — Per-student chronological incidents feed.
// Severity-colored left border, decision badges, evidence thumb lazy-loaded.
import { useEffect, useState } from 'react';
import { CheckCircle2, AlertOctagon, Circle, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TimelineIncident {
  id: string;
  session_id: string;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  triggered_rules: string[];
  evidence_paths: string[];
  is_reviewed: boolean;
  proctor_decision: 'clean' | 'suspicious' | 'violation' | null;
  decision_note: string | null;
  decided_at: string | null;
  occurred_at: string;
  exam_sessions: {
    id: string;
    started_at: string | null;
    ended_at: string | null;
    exams: { id: string; title: string } | null;
  } | null;
}

interface ApiPayload {
  incidents: TimelineIncident[];
  total: number;
  limit: number;
  offset: number;
}

const SEVERITY_BORDER: Record<TimelineIncident['severity'], string> = {
  low:      'border-l-blue-400',
  medium:   'border-l-amber-400',
  high:     'border-l-orange-500',
  critical: 'border-l-red-500',
};

const SEVERITY_BADGE: Record<TimelineIncident['severity'], string> = {
  low:      'bg-blue-100 text-blue-800',
  medium:   'bg-amber-100 text-amber-800',
  high:     'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

const DECISION_LABEL: Record<NonNullable<TimelineIncident['proctor_decision']>, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  clean:      { label: 'Clean',      cls: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  suspicious: { label: 'Suspicious', cls: 'bg-amber-100 text-amber-800',     icon: AlertOctagon },
  violation:  { label: 'Violation',  cls: 'bg-red-100 text-red-800',         icon: AlertOctagon },
};

const SEVERITIES: Array<'all' | TimelineIncident['severity']> = ['all', 'low', 'medium', 'high', 'critical'];

const PAGE_SIZE = 25;

export function IncidentsTimeline({ studentUuid }: { studentUuid: string }) {
  const [items, setItems] = useState<TimelineIncident[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | TimelineIncident['severity']>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    if (severityFilter !== 'all') params.set('severity', severityFilter);

    void fetch(`/api/students/${studentUuid}/incidents?${params.toString()}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as ApiPayload;
      })
      .then((body) => {
        if (cancelled) return;
        setItems(body.incidents);
        setTotal(body.total);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [studentUuid, offset, severityFilter]);

  const lastVisible = Math.min(offset + items.length, total);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 text-xs">
          <Filter size={12} className="text-muted-foreground" />
          {SEVERITIES.map((s) => (
            <button
              key={s}
              onClick={() => { setOffset(0); setSeverityFilter(s); }}
              className={`px-2 py-0.5 rounded-full text-[11px] capitalize ${
                severityFilter === s ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {total === 0 ? 'No incidents' : `${offset + 1}–${lastVisible} of ${total}`}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-md border bg-muted/30" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          No incidents recorded {severityFilter !== 'all' ? `at severity "${severityFilter}"` : 'for this student'}.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((inc) => (
            <TimelineRow key={inc.id} inc={inc} />
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            size="sm"
            variant="outline"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={offset + items.length >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

function TimelineRow({ inc }: { inc: TimelineIncident }) {
  const decision = inc.proctor_decision ? DECISION_LABEL[inc.proctor_decision] : null;
  const DecisionIcon = decision?.icon ?? Circle;
  return (
    <li className={`rounded-md border-l-4 bg-card border p-3 ${SEVERITY_BORDER[inc.severity]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[inc.severity]}`}>
              {inc.severity}
            </span>
            <span className="text-sm font-medium">
              {inc.incident_type.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-muted-foreground">
              · {Math.round(inc.confidence * 100)}% confidence
            </span>
          </div>

          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(inc.occurred_at).toLocaleString()}
            {inc.exam_sessions?.exams?.title ? <> · {inc.exam_sessions.exams.title}</> : null}
          </p>

          {inc.triggered_rules.length > 0 && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground" title={inc.triggered_rules.join(', ')}>
              Rules: {inc.triggered_rules.join(', ')}
            </p>
          )}

          {inc.decision_note && (
            <p className="mt-2 rounded bg-muted/40 px-2 py-1 text-[11px] italic">
              “{inc.decision_note}”
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          {decision ? (
            <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${decision.cls}`}>
              <DecisionIcon size={10} />
              {decision.label}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              Pending
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
