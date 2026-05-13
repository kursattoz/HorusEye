'use client';

// PRD-019 §6.2 — Phone-tarafı capture: getUserMedia + canvas → JPEG → WS publish.
// Pair token (5 dk) Authorization Bearer olarak health-event POST'larında
// kullanılır — telefon Supabase auth'suz çalışır, ekibin kendi cihazına
// dokunmasını gerektirmez.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, RefreshCcw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface RedeemPayload {
  camera_id: string;
  session_id: string | null;
  owner_user_id: string;
  ws_publish_url: string | null;
  api_key: string;
  protocol_version: string;
}

interface Props {
  token: string;
  redeem: RedeemPayload;
}

const FRAME_INTERVAL_MS = 200;     // 5 FPS
const JPEG_QUALITY = 0.7;
// BL-253: exponential backoff schedule for auto-reconnect after WS close.
// 3 attempts at 1s / 2s / 4s; beyond that we leave the connection 'closed'
// and surface a manual Reconnect button to the user.
const RECONNECT_DELAYS_MS: readonly number[] = [1000, 2000, 4000];

type WsState = 'idle' | 'connecting' | 'open' | 'error' | 'closed';
type FacingMode = 'environment' | 'user';

export function CamPairCapture({ token, redeem }: Props) {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef     = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // BL-251: backpressure-skipped frame counter (BL-254 surfaces in debug overlay)
  const framesSkippedRef = useRef<number>(0);
  // BL-252: tracks whether streaming was active before tab went hidden so
  // resume on foreground doesn't override a user-initiated Pause.
  const wasStreamingBeforeHideRef = useRef<boolean>(false);
  // BL-253: auto-reconnect with exponential backoff
  const reconnectAttemptsRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamingRef = useRef<boolean>(true);
  const openWSRef = useRef<(() => void) | null>(null);

  const [facing, setFacing]       = useState<FacingMode>('environment');
  const [streaming, setStreaming] = useState(true);
  const [wsState, setWsState]     = useState<WsState>('idle');
  const [framesSent, setFramesSent] = useState(0);
  // BL-254: dev-only telemetry surfaces for debugging mobile reliability.
  const [framesSkipped, setFramesSkipped] = useState(0);
  const [bufferedAmountSample, setBufferedAmountSample] = useState(0);
  const [lastCloseCode, setLastCloseCode] = useState<number | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [permError, setPermError] = useState<string | null>(null);

  // ───── camera setup ──────────────────────────────────────────────
  const startCamera = useCallback(async (mode: FacingMode) => {
    setPermError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setPermError(e instanceof Error ? e.message : 'Camera permission denied');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- startCamera triggers async permError state via getUserMedia rejection
    void startCamera(facing);
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [facing, startCamera]);

  // ───── post health event (best-effort, Bearer pair-token auth) ────
  const postHealthEvent = useCallback(async (event_type: string, metadata?: Record<string, unknown>) => {
    try {
      await fetch(`/api/cameras/${redeem.camera_id}/health-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          event_type,
          session_id: redeem.session_id,
          metadata: metadata ?? null,
        }),
      });
    } catch { /* best-effort */ }
  }, [redeem.camera_id, redeem.session_id, token]);

  // ───── browser sağlık API'leri (PRD-019 §7) ─────────────────────
  // BL-252: Page Visibility + Page Lifecycle (freeze/resume on iOS Safari)
  // — pause capture when the tab is hidden so we don't leak frames into
  //   a frozen MediaStream and trip server idle timeout (15s).
  useEffect(() => {
    const onHide = () => {
      void postHealthEvent('app_backgrounded', { ts: Date.now() });
      setStreaming((prev) => {
        wasStreamingBeforeHideRef.current = prev;
        return false;
      });
    };
    const onShow = () => {
      void postHealthEvent('app_foregrounded', { ts: Date.now() });
      // Resume only if we paused due to hide — respect user-pressed Pause.
      if (wasStreamingBeforeHideRef.current) {
        setStreaming(true);
        wasStreamingBeforeHideRef.current = false;
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide();
      else onShow();
    };
    document.addEventListener('visibilitychange', onVis);
    // iOS Safari aggressively freezes background tabs; freeze/resume
    // are more reliable signals than visibilitychange there. Cast is
    // needed because they're not in the standard DocumentEventMap yet.
    document.addEventListener('freeze', onHide as EventListener);
    document.addEventListener('resume', onShow as EventListener);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('freeze', onHide as EventListener);
      document.removeEventListener('resume', onShow as EventListener);
    };
  }, [postHealthEvent]);

  // Battery API (Chrome/Safari, opsiyonel — Firefox'ta yok)
  useEffect(() => {
    interface BatteryManager extends EventTarget {
      level: number; charging: boolean;
    }
    type Nav = Navigator & { getBattery?: () => Promise<BatteryManager> };
    const nav = navigator as Nav;
    if (!nav.getBattery) return;

    let battery: BatteryManager | null = null;
    let cancelled = false;
    const onLevel = () => {
      if (!battery) return;
      const lvl = battery.level;
      if (lvl < 0.10) void postHealthEvent('critical_battery', { level: lvl });
      else if (lvl < 0.20) void postHealthEvent('low_battery', { level: lvl });
    };
    const onCharging = () => {
      if (battery?.charging) void postHealthEvent('charging', { level: battery.level });
    };
    void nav.getBattery().then(b => {
      if (cancelled) return;
      battery = b;
      b.addEventListener('levelchange', onLevel);
      b.addEventListener('chargingchange', onCharging);
      onLevel();
    });
    return () => {
      cancelled = true;
      battery?.removeEventListener('levelchange', onLevel);
      battery?.removeEventListener('chargingchange', onCharging);
    };
  }, [postHealthEvent]);

  // Orientation
  useEffect(() => {
    const onOrient = () => {
      const o = (typeof screen !== 'undefined' && 'orientation' in screen)
        ? (screen as Screen & { orientation?: { type: string } }).orientation?.type ?? 'unknown'
        : 'unknown';
      void postHealthEvent('orientation_changed', { orientation: o });
    };
    window.addEventListener('orientationchange', onOrient);
    return () => window.removeEventListener('orientationchange', onOrient);
  }, [postHealthEvent]);

  // Permission revoke
  useEffect(() => {
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return;
    let status: PermissionStatus | null = null;
    let cancelled = false;
    const onChange = () => {
      if (status?.state === 'denied') void postHealthEvent('permission_revoked', { ts: Date.now() });
    };
    void navigator.permissions.query({ name: 'camera' as PermissionName })
      .then(s => {
        if (cancelled) return;
        status = s;
        s.addEventListener('change', onChange);
      })
      .catch(() => { /* unsupported permission name */ });
    return () => {
      cancelled = true;
      status?.removeEventListener('change', onChange);
    };
  }, [postHealthEvent]);

  // Heartbeat: WS publish kanalı zaten 15s timeout ile disconnect tespit eder.
  // Burada sadece pingleri gönderiyoruz; WS açıkken her 5 saniyede bir.
  useEffect(() => {
    const t = setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() })); }
        catch { /* socket closed mid-flight */ }
      }
    }, 5_000);
    return () => clearInterval(t);
  }, []);

  // ───── WS publish ────────────────────────────────────────────────
  const openWS = useCallback(() => {
    if (!redeem.ws_publish_url) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return;

    setWsState('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(redeem.ws_publish_url);
    } catch {
      setWsState('error');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'publish',
        protocol_version: redeem.protocol_version,
        api_key: redeem.api_key,
        session_id: redeem.session_id,
        camera_id: redeem.camera_id,
      }));
      setWsState('open');
      // BL-253: successful (re)connect — clear attempt counter.
      reconnectAttemptsRef.current = 0;
      setReconnectAttempts(0); // BL-254 debug overlay
      setLastCloseCode(null);
      void postHealthEvent('connected', { ua: navigator.userAgent });
    };
    ws.onerror = () => setWsState('error');
    ws.onclose = (ev: CloseEvent) => {
      setWsState('closed');
      setLastCloseCode(ev.code); // BL-254 debug overlay
      void postHealthEvent('disconnected', {
        close_code: ev.code,
        close_reason: ev.reason,
      });
      // BL-253: auto-reconnect with exponential backoff (1s / 2s / 4s).
      // Only retry on abnormal closes when the user still wants to stream
      // and the tab is foreground; otherwise the BL-252 visibility resume
      // handles re-open.
      if (!streamingRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (ev.code === 1000) return; // normal close (server unsubscribe)
      if (ev.code >= 4000 && ev.code < 5000) return; // app-level (auth failed)

      const attempts = reconnectAttemptsRef.current;
      if (attempts >= RECONNECT_DELAYS_MS.length) {
        void postHealthEvent('reconnect_gave_up', {
          attempts,
          close_code: ev.code,
        });
        return;
      }
      const delay = RECONNECT_DELAYS_MS[attempts];
      void postHealthEvent('reconnect_scheduled', {
        attempt: attempts + 1,
        delay_ms: delay,
        close_code: ev.code,
      });
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        reconnectAttemptsRef.current = attempts + 1;
        setReconnectAttempts(attempts + 1); // BL-254 debug overlay
        openWSRef.current?.();
      }, delay);
    };
  }, [redeem, postHealthEvent]);

  // BL-253: keep openWSRef + streamingRef in sync so the onclose handler
  // (closed over older openWS reference) can fire fresh reconnect calls.
  useEffect(() => {
    openWSRef.current = openWS;
  }, [openWS]);
  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- openWS sets wsState transitions via the WS event handlers
    if (streaming) openWS();
    return () => {
      // BL-253: cancel any pending reconnect when the effect tears down.
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [streaming, openWS]);

  // ───── capture loop ──────────────────────────────────────────────
  useEffect(() => {
    if (!streaming) {
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
      return;
    }

    const tick = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ws = wsRef.current;
      if (!video || !canvas || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      // BL-252: setInterval guard — if the tab went hidden between when
      // this tick was scheduled and when it fired, skip. The useEffect
      // teardown will clear the interval shortly; this avoids any
      // intervening frame from leaking to a frozen MediaStream.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      // BL-251: bufferedAmount backpressure. Mobile WS send quota is
      // small (~256KB on iOS Safari / Chrome). Once exceeded the socket
      // closes silently with 1006 — which is exactly the production
      // pattern that drops mobile streams after ~10 frames (publish_handler.py:388
      // root-cause analysis). Skip the frame instead of queueing more.
      if (ws.bufferedAmount > 250_000) {
        framesSkippedRef.current += 1;
        // BL-254: surface to state at most every Nth skip so we don't
        // re-render on every backpressure event.
        if (framesSkippedRef.current % 5 === 0) {
          setFramesSkipped(framesSkippedRef.current);
        }
        return;
      }

      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITY));
      if (!blob) return;
      const buf = await blob.arrayBuffer();
      try {
        ws.send(buf);
        setFramesSent(n => n + 1);
      } catch { /* socket closed mid-flight */ }
    };

    captureTimerRef.current = setInterval(() => { void tick(); }, FRAME_INTERVAL_MS);
    return () => {
      if (captureTimerRef.current) clearInterval(captureTimerRef.current);
      captureTimerRef.current = null;
    };
  }, [streaming]);

  // BL-254: sample WS bufferedAmount at 1Hz for the dev overlay (avoids
  // re-rendering on every capture tick).
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const t = setInterval(() => {
      const ws = wsRef.current;
      setBufferedAmountSample(ws ? ws.bufferedAmount : 0);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col gap-3 max-w-md mx-auto">
      <div className="rounded-lg overflow-hidden bg-black aspect-video relative">
        <video ref={videoRef} muted autoPlay playsInline className="w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute top-2 left-2 flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
          <span className={`h-2 w-2 rounded-full ${
            wsState === 'open'       ? 'bg-emerald-400 animate-pulse'
            : wsState === 'connecting' ? 'bg-amber-400'
            : wsState === 'error'    ? 'bg-red-500'
            : 'bg-gray-400'
          }`} />
          <span>
            {wsState === 'open' ? `Streaming · ${framesSent} frames`
              : wsState === 'connecting' ? 'Connecting…'
              : wsState === 'error'    ? 'Connection error'
              : wsState === 'closed'   ? 'Disconnected'
              : 'Idle'}
          </span>
        </div>

        {/* BL-254: dev-only telemetry overlay. Hidden in production
            builds; field testers turning on a staging build see live
            counters for the BL-251/252/253 reliability signals. */}
        {process.env.NODE_ENV !== 'production' && (
          <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-white">
            <div>sent: {framesSent}</div>
            <div>skipped: {framesSkipped}</div>
            <div>buf: {Math.round(bufferedAmountSample / 1024)}KB</div>
            <div>retry: {reconnectAttempts}/{RECONNECT_DELAYS_MS.length}</div>
            {lastCloseCode !== null && (
              <div>last close: {lastCloseCode}</div>
            )}
          </div>
        )}
      </div>

      {permError && (
        <Alert variant="destructive">
          <AlertDescription>
            <span className="block font-medium mb-1">Kamera erişimi reddedildi</span>
            <span className="block text-xs">{permError}</span>
          </AlertDescription>
        </Alert>
      )}

      {!redeem.ws_publish_url && (
        <Alert>
          <AlertDescription className="text-xs">
            Bu kamera henüz bir oturuma bağlı değil. Pair tamam — proctor sayfasından oturuma bağlayın.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setFacing(f => f === 'environment' ? 'user' : 'environment')}>
          <RotateCcw size={14} /> Front/Back
        </Button>
        <Button variant={streaming ? 'default' : 'outline'} onClick={() => setStreaming(s => !s)}>
          <Camera size={14} /> {streaming ? 'Pause' : 'Resume'}
        </Button>
      </div>

      {wsState === 'error' && (
        <Button variant="outline" size="sm" onClick={openWS}>
          <RefreshCcw size={12} /> Reconnect
        </Button>
      )}

      <p className="text-[11px] text-center text-muted-foreground">
        Camera id <code className="font-mono">{redeem.camera_id.slice(0, 8)}…</code>
      </p>
    </div>
  );
}

export function CamPairCaptureLoading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-2 text-muted-foreground">
      <Loader2 className="animate-spin" size={20} />
      <p>Pair bilgisi alınıyor…</p>
    </div>
  );
}
