'use client';

// PRD-019 §6.4 — Camera health badge for the live page.
// Polls /api/cameras/[id]/health-events to derive a health state and
// renders a coloured pill with a tooltip on hover.

import { useEffect, useMemo, useState } from 'react';
import { Smartphone, Camera as CameraIcon } from 'lucide-react';

interface HealthEvent {
  event_type: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  cameraId: string;
  cameraLabel: string;
  cameraType: 'ip_camera' | 'phone' | 'usb_webcam';
  lastSeenAt: string | null;
  /** ms — defaults to 4s. */
  pollMs?: number;
}

type Health = 'healthy' | 'warning' | 'critical' | 'offline';

const HEALTH_COLOR: Record<Health, string> = {
  healthy:  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  warning:  'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  critical: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  offline:  'bg-muted text-muted-foreground border-border',
};

export function CameraHealthBadge({ cameraId, cameraLabel, cameraType, lastSeenAt, pollMs = 4_000 }: Props) {
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [seenAt, setSeenAt] = useState<string | null>(lastSeenAt);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/cameras/${cameraId}/health-events?limit=10`, { cache: 'no-store' });
        const d = await r.json();
        if (cancelled || !r.ok) return;
        setEvents(d.events ?? []);
        if (d.events?.[0]?.created_at) setSeenAt(d.events[0].created_at);
      } catch { /* ignore network blips */ }
    };
    void poll();
    const t = setInterval(poll, pollMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [cameraId, pollMs]);

  const { health, summary } = useMemo(() => deriveHealth(events, seenAt), [events, seenAt]);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${HEALTH_COLOR[health]}`}
      title={summary}
    >
      {cameraType === 'phone' ? <Smartphone size={11} /> : <CameraIcon size={11} />}
      <span className="max-w-[120px] truncate">{cameraLabel}</span>
      <span className={`h-1.5 w-1.5 rounded-full ${
        health === 'healthy'  ? 'bg-emerald-500 animate-pulse'
        : health === 'warning'  ? 'bg-amber-500'
        : health === 'critical' ? 'bg-red-500'
        : 'bg-gray-400'
      }`} />
    </span>
  );
}

function deriveHealth(events: HealthEvent[], lastSeenAt: string | null): { health: Health; summary: string } {
  const now = Date.now();
  const seenAge = lastSeenAt ? now - new Date(lastSeenAt).getTime() : Infinity;

  // Most recent significant event drives the colour.
  const recent = events.slice(0, 5);
  if (recent.some(e => e.event_type === 'critical_battery')) {
    return { health: 'critical', summary: `Pil kritik. Son sinyal ${formatAge(seenAge)} önce.` };
  }
  if (recent.some(e => e.event_type === 'permission_revoked')) {
    return { health: 'critical', summary: `Kamera izni kaldırılmış. Son sinyal ${formatAge(seenAge)} önce.` };
  }
  if (recent.some(e => e.event_type === 'disconnected')) {
    return { health: 'critical', summary: `Bağlantı kesildi. Son sinyal ${formatAge(seenAge)} önce.` };
  }
  // App backgrounded 3+ times in last 5 min → critical
  const fiveMinAgo = now - 5 * 60_000;
  const bgCount = recent.filter(e =>
    e.event_type === 'app_backgrounded' && new Date(e.created_at).getTime() >= fiveMinAgo,
  ).length;
  if (bgCount >= 3) {
    return { health: 'critical', summary: `Son 5 dakikada ${bgCount} kez arkaplana atıldı.` };
  }
  if (recent.some(e => e.event_type === 'app_backgrounded')) {
    return { health: 'warning', summary: 'Tarayıcı sekmesi arkaplana atıldı.' };
  }
  if (recent.some(e => e.event_type === 'low_battery')) {
    const ev = recent.find(e => e.event_type === 'low_battery');
    const lvl = ev?.metadata && typeof ev.metadata.level === 'number' ? Math.round(ev.metadata.level * 100) : null;
    return { health: 'warning', summary: lvl !== null ? `Pil %${lvl} — şarja takın.` : 'Pil düşük.' };
  }
  if (seenAge > 60_000) {
    return { health: 'offline', summary: lastSeenAt ? `Son sinyal ${formatAge(seenAge)} önce.` : 'Henüz frame gelmedi.' };
  }
  if (seenAge < Infinity) {
    return { health: 'healthy', summary: `Bağlı · ${formatAge(seenAge)} önce frame geldi.` };
  }
  return { health: 'offline', summary: 'Henüz bir sinyal yok.' };
}

function formatAge(ms: number): string {
  if (!isFinite(ms)) return 'hiç';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}dk`;
  const h = Math.floor(m / 60);
  return `${h}sa`;
}
