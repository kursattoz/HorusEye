'use client';

// PRD-019 §6.1 — PC tarafı modal: telefon QR ile pair eder.
// Token 5dk geçerlidir; bağlantı kurulduğunda (telefon `connected`
// health-event POST'lar) otomatik kapanır.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PairTokenResponse {
  camera_id: string;
  token: string;
  pair_url: string;
  scan_window_seconds: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId?: string | null;
  defaultLabel?: string;
  /** Called once the phone has reported a 'connected' event. */
  onConnected?: (cameraId: string) => void;
  /** Parent learns the camera_id as soon as the pair-token is minted; lets
   * it observe the WS frame stream and trigger connect detection itself. */
  onTokenIssued?: (cameraId: string) => void;
  /** External "phone is connected" signal (e.g. parent saw a frame from
   * this camera over the detections WS). OR'd with internal polling. */
  externalConnected?: boolean;
}

const POLL_INTERVAL_MS = 2_000;

export function PhonePairModal({
  open, onClose, sessionId, defaultLabel,
  onConnected, onTokenIssued, externalConnected,
}: Props) {
  const [pair, setPair] = useState<PairTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [healthConnected, setHealthConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  const phoneConnected = healthConnected || Boolean(externalConnected);

  const onConnectedRef = useRef(onConnected);
  onConnectedRef.current = onConnected;
  const onTokenIssuedRef = useRef(onTokenIssued);
  onTokenIssuedRef.current = onTokenIssued;

  const requestToken = useCallback(async () => {
    setCreating(true);
    setError(null);
    setHealthConnected(false);
    try {
      const r = await fetch('/api/cameras/pair-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId ?? null,
          label: defaultLabel ?? '',
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'pair token request failed');
      setPair(d);
      setSecondsLeft(d.scan_window_seconds ?? 300);
      onTokenIssuedRef.current?.(d.camera_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setCreating(false);
    }
  }, [sessionId, defaultLabel]);

  // Auto-request on open
  useEffect(() => {
    if (open && !pair && !creating) {
      void requestToken();
    }
    if (!open) {
      setPair(null);
      setSecondsLeft(0);
      setHealthConnected(false);
      setError(null);
    }
  }, [open, pair, creating, requestToken]);

  // Countdown ticker
  useEffect(() => {
    if (!open || !pair || phoneConnected) return;
    const t = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1_000);
    return () => clearInterval(t);
  }, [open, pair, phoneConnected]);

  // Poll for connection (camera_health_events 'connected')
  useEffect(() => {
    if (!open || !pair || phoneConnected) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/cameras/${pair.camera_id}/health-events?limit=5`, { cache: 'no-store' });
        const d = await r.json();
        if (r.ok && Array.isArray(d.events)) {
          const isConnected = d.events.some((e: { event_type: string }) => e.event_type === 'connected');
          if (isConnected && !cancelled) {
            setHealthConnected(true);
            onConnectedRef.current?.(pair.camera_id);
          }
        }
      } catch { /* network blip — keep polling */ }
    };
    void poll();
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [open, pair, phoneConnected]);

  // External (frame-stream) connection signal — fire onConnected once when
  // the parent flips externalConnected to true. This is the resilient path
  // when the phone's health-event POST fails (CORS, expired token, etc.):
  // the WS frame stream is sufficient proof that pairing succeeded.
  const firedExternalRef = useRef(false);
  useEffect(() => {
    if (!open) { firedExternalRef.current = false; return; }
    if (!externalConnected || !pair || firedExternalRef.current) return;
    firedExternalRef.current = true;
    onConnectedRef.current?.(pair.camera_id);
  }, [open, externalConnected, pair]);

  // Once paired, auto-close after a short confirmation window so the proctor
  // can keep working without an extra click.
  useEffect(() => {
    if (!open || !phoneConnected) return;
    const t = setTimeout(() => onClose(), 1500);
    return () => clearTimeout(t);
  }, [open, phoneConnected, onClose]);

  async function handleCopy() {
    if (!pair) return;
    try {
      await navigator.clipboard.writeText(pair.pair_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch { /* clipboard blocked — silently no-op */ }
  }

  const expired = pair && secondsLeft === 0 && !phoneConnected;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone size={18} /> Pair phone camera
          </DialogTitle>
          <DialogDescription>
            Telefonun kamerasıyla QR kodu okutun. Tarayıcı izin isteyince Allow, ardından otomatik bağlanır.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        {creating && (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="animate-spin mr-2" size={16} /> Generating pair token…
          </div>
        )}

        {pair && !phoneConnected && (
          <div className="flex flex-col items-center gap-3">
            <div className={`p-3 rounded-lg bg-white ${expired ? 'opacity-40' : ''}`}>
              <QRCodeSVG value={pair.pair_url} size={196} level="M" />
            </div>
            <code className="text-[11px] break-all rounded bg-muted px-2 py-1 max-w-full">
              {pair.pair_url}
            </code>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={handleCopy}>
                <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
              </Button>
              {expired ? (
                <Button size="sm" onClick={requestToken}>
                  <RefreshCw size={12} /> Regenerate
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Awaiting phone… {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                </span>
              )}
            </div>
          </div>
        )}

        {phoneConnected && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Smartphone className="text-emerald-600" size={24} />
            </div>
            <p className="font-medium">Phone connected</p>
            <p className="text-sm text-muted-foreground">
              Camera kayıt edildi ve canlı yayına hazır.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{phoneConnected ? 'Done' : 'Close'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
