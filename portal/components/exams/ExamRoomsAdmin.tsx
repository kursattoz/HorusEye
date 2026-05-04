'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ExamRoom } from '@/types';

export function ExamRoomsAdmin() {
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [location, setLocation] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/exam-rooms');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed to load rooms');
      setRooms(d.rooms ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch('/api/exam-rooms', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          capacity: capacity.trim() ? Number(capacity) : null,
          location: location.trim() || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed to add room');
      setName(''); setCapacity(''); setLocation('');
      setAdding(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeactivate(room: ExamRoom) {
    if (!confirm(`Deactivate room "${room.name}"? Existing sessions are preserved.`)) return;
    const r = await fetch(`/api/exam-rooms/${room.id}`, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json();
      setError(d.error ?? 'Delete failed');
      return;
    }
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${rooms.length} active room${rooms.length !== 1 ? 's' : ''}`}
        </p>
        <Button onClick={() => setAdding(v => !v)} variant={adding ? 'ghost' : 'default'}>
          <Plus size={16} /> {adding ? 'Cancel' : 'Add room'}
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {adding && (
        <form onSubmit={handleAdd} className="rounded-md border bg-card p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="room-name">Name *</Label>
              <Input id="room-name" value={name} onChange={e => setName(e.target.value)} placeholder="Lab A" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-cap">Capacity</Label>
              <Input id="room-cap" type="number" min="0" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="40" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="room-loc">Location</Label>
              <Input id="room-loc" value={location} onChange={e => setLocation(e.target.value)} placeholder="2nd floor" />
            </div>
          </div>
          <Button type="submit" disabled={submitting} size="sm">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
          </Button>
        </form>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map(room => (
          <div key={room.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-muted-foreground" />
                <h3 className="font-semibold">{room.name}</h3>
              </div>
              <Button size="sm" variant="ghost" onClick={() => handleDeactivate(room)} title="Deactivate">
                <Trash2 size={14} className="text-destructive" />
              </Button>
            </div>
            <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {room.capacity != null && <p>Capacity: {room.capacity}</p>}
              {room.location && <p>{room.location}</p>}
            </div>
          </div>
        ))}
      </div>

      {!loading && rooms.length === 0 && !error && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <MapPin className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <h2 className="mt-4 text-lg font-semibold">No rooms registered yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Add at least one room before creating an exam. Each session binds to a room and runs AI analysis on its cameras.
          </p>
        </div>
      )}
    </div>
  );
}
