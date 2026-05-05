'use client';

// BL-190 / BL-200 — LiveMonitor incident card.
// - BL-190: severity, evidence thumbnail (signed URL via proxy), basic meta.
// - BL-200: expandable detail panel with raw_signals viewer + yaw mini chart.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ImageOff } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ServerIncident } from '@/types/ai';

const SEVERITY_BADGE: Record<string, string> = {
  low:      'bg-blue-100 text-blue-800',
  medium:   'bg-amber-100 text-amber-800',
  high:     'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

interface Props {
  incident: ServerIncident;
}

interface IncidentDetail {
  id:             string;
  incident_type:  string;
  severity:       string;
  confidence:     number;
  triggered_rules: string[];
  evidence_paths: string[];
  raw_signals:    Record<string, unknown> | null;
  occurred_at:    string;
}

export function IncidentCard({ incident }: Props) {
  const evidencePath = incident.evidence_paths?.[0] ?? null;
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState<boolean>(Boolean(evidencePath));
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!evidencePath) return;
    let cancelled = false;
    const url =
      `/api/incidents/${incident.incident_id}/evidence` +
      `?path=${encodeURIComponent(evidencePath)}`;
    void fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`evidence ${r.status}`);
        return r.json();
      })
      .then(({ signed_url }) => {
        if (cancelled) return;
        setSignedUrl(signed_url);
      })
      .catch(err => {
        if (cancelled) return;
        setEvidenceError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingEvidence(false);
      });
    return () => {
      cancelled = true;
    };
  }, [incident.incident_id, evidencePath]);

  // Lazy-load incident detail on first expand. Intentionally omit
  // loadingDetail from deps: setLoadingDetail(true) inside this effect
  // would otherwise schedule a re-render that runs the cleanup and
  // cancels the in-flight fetch before its .then can apply state.
  useEffect(() => {
    if (!expanded || detail) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- transition before fetch
    setLoadingDetail(true);
    void fetch(`/api/incidents/${incident.incident_id}`)
      .then(r => {
        if (!r.ok) throw new Error(`detail ${r.status}`);
        return r.json();
      })
      .then(body => {
        if (cancelled) return;
        setDetail(body.incident);
      })
      .catch(() => { /* swallow — show "no detail" state */ })
      .finally(() => { if (!cancelled) setLoadingDetail(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadingDetail intentionally omitted, see comment above
  }, [expanded, detail, incident.incident_id]);

  return (
    <li className="hover:bg-muted/30">
      <button
        type="button"
        className="flex w-full items-start gap-2 p-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        {expanded ? <ChevronDown size={14} className="mt-0.5 shrink-0" /> : <ChevronRight size={14} className="mt-0.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[incident.severity] ?? 'bg-muted'}`}>
              {incident.severity}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {new Date(incident.occurred_at).toLocaleTimeString()}
            </span>
          </div>

          <div className="mt-1.5 flex gap-3">
            {/* Evidence thumbnail */}
            <div className="h-16 w-20 shrink-0 overflow-hidden rounded border bg-muted/30">
              {!evidencePath ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <ImageOff size={16} />
                </div>
              ) : signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, not a static asset
                <img
                  src={signedUrl}
                  alt="Incident evidence"
                  className="h-full w-full object-cover"
                />
              ) : loadingEvidence ? (
                <div className="h-full w-full animate-pulse bg-muted" />
              ) : (
                <div className="flex h-full items-center justify-center text-[9px] text-muted-foreground">
                  {evidenceError ? 'error' : '—'}
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight">
                {incident.incident_type.replace(/_/g, ' ')}
              </p>
              <p className="text-xs text-muted-foreground">
                {incident.student_id ? `Student ${incident.student_id}` : `Track ${incident.track_id ?? '?'}`}
                {' · '}confidence {Math.round(incident.confidence * 100)}%
              </p>
              {incident.triggered_rules.length > 0 && (
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={incident.triggered_rules.join(', ')}>
                  {incident.triggered_rules.join(', ')}
                </p>
              )}
            </div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t bg-muted/30 p-3 pl-8">
          {loadingDetail ? (
            <p className="text-xs text-muted-foreground">Loading detail…</p>
          ) : detail?.raw_signals ? (
            <RawSignalsViewer signals={detail.raw_signals} />
          ) : (
            <p className="text-xs text-muted-foreground">No detail available.</p>
          )}
        </div>
      )}
    </li>
  );
}

// ───────── raw_signals viewer ─────────

function RawSignalsViewer({ signals }: { signals: Record<string, unknown> }) {
  // Pull the yaw_trace out for charting; render the rest as key/value rows
  const yawTraceRaw = signals.yaw_trace;
  const yawTrace: Array<[number, number]> = Array.isArray(yawTraceRaw)
    ? (yawTraceRaw as unknown[]).filter(
        (v): v is [number, number] =>
          Array.isArray(v) && v.length === 2 &&
          typeof v[0] === 'number' && typeof v[1] === 'number',
      )
    : [];

  const chartData = yawTrace.map(([ts, value]) => ({ ts, yaw: value }));
  const restEntries = Object.entries(signals).filter(([k]) => k !== 'yaw_trace');

  return (
    <div className="space-y-3">
      {chartData.length > 1 && (
        <div className="h-24 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="ts" type="number" domain={['auto', 'auto']} hide />
              <YAxis domain={[-90, 90]} hide />
              <Tooltip
                labelFormatter={(v: number) => `t=${Math.round(v)}s`}
                formatter={(v: number) => [`${v.toFixed(1)}°`, 'yaw']}
              />
              <Line
                type="monotone"
                dataKey="yaw"
                strokeWidth={1.5}
                stroke="#f59e0b"
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {restEntries.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="truncate font-medium text-muted-foreground" title={k}>{k}</dt>
            <dd className="truncate" title={String(v)}>{formatValue(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (v === null) return '—';
  if (typeof v === 'number') return v.toString();
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.length} items]`;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
