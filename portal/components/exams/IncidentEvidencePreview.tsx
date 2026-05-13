'use client';

// BL-238 — Full-res evidence + ±15s "clip" strip for the decision modal.
import { useEffect, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';

interface ContextItem {
  id: string;
  occurred_at: string;
  delta_seconds: number;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  student_id: string | null;
  track_id: number | null;
  evidence_path: string | null;
  signed_url: string | null;
  is_anchor: boolean;
}

const SEVERITY_RING: Record<ContextItem['severity'], string> = {
  low:      'ring-blue-300',
  medium:   'ring-amber-300',
  high:     'ring-orange-400',
  critical: 'ring-red-500',
};

export function IncidentEvidencePreview({ incidentId }: { incidentId: string }) {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    void fetch(`/api/incidents/${incidentId}/context`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        if (cancelled) return;
        const list = (body.items ?? []) as ContextItem[];
        setItems(list);
        setActiveId(list.find((i) => i.is_anchor)?.id ?? list[0]?.id ?? null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [incidentId]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border bg-muted/30">
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return <p className="text-xs text-destructive">{error}</p>;
  }

  const active = items.find((i) => i.id === activeId) ?? null;

  return (
    <div className="space-y-2">
      {/* Full-res viewer */}
      <div className="relative h-48 w-full overflow-hidden rounded-md border bg-muted/30">
        {!active?.signed_url ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageOff size={20} />
            <span className="text-xs">No evidence frame available.</span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
          <img
            src={active.signed_url}
            alt={`${active.incident_type} at ${active.occurred_at}`}
            className="h-full w-full object-contain"
          />
        )}
        {active && (
          <span className="absolute right-1 top-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] tabular-nums">
            {active.delta_seconds > 0 ? '+' : ''}{active.delta_seconds.toFixed(1)}s
          </span>
        )}
      </div>

      {/* ±15s strip */}
      {items.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {items.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => setActiveId(it.id)}
              className={`relative h-14 w-20 flex-none overflow-hidden rounded border bg-muted/30 ring-2 ${
                SEVERITY_RING[it.severity]
              } ${activeId === it.id ? 'ring-offset-2 ring-offset-background' : 'opacity-80 hover:opacity-100'}`}
              title={`${it.incident_type} · ${it.delta_seconds > 0 ? '+' : ''}${it.delta_seconds.toFixed(1)}s`}
            >
              {it.signed_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                <img src={it.signed_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <ImageOff size={14} />
                </div>
              )}
              <span className="absolute bottom-0 right-0 bg-background/80 px-1 text-[9px] tabular-nums">
                {it.delta_seconds > 0 ? '+' : ''}{it.delta_seconds.toFixed(0)}
              </span>
              {it.is_anchor && (
                <span className="absolute left-0 top-0 bg-foreground px-1 py-0.5 text-[8px] uppercase text-background">
                  Anchor
                </span>
              )}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          No neighboring incidents within ±15s of this one.
        </p>
      )}
    </div>
  );
}
