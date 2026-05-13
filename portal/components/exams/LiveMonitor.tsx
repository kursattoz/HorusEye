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
import { CameraViewport } from '@/components/exams/CameraViewport';
import { CameraTile } from '@/components/exams/CameraTile';
import { IncidentCard } from '@/components/exams/IncidentCard';
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
  // BL-317 (Sprint 18) — multi-cam view mode. 'focus' keeps the single
  // focused-camera viewport; 'grid' tiles every attached camera at once.
  const [viewMode, setViewMode] = useState<'focus' | 'grid'>('focus');
  const [error, setError] = useState<string | null>(null);
  const [sessionCameras, setSessionCameras] = useState<SessionCameraRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [pendingCameraId, setPendingCameraId] = useState<string | null>(null);
  const [frameTsByCamera, setFrameTsByCamera] = useState<Map<string, number>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  // Cameras we've already auto-attached during this monitor session — guards
  // against repeated POSTs as frames keep arriving for a pending camera.
  const autoAttachedRef = useRef<Set<string>>(new Set());
  // Holds the latest attachCamera fn — referenced from the WS onmessage
  // closure, declared later. Indirection avoids TDZ in lexical ordering.
  const attachCameraRef = useRef<(cameraId: string) => Promise<void>>(async () => {});

  useEffect(() => {
    sessionIdRef.current = session?.id ?? null;
  }, [session?.id]);

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
              case 'frame': {
                const camId = msg.camera_id;
                setFramesByCamera(prev => {
                  const next = new Map(prev);
                  next.set(camId, msg);
                  return next;
                });
                setFrameTsByCamera(prev => {
                  const next = new Map(prev);
                  next.set(camId, Date.now());
                  return next;
                });
                setFocusedCameraId(prev => prev ?? camId);
                // Frame-based connect detection: fire auto-attach once per
                // camera_id (set guards against repeats). pendingCameraId
                // stays set so PhonePairModal's externalConnected flag holds
                // true through the 1.5s confirmation window.
                if (!autoAttachedRef.current.has(camId)) {
                  autoAttachedRef.current.add(camId);
                  void attachCameraRef.current(camId);
                  setFocusedCameraId(camId);
                }
                break;
              }
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

  // Attach a paired camera to the session. Idempotent: 409 (already
  // attached) is treated as success. Surfaces any real failure as a toast.
  // Stored on attachCameraRef so the WS onmessage closure can call it
  // without lexical ordering issues.
  const attachCamera = useCallback(async (cameraId: string) => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      const r = await fetch(`/api/exam-sessions/${sid}/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera_id: cameraId }),
      });
      if (r.ok || r.status === 409) {
        await loadSessionCameras();
      } else {
        const d = await r.json().catch(() => ({}));
        toast.error(`Auto-attach failed (${r.status}): ${d.error ?? 'unknown'}`);
      }
    } catch (e) {
      toast.error(`Auto-attach error: ${e instanceof Error ? e.message : 'network'}`);
    }
  }, [loadSessionCameras]);
  useEffect(() => {
    attachCameraRef.current = attachCamera;
  }, [attachCamera]);

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

  // Stale detection: a camera whose last frame is older than 10s is "yayın
  // koptu". Re-evaluate every 3s so the overlay shows up on time even if no
  // new frames trigger a render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 3_000);
    return () => clearInterval(t);
  }, []);
  const STALE_AFTER_MS = 10_000;
  const isStale = useCallback((cameraId: string) => {
    const ts = frameTsByCamera.get(cameraId);
    if (ts === undefined) return false;
    return now - ts > STALE_AFTER_MS;
  }, [frameTsByCamera, now]);
  const focusedStale = focusedCameraId ? isStale(focusedCameraId) : false;

  // Health summary — counts cameras by current state for the header pill.
  const healthSummary = useMemo(() => {
    let live = 0, stale = 0, offline = 0;
    for (const sc of sessionCameras) {
      const ts = frameTsByCamera.get(sc.camera_id);
      if (ts === undefined) offline++;
      else if (now - ts > STALE_AFTER_MS) stale++;
      else live++;
    }
    return { live, stale, offline, total: sessionCameras.length };
  }, [sessionCameras, frameTsByCamera, now]);

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
          <div className="flex items-center gap-2">
            {/* Compact health summary — three pills with counts. Empty
                pills hidden so the header stays clean with 0 cams. */}
            {healthSummary.total > 0 && (
              <div className="flex items-center gap-1 text-[11px] font-medium">
                {healthSummary.live > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {healthSummary.live} live
                  </span>
                )}
                {healthSummary.stale > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {healthSummary.stale} stale
                  </span>
                )}
                {healthSummary.offline > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                    {healthSummary.offline} offline
                  </span>
                )}
              </div>
            )}
            {/* BL-317 view toggle */}
            {sessionCameras.length > 1 && (
              <div className="inline-flex rounded-md border bg-background p-0.5 text-[11px]">
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded ${viewMode === 'focus' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}
                  onClick={() => setViewMode('focus')}
                >
                  Focus
                </button>
                <button
                  type="button"
                  className={`px-2 py-0.5 rounded ${viewMode === 'grid' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/40'}`}
                  onClick={() => setViewMode('grid')}
                >
                  Grid
                </button>
              </div>
            )}
            <ConnectionBadge state={state} />
          </div>
        </header>

        {/* BL-317 grid view: tile every camera, click to refocus. */}
        {viewMode === 'grid' && sessionCameras.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-auto bg-black p-2">
            <div
              className="grid gap-2"
              style={{
                gridTemplateColumns: `repeat(${Math.min(Math.ceil(Math.sqrt(sessionCameras.length)), 4)}, minmax(0, 1fr))`,
              }}
            >
              {sessionCameras.map(sc => {
                const f = framesByCamera.get(sc.camera_id) ?? null;
                const stale = isStale(sc.camera_id);
                return (
                  <button
                    key={sc.camera_id}
                    type="button"
                    onClick={() => { setFocusedCameraId(sc.camera_id); setViewMode('focus'); }}
                    className="relative aspect-video bg-black/80 overflow-hidden rounded border border-border/50 text-left"
                  >
                    {f ? (
                      <img
                        src={`data:image/jpeg;base64,${f.jpeg_base64}`}
                        alt={sc.camera.label}
                        className="absolute inset-0 w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted-foreground">
                        no frame yet
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                      {sc.camera.label}{stale ? ' · stale' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : focusedFrame ? (
          <CameraViewport frame={focusedFrame} label={focusedLabel} stale={focusedStale} />
        ) : (
        <div className="flex-1 min-h-0 bg-black flex items-center justify-center relative">
          {state === 'connected' ? (
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
        )}
      </div>

      {/* Right column: cameras card (top) + incident feed (bottom) */}
      <div className="flex flex-col gap-4 min-h-0">
        {/* Cameras card */}
        <div className="rounded-lg border bg-card flex flex-col overflow-hidden shrink-0">
          <header className="border-b px-4 py-2 flex items-center gap-2 text-sm font-semibold">
            <Video size={14} className="text-muted-foreground" />
            Cameras
            <span className="text-xs font-normal text-muted-foreground">
              ({sessionCameras.length})
            </span>
            <Button size="sm" variant="ghost" className="h-6 ml-auto px-2" onClick={() => setPairOpen(true)} title="Pair phone camera">
              <Smartphone size={11} /> Pair
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setManageOpen(true)} title="Manage cameras">
              <Settings size={11} />
            </Button>
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
                stale={isStale(sc.camera_id)}
                onSelect={() => setFocusedCameraId(sc.camera_id)}
              />
            ))}
            <button
              type="button"
              onClick={() => setPairOpen(true)}
              className="w-full aspect-video rounded-md border-2 border-dashed border-border hover:border-primary/60 flex flex-col items-center justify-center text-xs text-muted-foreground hover:text-foreground transition"
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
                <IncidentCard key={inc.message_id} incident={inc} />
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
        onClose={() => { setPairOpen(false); setPendingCameraId(null); }}
        sessionId={session.id}
        onTokenIssued={(cameraId) => setPendingCameraId(cameraId)}
        externalConnected={Boolean(pendingCameraId && framesByCamera.has(pendingCameraId))}
        onConnected={async (cameraId) => {
          setFocusedCameraId(cameraId);
          await attachCamera(cameraId);
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
