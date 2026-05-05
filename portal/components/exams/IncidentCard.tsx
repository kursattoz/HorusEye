'use client';

// BL-190 — LiveMonitor incident card with evidence thumbnail.
// Subscribes to a single ServerIncident and lazily fetches a signed URL
// from /api/incidents/[id]/evidence so the bucket stays private.
import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
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

export function IncidentCard({ incident }: Props) {
  const hasEvidence = (incident.evidence_paths?.length ?? 0) > 0;
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingEvidence, setLoadingEvidence] = useState<boolean>(hasEvidence);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasEvidence) return;
    let cancelled = false;
    void fetch(`/api/incidents/${incident.incident_id}/evidence`)
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
  }, [incident.incident_id, hasEvidence]);

  return (
    <li className="p-3 hover:bg-muted/30">
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
          {!hasEvidence ? (
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
    </li>
  );
}
