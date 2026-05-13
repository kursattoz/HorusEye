'use client';

// BL-316 (Sprint 18) — Camera Overlap Zones admin panel.
// Admin-only — gated by the proxy via ADMIN_ONLY_ROUTES.

import { useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

interface OverlapZone {
  id:          string;
  camera_a_id: string;
  camera_b_id: string;
  label:       string | null;
  confidence:  number;
  created_at:  string;
}

interface CameraLite {
  id:    string;
  label: string;
}

export function OverlapZonesAdmin() {
  const [zones, setZones]       = useState<OverlapZone[]>([]);
  const [cameras, setCameras]   = useState<CameraLite[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cameraA, setCameraA]   = useState('');
  const [cameraB, setCameraB]   = useState('');
  const [label, setLabel]       = useState('');
  const [confidence, setConfidence] = useState('0.8');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [zoneRes, camRes] = await Promise.all([
        fetch('/api/cameras/overlap-zones', { cache: 'no-store' }),
        fetch('/api/cameras', { cache: 'no-store' }),
      ]);
      const zoneData = await zoneRes.json();
      const camData  = await camRes.json();
      if (!zoneRes.ok) throw new Error(zoneData.error ?? 'Failed to load zones');
      if (!camRes.ok)  throw new Error(camData.error  ?? 'Failed to load cameras');
      setZones((zoneData.overlap_zones ?? []) as OverlapZone[]);
      setCameras((camData.cameras ?? []) as CameraLite[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/cameras/overlap-zones', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          camera_a_id: cameraA,
          camera_b_id: cameraB,
          label:       label.trim() || null,
          confidence:  Number(confidence) || 0.8,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Create failed');
      setCameraA(''); setCameraB(''); setLabel(''); setConfidence('0.8');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this overlap zone?')) return;
    try {
      const r = await fetch(`/api/cameras/overlap-zones/${id}`, { method: 'DELETE' });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? 'Delete failed');
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }

  const cameraLabel = (id: string) => cameras.find(c => c.id === id)?.label ?? id.slice(0, 8);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add overlap zone</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label htmlFor="cam-a">Camera A</Label>
              <Select value={cameraA} onValueChange={setCameraA}>
                <SelectTrigger id="cam-a" className="w-full"><SelectValue placeholder="pick…" /></SelectTrigger>
                <SelectContent>
                  {cameras.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="cam-b">Camera B</Label>
              <Select value={cameraB} onValueChange={setCameraB}>
                <SelectTrigger id="cam-b" className="w-full"><SelectValue placeholder="pick…" /></SelectTrigger>
                <SelectContent>
                  {cameras.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ov-label">Label (optional)</Label>
              <Input id="ov-label" value={label} onChange={e => setLabel(e.target.value)} placeholder="door-side" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ov-conf">Confidence</Label>
              <Input id="ov-conf" type="number" step="0.05" min="0" max="1"
                     value={confidence} onChange={e => setConfidence(e.target.value)} />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" disabled={submitting || !cameraA || !cameraB || cameraA === cameraB}>
                {submitting ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
                Add zone
              </Button>
            </div>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Declared overlap zones</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className="mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Loading&hellip;
            </div>
          ) : zones.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No overlap zones declared yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Camera A</TableHead>
                  <TableHead>Camera B</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Confidence</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map(z => (
                  <TableRow key={z.id}>
                    <TableCell>{cameraLabel(z.camera_a_id)}</TableCell>
                    <TableCell>{cameraLabel(z.camera_b_id)}</TableCell>
                    <TableCell>{z.label ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{z.confidence.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => void handleDelete(z.id)}>
                        <Trash2 size={14} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
