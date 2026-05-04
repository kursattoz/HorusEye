'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Radio, RadioTower, Wifi, WifiOff, Video, VideoOff,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AI_PROTOCOL_VERSION } from '@/types/ai';
import type { ServerMessage, ServerIncident, ServerStatus } from '@/types/ai';

type ConnectState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

interface LiveMonitorProps {
  examId:   string;
  session:  { id: string; status: string; exam_rooms?: { name: string } | null } | null;
  wsBase:   string;
}

export function LiveMonitor({ examId, session, wsBase }: LiveMonitorProps) {
  const [state, setState] = useState<ConnectState>('idle');
  const [incidents, setIncidents] = useState<ServerIncident[]>([]);
  const [statusMessages, setStatusMessages] = useState<ServerStatus[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!session) return;
    if (!wsBase) {
      setError('NEXT_PUBLIC_AI_SERVICE_WS_URL is not configured.');
      setState('error');
      return;
    }

    setState('connecting');

    // Note: API key auth is via the subscribe message. Browser cannot
    // safely hold a secret, so for live deploy this would proxy through
    // the portal server. For Phase A on-prem, the AI service is on the
    // same LAN and trusts the network boundary.
    const url = `${wsBase.replace(/\/$/, '')}/ws/sessions/${session.id}/detections`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        protocol_version: AI_PROTOCOL_VERSION,
        api_key: '', // Phase A on-prem; browsers proxy through portal in prod
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
          case 'error':
            setError(`AI service error: ${msg.message}`);
            break;
          case 'pong':
          case 'detection':
          case 'frame':
            // detections + frames go to the future video overlay (BL-118)
            break;
        }
      } catch {
        /* ignore non-JSON */
      }
    };

    ws.onclose = () => setState('closed');
    ws.onerror = () => setState('error');

    // Heartbeat ping every 25s
    const heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
      }
    }, 25_000);

    return () => {
      clearInterval(heartbeat);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', session_id: session.id }));
        ws.close();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [session, wsBase]);

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
      {/* Main: video placeholder */}
      <div className="rounded-lg border bg-card flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Video size={14} className="text-muted-foreground" />
            <span className="font-semibold">{session.exam_rooms?.name ?? 'Session'}</span>
            <span className="text-xs text-muted-foreground">· status: {session.status}</span>
          </div>
          <ConnectionBadge state={state} />
        </header>

        <div className="flex-1 flex items-center justify-center bg-muted/30 relative">
          {state === 'connected' ? (
            <div className="text-center text-sm text-muted-foreground">
              <RadioTower className="mx-auto h-12 w-12 text-primary/40 animate-pulse" />
              <p className="mt-4 font-medium text-foreground">Connected. Awaiting frames.</p>
              <p className="mt-1 text-xs">Live video overlay (BL-118) renders here once the AI pipeline pushes frames.</p>
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
              <p className="mt-2 text-xs">
                The AI service is deployed on-prem in Phase A. If you're testing locally, run{' '}
                <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">docker compose up</code>{' '}
                from <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">ai-service/</code>.
              </p>
              {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar: incident feed + status log */}
      <div className="rounded-lg border bg-card flex flex-col overflow-hidden">
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
    idle:        { label: 'Idle',        cls: 'bg-muted text-muted-foreground',        icon: WifiOff },
    connecting:  { label: 'Connecting',  cls: 'bg-blue-500/10 text-blue-600',          icon: Radio },
    connected:   { label: 'Live',        cls: 'bg-green-500/10 text-green-600',        icon: Wifi },
    closed:      { label: 'Disconnected', cls: 'bg-muted text-muted-foreground',       icon: WifiOff },
    error:       { label: 'Error',       cls: 'bg-red-500/10 text-red-600',            icon: WifiOff },
  };
  const { label, cls, icon: Icon } = cfg[state];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      <Icon size={10} /> {label}
    </span>
  );
}
