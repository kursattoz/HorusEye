'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, Plus, Radio, RadioTower, Settings, Smartphone, Wifi, WifiOff, Video, VideoOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AI_PROTOCOL_VERSION } from '@/types/ai';
import type { ServerMessage, ServerIncident, ServerStatus, ServerFrame } from '@/types/ai';
import { LiveVideoOverlay } from '@/components/exams/LiveVideoOverlay';
import { CameraHealthBadge } from '@/components/exams/CameraHealthBadge';
import { CameraTile } from '@/components/exams/CameraTile';
import { PhonePairModal } from '@/components/exams/PhonePairModal';
import { SessionCameraAttach } from '@/components/exams/SessionCameraAttach';

type ConnectState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

interface LiveMonitorProps {
  examId:   string;
  session:  { id: string; status: string; room_id?: string | null; exam_rooms?: { name: string } | null } | null;
  wsBase:   string;
}

interface SessionCameraRow {
  id: string;
  camera_id: string;
  added_at: string;
  camera: {
    id: string;
    label: string;
    camera_type: 'ip_camera' | 'phone' | 'usb_webcam';
    last_seen_at: string | null;
  };
}

export function LiveMonitor({ examId, session, wsBase }: LiveMonitorProps) {
  const [state, setState] = useState<ConnectState>('idle');
  const [incidents, setIncidents] = useState<ServerIncident[]>([]);
  const [statusMessages, setStatusMessages] = useState<ServerStatus[]>([]);
  const [framesByCamera, setFramesByCamera] = useState<Map<string, ServerFrame>>(new Map());
  const [focusedCameraId, setFocusedCameraId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionCameras, setSessionCameras] = useState<SessionCameraRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // ────────────── WS subscribe + frame demux ──────────────
  useEffect(() => {
    if (!session) return;
    if (!wsBase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time validation of immutable prop
      setError('NEXT_PUBLIC_AI_SERVICE_WS_URL is not configured.');
      // eslint-disable-next-line react-hooks/set-state-in-effect -- pairs with setError above
      setState('error');
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- transition idle→connecting before async fetch
    setState('connecting');

    let cancelled = false;
    let ws: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    void fetch(`/api/ai/ws-config?session_id=${encodeURIComponent(session.id)}`)
      .then(r => r.json())
      .then(cfg => {
        if (cancelled) return;
        const baseUrl = (cfg.ws_url || wsBase || '').replace(/\/$/, '');
        if (!baseUrl) {
          setError('AI service WebSocket URL is not configured.');
          setState('error');
          return;
        }
        const url = `${baseUrl}/ws/sessions/${session.id}/detections`;
        try {
          ws = new WebSocket(url);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          setState('error');
          return;
        }
        wsRef.current = ws;

        ws.onopen = () => {
          ws?.send(JSON.stringify({
            type: 'subscribe',
            protocol_version: AI_PROTOCOL_VERSION,
            api_key: cfg.api_key ?? '',
            session_id: session.id,
          }));
        };

        ws.onmessage = (evt) => {
          try {
            const msg = JSON.parse(evt.data) as ServerMessage;
            switch (msg.type) {
              case 'status':
                setStatusMessages(prev => [...prev.slice(-19), msg]);
                if (msg.kind === 'connected')   setState('connected');
                if (msg.kind === 'auth_failed') { setError('AI service rejected the API key.'); setState('error'); }
                break;
              case 'incident':
                setIncidents(prev => [msg, ...prev].slice(0, 50));
                break;
              case 'frame':
                setFramesByCamera(prev => {
                  const next = new Map(prev);
                  next.set(msg.camera_id, msg);
                  return next;
                });
                setFocusedCameraId(prev => prev ?? msg.camera_id);
                break;
              case 'error':
                setError(`AI service error: ${msg.message}`);
                break;
              case 'pong':
              case 'detection':
                break;
            }
          } catch {
            /* ignore non-JSON */
          }
        };

        ws.onclose = () => setState('closed');
        ws.onerror = () => setState('error');

        heartbeat = setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
          }
        }, 25_000);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'ws-config fetch failed');
        setState('error');
      });

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', session_id: session.id }));
        ws.close();
      } else if (ws && ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [session, wsBase]);

  // ────────────── Session-cameras load (callable + polling) ──────
  const loadSessionCameras = useCallback(async () => {
    if (!session) return;
    try {
      const r = await fetch(`/api/exam-sessions/${session.id}/cameras`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) return;
      setSessionCameras(d.session_cameras ?? []);
    } catch { /* ignore */ }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load + interval poll for sessionCameras
    void loadSessionCameras();
    const t = setInterval(loadSessionCameras, 8_000);
    return () => clearInterval(t);
  }, [session, loadSessionCameras]);

  // Whoami — needed for SessionCameraAttach ownership filtering.
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setCurrentUserId(d.user?.id ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Note: we deliberately do NOT prune framesByCamera against sessionCameras
  // here — the polling lags the WS subscribe by up to 8s, and pruning during
  // that window would delete fresh frames before auto-attach lands and make
  // the main view flicker. Tiles render by sessionCameras (so detached
  // cameras vanish from the strip), and the in-memory frame map is cheap
  // (latest jpeg per camera, ~50KB).

  // Auto-focus the first attached camera if none focused yet.
  useEffect(() => {
    if (focusedCameraId) return;
    if (sessionCameras.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pick default focus when first cam appears
    setFocusedCameraId(sessionCameras[0]?.camera_id ?? null);
  }, [sessionCameras, focusedCameraId]);

  const focusedFrame = focusedCameraId ? framesByCamera.get(focusedCameraId) ?? null : null;
  const focusedRow   = useMemo(
    () => sessionCameras.find(sc => sc.camera_id === focusedCameraId) ?? null,
    [sessionCameras, focusedCameraId],
  );
  const focusedLabel = focusedRow?.camera.label ?? (focusedCameraId ? `cam ${focusedCameraId.slice(0, 8)}` : '');

  if (!session) {
    return (
      <Alert>
        <AlertDescription>
          This exam has no sessions yet. Add a session on the exam detail page before starting live monitoring.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4 flex-1 min-h-0">
      {/* Main: video frame + camera strip */}
      <div className="rounded-lg border bg-card flex flex-col overflow-hidden min-h-0">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Video size={14} className="text-muted-foreground" />
            <span className="font-semibold">{session.exam_rooms?.name ?? 'Session'}</span>
            <span className="text-xs text-muted-foreground">· status: {session.status}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {sessionCameras.map(sc => (
              <CameraHealthBadge
                key={sc.id}
                cameraId={sc.camera_id}
                cameraLabel={sc.camera.label}
                cameraType={sc.camera.camera_type}
                lastSeenAt={sc.camera.last_seen_at}
              />
            ))}
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setPairOpen(true)} title="Pair phone camera">
              <Smartphone size={11} /> Pair
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setManageOpen(true)} title="Manage cameras">
              <Settings size={11} /> Manage
            </Button>
          </div>
          <ConnectionBadge state={state} />
        </header>

        {/* Focused camera area — flex-1 + min-h-0 ensures it never overflows. */}
        <div className="flex-1 min-h-0 bg-black flex items-center justify-center relative">
          {focusedFrame ? (
            <LiveVideoOverlay frame={focusedFrame} showBbox label={focusedLabel} />
          ) : state === 'connected' ? (
            <div className="text-center text-sm text-muted-foreground p-6">
              <RadioTower className="mx-auto h-12 w-12 text-primary/40 animate-pulse" />
              <p className="mt-4 font-medium text-foreground">Connected. Awaiting frames.</p>
              <p className="mt-1 text-xs">
                {sessionCameras.length === 0
                  ? 'No cameras attached yet — pair a phone or manage cameras.'
                  : 'Phone is paired but no frames yet. Make sure the phone tab is open with permission granted.'}
              </p>
              {sessionCameras.length === 0 && (
                <Button size="sm" className="mt-3" onClick={() => setPairOpen(true)}>
                  <Plus size={12} /> Pair phone camera
                </Button>
              )}
            </div>
          ) : (
            <div className="text-center text-sm text-muted-foreground max-w-md p-6">
              <VideoOff className="mx-auto h-12 w-12 text-muted-foreground/40" />
              <p className="mt-4 font-medium text-foreground">
                {state === 'connecting' && 'Connecting to AI service…'}
                {state === 'closed'     && 'AI service connection closed.'}
                {state === 'error'      && 'Could not connect to AI service.'}
                {state === 'idle'       && 'AI service offline.'}
              </p>
              {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
            </div>
          )}
        </div>

      </div>

      {/* Right column: cameras card (top) + incident feed (bottom) */}
      <div className="flex flex-col gap-4 min-h-0">
        {/* Cameras card */}
        <div className="rounded-lg border bg-card flex flex-col overflow-hidden shrink-0">
          <header className="border-b px-4 py-2 flex items-center gap-2 text-sm font-semibold">
            <Video size={14} className="text-muted-foreground" />
            Cameras
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {sessionCameras.length}
            </span>
          </header>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[40vh] overflow-y-auto">
            {sessionCameras.length === 0 && (
              <p className="col-span-full text-xs text-muted-foreground italic px-1 py-3 text-center">
                Henüz bağlı kamera yok.
              </p>
            )}
            {sessionCameras.map(sc => (
              <CameraTile
                key={sc.id}
                cameraId={sc.camera_id}
                label={sc.camera.label}
                cameraType={sc.camera.camera_type}
                frame={framesByCamera.get(sc.camera_id) ?? null}
                active={focusedCameraId === sc.camera_id}
                onSelect={() => setFocusedCameraId(sc.camera_id)}
              />
            ))}
            <button
              type="button"
              onClick={() => setPairOpen(true)}
              className="aspect-video rounded-md border-2 border-dashed border-border hover:border-primary/60 flex flex-col items-center justify-center text-xs text-muted-foreground hover:text-foreground transition"
              title="Pair phone camera"
            >
              <Plus size={16} /> <span className="mt-1">Pair phone</span>
            </button>
          </div>
        </div>

      {/* Incident feed card */}
      <div className="rounded-lg border bg-card flex flex-col overflow-hidden flex-1 min-h-0">
        <header className="border-b px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle size={14} className="text-amber-600" />
            Incident feed
            <span className="ml-auto text-xs font-normal text-muted-foreground">{incidents.length}</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {incidents.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">No incidents yet. Real-time alerts appear here.</p>
          ) : (
            <ul className="divide-y">
              {incidents.map(inc => (
                <li key={inc.message_id} className="p-3 hover:bg-muted/30">
                  <div className="flex items-start justify-between gap-2">
                    <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${SEVERITY_BADGE[inc.severity] ?? 'bg-muted'}`}>
                      {inc.severity}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(inc.occurred_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium">{inc.incident_type.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-muted-foreground">
                    {inc.student_id ? `Student ${inc.student_id}` : `Track ${inc.track_id ?? '?'}`} ·
                    {' '}confidence {Math.round(inc.confidence * 100)}%
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {statusMessages.length > 0 && (
          <details className="border-t text-xs">
            <summary className="px-4 py-2 cursor-pointer text-muted-foreground hover:text-foreground">
              Connection log ({statusMessages.length})
            </summary>
            <ul className="px-4 pb-2 space-y-1 max-h-48 overflow-y-auto font-mono">
              {statusMessages.map((s, i) => (
                <li key={i} className="text-[10px] text-muted-foreground">
                  {new Date(s.timestamp).toLocaleTimeString()} · {s.kind} · {s.message}
                </li>
              ))}
            </ul>
          </details>
        )}
        </div>
      </div>

      {/* Modals */}
      <PhonePairModal
        open={pairOpen}
        onClose={() => setPairOpen(false)}
        sessionId={session.id}
        onConnected={async (cameraId) => {
          // Auto-attach freshly paired phone to this session (no extra click)
          // and refresh sessionCameras immediately instead of waiting for poll.
          try {
            const r = await fetch(`/api/exam-sessions/${session.id}/cameras`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ camera_id: cameraId }),
            });
            if (r.ok || r.status === 409) {
              // 409 = already attached (idempotent success path)
              setFocusedCameraId(cameraId);
              await loadSessionCameras();
            } else {
              const d = await r.json().catch(() => ({}));
              toast.error(`Auto-attach failed: ${d.error ?? r.status}`);
            }
          } catch (e) {
            toast.error(`Auto-attach error: ${e instanceof Error ? e.message : 'network'}`);
          }
        }}
      />
      <SessionCameraAttach
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        sessionId={session.id}
        sessionRoomId={session.room_id ?? ''}
        currentUserId={currentUserId ?? ''}
        onChange={() => { void loadSessionCameras(); }}
      />
    </div>
  );
}

const SEVERITY_BADGE: Record<string, string> = {
  low:      'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  medium:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  high:     'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

function ConnectionBadge({ state }: { state: ConnectState }) {
  const cfg: Record<ConnectState, { label: string; cls: string; icon: typeof Wifi }> = {
    idle:        { label: 'Idle',         cls: 'bg-muted text-muted-foreground', icon: WifiOff },
    connecting:  { label: 'Connecting',   cls: 'bg-blue-500/10 text-blue-600',   icon: Radio },
    connected:   { label: 'Live',         cls: 'bg-green-500/10 text-green-600', icon: Wifi },
    closed:      { label: 'Disconnected', cls: 'bg-muted text-muted-foreground', icon: WifiOff },
    error:       { label: 'Error',        cls: 'bg-red-500/10 text-red-600',     icon: WifiOff },
  };
  const { label, cls, icon: Icon } = cfg[state];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={10} /> {label}
    </span>
  );
}
