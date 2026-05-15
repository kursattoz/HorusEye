'use client';

// Plan §Demo — invisible publisher loop for a demo-video camera.
//
// When a session_cameras row references a camera with `demo_video_url`
// set, the LiveMonitor mounts one of these components per demo camera.
// It plays the looped MP4 in a hidden <video>, captures frames at 5 FPS
// via canvas, and pushes JPEGs to the AI service publish endpoint
// using the same shared api_key the LiveMonitor uses for its subscribe
// handshake. The proctor sees the demo footage in the tile with real
// AI overlays — no QR scan, no manual pair token, no extra tab.
//
// Renders nothing visible; only effects.

import { useEffect, useRef } from 'react';
import { AI_PROTOCOL_VERSION } from '@/types/ai';

interface Props {
  cameraId:   string;
  sessionId:  string;
  videoUrl:   string;
  wsBase:     string;       // ws[s]://host[:port] — no trailing /publish
  apiKey:     string;
}

const FRAME_INTERVAL_MS = 200;     // 5 FPS — matches config.target_fps
const JPEG_QUALITY      = 0.7;
const RECONNECT_DELAY_MS = 2000;

export function DemoCameraPublisher({ cameraId, sessionId, videoUrl, wsBase, apiKey }: Props) {
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef     = useRef<WebSocket | null>(null);
  const captureTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef       = useRef<boolean>(false);

  useEffect(() => {
    cancelledRef.current = false;
    if (!wsBase || !videoUrl) return;

    const video = videoRef.current;
    if (!video) return;

    // Set crossOrigin BEFORE src so the response is fetched with CORS
    // mode and canvas.drawImage doesn't taint the canvas.
    video.crossOrigin = 'anonymous';
    video.src         = videoUrl;
    video.loop        = true;
    video.muted       = true;
    video.playsInline = true;
    void video.play().catch(() => { /* autoplay race — re-tried by load events */ });

    const openWs = () => {
      if (cancelledRef.current) return;
      const url = `${wsBase.replace(/\/+$/, '')}/ws/sessions/${sessionId}/publish`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type:             'publish',
          protocol_version: AI_PROTOCOL_VERSION,
          api_key:          apiKey,
          session_id:       sessionId,
          camera_id:        cameraId,
        }));
      };

      ws.onclose = (ev) => {
        if (cancelledRef.current) return;
        if (ev.code === 1000)                return; // normal close
        if (ev.code >= 4000 && ev.code < 5000) return; // app-level auth fail
        scheduleReconnect();
      };

      ws.onerror = () => { /* surfaces via onclose */ };
    };

    const scheduleReconnect = () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        openWs();
      }, RECONNECT_DELAY_MS);
    };

    openWs();

    const tick = async () => {
      const canvas = canvasRef.current;
      const ws     = wsRef.current;
      if (!canvas || !video || !ws || ws.readyState !== WebSocket.OPEN) return;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      // Backpressure — drop frames when the socket can't drain (mirrors
      // the live phone capture path).
      if (ws.bufferedAmount > 250_000) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(b => resolve(b), 'image/jpeg', JPEG_QUALITY),
      );
      if (!blob) return;
      try {
        const buf = await blob.arrayBuffer();
        ws.send(buf);
      } catch { /* socket closed mid-flight */ }
    };

    captureTimerRef.current = setInterval(() => { void tick(); }, FRAME_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      if (captureTimerRef.current)   clearInterval(captureTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      captureTimerRef.current  = null;
      reconnectTimerRef.current = null;
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        try { wsRef.current.close(1000, 'demo-publisher-unmount'); } catch { /* noop */ }
      }
      wsRef.current = null;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, [cameraId, sessionId, videoUrl, wsBase, apiKey]);

  // Headless: a hidden <video> + <canvas> is enough; nothing user-visible.
  return (
    <div aria-hidden className="sr-only">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- silent loop, no track */}
      <video ref={videoRef} muted playsInline />
      <canvas ref={canvasRef} />
    </div>
  );
}
