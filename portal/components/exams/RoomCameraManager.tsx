'use client';

// Per-room camera CRUD. Used inline inside an ExamRoomsAdmin card.
// PRD-013 §6.4. stream_url goes encrypted; UI never receives plaintext
// back, so the API redacts to rtsp://***@host:port form on every read.

import { useEffect, useState } from 'react';
import { Plus, Trash2, Camera as CameraIcon, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Camera, CameraRole, CameraType } from '@/types';

const ROLES: { value: CameraRole; label: string }[] = [
  { value: 'front_wide',  label: 'Front (wide)' },
  { value: 'front_close', label: 'Front (close)' },
  { value: 'rear_wide',   label: 'Rear (wide)' },
  { value: 'side_left',   label: 'Side (left)' },
  { value: 'side_right',  label: 'Side (right)' },
];

const TYPES: { value: CameraType; label: string }[] = [
  { value: 'ip_camera',  label: 'IP camera (RTSP)' },
  { value: 'phone',      label: 'Phone camera' },
  { value: 'usb_webcam', label: 'USB webcam' },
];

interface Props {
  roomId: string;
}

export function RoomCameraManager({ roomId }: Props) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [label, setLabel] = useState('');
  const [type, setType]   = useState<CameraType>('ip_camera');
  const [role, setRole]   = useState<CameraRole>('front_wide');
  const [streamUrl, setStreamUrl] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/cameras?room_id=${roomId}`, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed to load cameras');
      setCameras(d.cameras ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [roomId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/cameras', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          label: label.trim(),
          stream_url: streamUrl.trim(),
          camera_type: type,
          role,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to add camera');
      setLabel(''); setStreamUrl('');
      setAdding(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(c: Camera) {
    if (!confirm(`Deactivate camera "${c.label}"? Existing footage stays in storage.`)) return;
    const res = await fetch(`/api/cameras/${c.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Delete failed');
      return;
    }
    void load();
  }

  return (
    <div className="space-y-2 pt-2 border-t border-border/40">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Cameras ({loading ? '…' : cameras.length})
        </p>
        <Button size="sm" variant="ghost" onClick={() => setAdding(v => !v)}>
          <Plus size={12} /> {adding ? 'Cancel' : 'Add'}
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {adding && (
        <form onSubmit={handleAdd} className="rounded-md border bg-muted/40 p-2 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`cam-label-${roomId}`} className="text-[10px]">Label</Label>
              <Input id={`cam-label-${roomId}`} value={label} onChange={e => setLabel(e.target.value)}
                placeholder="CAM1-FRONT" required className="h-7 text-xs" />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`cam-role-${roomId}`} className="text-[10px]">Role</Label>
              <select id={`cam-role-${roomId}`} value={role}
                onChange={e => setRole(e.target.value as CameraRole)}
                className="w-full rounded-md border bg-background h-7 px-2 text-xs"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cam-type-${roomId}`} className="text-[10px]">Type</Label>
            <select id={`cam-type-${roomId}`} value={type}
              onChange={e => setType(e.target.value as CameraType)}
              className="w-full rounded-md border bg-background h-7 px-2 text-xs"
            >
              {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`cam-url-${roomId}`} className="text-[10px]">Stream URL (encrypted at rest)</Label>
            <Input id={`cam-url-${roomId}`} value={streamUrl} onChange={e => setStreamUrl(e.target.value)}
              placeholder="rtsp://user:pass@192.168.1.10:554/stream"
              required className="h-7 text-xs font-mono" />
          </div>
          <Button type="submit" size="sm" disabled={submitting} className="h-7">
            {submitting ? <Loader2 size={12} className="animate-spin" /> : 'Save camera'}
          </Button>
        </form>
      )}

      {!loading && cameras.length === 0 && !adding && (
        <p className="text-[11px] text-muted-foreground italic">No cameras registered.</p>
      )}

      {cameras.length > 0 && (
        <ul className="space-y-1 text-xs">
          {cameras.map(cam => (
            <li key={cam.id} className="flex items-start justify-between gap-2 rounded bg-muted/30 px-2 py-1.5">
              <div className="flex items-start gap-2 min-w-0">
                <CameraIcon size={12} className="mt-0.5 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{cam.label} <span className="text-muted-foreground font-normal">· {cam.role.replace('_','-')}</span></p>
                  <p className="text-[10px] font-mono text-muted-foreground truncate">{cam.stream_url}</p>
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleDelete(cam)} className="h-6 w-6 p-0 shrink-0">
                <Trash2 size={11} className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
