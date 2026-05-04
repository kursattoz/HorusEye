'use client';

// PRD-019 §6.3 — Oturuma kamera bağlama/ayırma modal'ı.
// Pool: oda fixed cam'leri + kullanıcının personal mobile + system mobile +
// "Pair new phone" CTA (PhonePairModal'ı açar).

import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, AlertTriangle, Smartphone, Camera as CameraIcon, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PhonePairModal } from './PhonePairModal';

interface CameraRow {
  id: string;
  room_id: string | null;
  label: string;
  camera_type: 'ip_camera' | 'phone' | 'usb_webcam';
  role: string;
  is_fixed: boolean;
  owner_user_id: string | null;
  device_id: string | null;
  last_seen_at: string | null;
  is_active: boolean;
}

interface SessionCameraEntry {
  id: string;
  session_id: string;
  camera_id: string;
  added_at: string;
  added_by: string | null;
  camera: CameraRow;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  sessionRoomId: string;
  currentUserId: string;
  onChange?: () => void;
}

export function SessionCameraAttach({ open, onClose, sessionId, sessionRoomId, currentUserId, onChange }: Props) {
  const [attached, setAttached] = useState<SessionCameraEntry[]>([]);
  const [pool, setPool] = useState<CameraRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [showPair, setShowPair] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [attachedRes, poolRes] = await Promise.all([
        fetch(`/api/exam-sessions/${sessionId}/cameras`, { cache: 'no-store' }),
        fetch('/api/cameras', { cache: 'no-store' }),
      ]);
      const attachedData = await attachedRes.json();
      const poolData = await poolRes.json();
      if (!attachedRes.ok) throw new Error(attachedData.error ?? 'failed to load attached cameras');
      if (!poolRes.ok) throw new Error(poolData.error ?? 'failed to load camera pool');
      setAttached(attachedData.session_cameras ?? []);
      setPool(poolData.cameras ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (open) void reload();
    if (!open) {
      setError(null);
      setConflict(null);
    }
  }, [open, reload]);

  async function handleAttach(cameraId: string) {
    setError(null);
    setConflict(null);
    try {
      const r = await fetch(`/api/exam-sessions/${sessionId}/cameras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ camera_id: cameraId }),
      });
      const d = await r.json();
      if (!r.ok) {
        if (r.status === 409) {
          setConflict(d.error ?? 'Conflict');
          return;
        }
        throw new Error(d.error ?? 'failed to attach');
      }
      await reload();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
  }

  async function handleDetach(cameraId: string) {
    setError(null);
    try {
      const r = await fetch(`/api/exam-sessions/${sessionId}/cameras?camera_id=${cameraId}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json();
        throw new Error(d.error ?? 'failed to detach');
      }
      await reload();
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    }
  }

  const attachedIds = new Set(attached.map(a => a.camera_id));
  const candidates = pool.filter(c => c.is_active && !attachedIds.has(c.id));

  const roomFixed = candidates.filter(c => c.is_fixed && c.room_id === sessionRoomId);
  const myPhones  = candidates.filter(c => !c.is_fixed && c.owner_user_id === currentUserId);
  const sysPhones = candidates.filter(c => !c.is_fixed && c.owner_user_id === null);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CameraIcon size={18} /> Session cameras
          </DialogTitle>
          <DialogDescription>
            Sabit oda kameraları otomatik önerilir; telefon kameraları aşağıdan eklenebilir.
          </DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {conflict && (
          <Alert variant="destructive">
            <AlertTriangle size={14} />
            <AlertDescription className="flex items-center justify-between gap-2">
              <span>{conflict}</span>
              <Button size="sm" variant="ghost" onClick={() => setConflict(null)}>
                <X size={12} />
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Attached ({attached.length})
          </h3>
          {loading ? (
            <p className="text-xs text-muted-foreground"><Loader2 className="inline animate-spin mr-1" size={12} /> Loading…</p>
          ) : attached.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Henüz kamera bağlı değil.</p>
          ) : (
            <ul className="space-y-1">
              {attached.map(sc => (
                <li key={sc.id} className="flex items-center justify-between rounded bg-muted/40 px-2 py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {sc.camera.camera_type === 'phone' ? <Smartphone size={12} /> : <CameraIcon size={12} />}
                    <span className="font-medium truncate">{sc.camera.label}</span>
                    <span className="text-muted-foreground text-[10px]">
                      {sc.camera.is_fixed ? 'fixed' : 'movable'} · {sc.camera.role.replace('_', '-')}
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleDetach(sc.camera_id)}>
                    <Trash2 size={11} className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add camera</h3>

          {roomFixed.length > 0 && (
            <CandidateGroup title="Room fixed cameras" cams={roomFixed} onPick={handleAttach} />
          )}
          {myPhones.length > 0 && (
            <CandidateGroup title="My phones" cams={myPhones} onPick={handleAttach} />
          )}
          {sysPhones.length > 0 && (
            <CandidateGroup title="System mobile cameras" cams={sysPhones} onPick={handleAttach} />
          )}

          <div>
            <Button variant="outline" size="sm" onClick={() => setShowPair(true)}>
              <Plus size={12} /> Pair new phone
            </Button>
          </div>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>

        <PhonePairModal
          open={showPair}
          onClose={() => setShowPair(false)}
          sessionId={sessionId}
          onConnected={async (cameraId) => {
            await handleAttach(cameraId);
            setShowPair(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function CandidateGroup({ title, cams, onPick }: {
  title: string;
  cams: CameraRow[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground">{title}</p>
      <ul className="space-y-1">
        {cams.map(c => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onPick(c.id)}
              className="w-full flex items-center justify-between rounded bg-muted/30 hover:bg-muted/60 transition px-2 py-1.5 text-xs text-left"
            >
              <span className="flex items-center gap-2 min-w-0">
                {c.camera_type === 'phone' ? <Smartphone size={12} /> : <CameraIcon size={12} />}
                <span className="font-medium truncate">{c.label}</span>
                <span className="text-muted-foreground text-[10px]">{c.role.replace('_', '-')}</span>
              </span>
              <Plus size={12} className="text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
