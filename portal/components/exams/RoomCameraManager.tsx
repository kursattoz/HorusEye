'use client';

// Per-room camera CRUD. Used inline inside an ExamRoomsAdmin card.
// PRD-013 §6.4 + PRD-019 §6.5. Three add paths: IP camera (RTSP), phone
// (QR pair → PhonePairModal → camera record auto-created with room_id set
// for fixed install), USB webcam (enumerateDevices → local://device-{id}).
// stream_url goes encrypted; UI never receives plaintext back.

import { useEffect, useState } from 'react';
import { Trash2, Camera as CameraIcon, Loader2, Smartphone, Usb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Camera, CameraRole, CameraType } from '@/types';
import { PhonePairModal } from './PhonePairModal';

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

type AddMode = null | 'ip' | 'usb';

export function RoomCameraManager({ roomId }: Props) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [showPhonePair, setShowPhonePair] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [label, setLabel] = useState('');
  const [type, setType]   = useState<CameraType>('ip_camera');
  const [role, setRole]   = useState<CameraRole>('front_wide');
  const [streamUrl, setStreamUrl] = useState('');
  const [usbDevices, setUsbDevices] = useState<MediaDeviceInfo[]>([]);
  const [usbDeviceId, setUsbDeviceId] = useState<string>('');

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

  // Enumerate USB / built-in webcams when the user picks the USB tab. The
  // browser only returns labels after a getUserMedia grant, so we request a
  // throwaway stream first and stop it immediately.
  useEffect(() => {
    if (addMode !== 'usb') return;
    let cancelled = false;
    void (async () => {
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        probe.getTracks().forEach(t => t.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const cams = devices.filter(d => d.kind === 'videoinput');
        setUsbDevices(cams);
        if (cams[0]) {
          setUsbDeviceId(cams[0].deviceId);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'USB enumerate failed');
      }
    })();
    return () => { cancelled = true; };
  }, [addMode]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const finalStreamUrl = addMode === 'usb' && usbDeviceId
        ? `local://device-${usbDeviceId}`
        : streamUrl.trim();
      const finalType: CameraType = addMode === 'usb' ? 'usb_webcam' : type;
      const res = await fetch('/api/cameras', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          label: label.trim(),
          stream_url: finalStreamUrl,
          camera_type: finalType,
          role,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to add camera');
      setLabel(''); setStreamUrl(''); setUsbDeviceId('');
      setAddMode(null);
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
        {addMode ? (
          <Button size="sm" variant="ghost" onClick={() => setAddMode(null)}>Cancel</Button>
        ) : (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setAddMode('ip')} title="IP camera">
              <CameraIcon size={12} /> IP
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowPhonePair(true)} title="Pair phone camera">
              <Smartphone size={12} /> Phone
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAddMode('usb')} title="USB webcam">
              <Usb size={12} /> USB
            </Button>
          </div>
        )}
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {addMode && (
        <form onSubmit={handleAdd} className="rounded-md border bg-muted/40 p-2 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={`cam-label-${roomId}`} className="text-[10px]">Label</Label>
              <Input id={`cam-label-${roomId}`} value={label} onChange={e => setLabel(e.target.value)}
                placeholder={addMode === 'usb' ? 'WEBCAM-1' : 'CAM1-FRONT'} required className="h-7 text-xs" />
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
          {addMode === 'ip' && (
            <>
              <div className="space-y-1">
                <Label htmlFor={`cam-type-${roomId}`} className="text-[10px]">Type</Label>
                <select id={`cam-type-${roomId}`} value={type}
                  onChange={e => setType(e.target.value as CameraType)}
                  className="w-full rounded-md border bg-background h-7 px-2 text-xs"
                >
                  {TYPES.filter(t => t.value !== 'usb_webcam').map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`cam-url-${roomId}`} className="text-[10px]">Stream URL (encrypted at rest)</Label>
                <Input id={`cam-url-${roomId}`} value={streamUrl} onChange={e => setStreamUrl(e.target.value)}
                  placeholder="rtsp://user:pass@192.168.1.10:554/stream"
                  required className="h-7 text-xs font-mono" />
              </div>
            </>
          )}
          {addMode === 'usb' && (
            <div className="space-y-1">
              <Label htmlFor={`cam-usb-${roomId}`} className="text-[10px]">USB device</Label>
              <select id={`cam-usb-${roomId}`} value={usbDeviceId}
                onChange={e => setUsbDeviceId(e.target.value)}
                className="w-full rounded-md border bg-background h-7 px-2 text-xs"
                required
              >
                <option value="" disabled>Select a device…</option>
                {usbDevices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Device ${d.deviceId.slice(0, 8)}…`}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">
                Saved as <code className="font-mono">local://device-…</code>; AI service&apos;in tarayıcı tabanlı capture path&apos;i bu URL&apos;i tüketecek.
              </p>
            </div>
          )}
          <Button type="submit" size="sm" disabled={submitting} className="h-7">
            {submitting ? <Loader2 size={12} className="animate-spin" /> : 'Save camera'}
          </Button>
        </form>
      )}

      <PhonePairModal
        open={showPhonePair}
        onClose={() => setShowPhonePair(false)}
        defaultLabel={`Phone — Room ${roomId.slice(0, 6)}`}
        onConnected={() => {
          setShowPhonePair(false);
          void load();
        }}
      />

      {!loading && cameras.length === 0 && !addMode && (
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
