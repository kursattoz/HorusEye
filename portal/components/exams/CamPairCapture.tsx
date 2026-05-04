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

type WsState = 'idle' | 'connecting' | 'open' | 'error' | 'closed';
type FacingMode = 'environment' | 'user';

export function CamPairCapture({ token, redeem }: Props) {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef     = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [facing, setFacing]       = useState<FacingMode>('environment');
  const [streaming, setStreaming] = useState(true);
  const [wsState, setWsState]     = useState<WsState>('idle');
  const [framesSent, setFramesSent] = useState(0);
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

  // ───── post connected event (best-effort) ─────────────────────────
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
      void postHealthEvent('connected', { ua: navigator.userAgent });
    };
    ws.onerror = () => setWsState('error');
    ws.onclose = () => setWsState('closed');
  }, [redeem, postHealthEvent]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- openWS sets wsState transitions via the WS event handlers
    if (streaming) openWS();
    return () => {
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
