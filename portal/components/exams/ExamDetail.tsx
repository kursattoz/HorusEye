'use client';

import { useEffect, useState } from 'react';
import { Plus, Users, GraduationCap, Camera as CameraIcon, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { ExamRoom, ExamSession, Student } from '@/types';

interface SessionExpanded extends ExamSession {
  exam_rooms?: { id: string; name: string; capacity: number | null; location: string | null };
}

interface ExamDetailProps {
  examId: string;
}

export function ExamDetail({ examId }: ExamDetailProps) {
  const [sessions, setSessions] = useState<SessionExpanded[]>([]);
  const [rooms, setRooms]       = useState<ExamRoom[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [adding, setAdding]     = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [examRes, roomsRes] = await Promise.all([
        fetch(`/api/exams/${examId}`),
        fetch('/api/exam-rooms'),
      ]);
      const examData  = await examRes.json();
      const roomsData = await roomsRes.json();
      if (!examRes.ok)  throw new Error(examData.error  ?? 'Failed to load exam');
      if (!roomsRes.ok) throw new Error(roomsData.error ?? 'Failed to load rooms');
      setSessions(examData.sessions ?? []);
      setRooms(roomsData.rooms ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [examId]);

  async function handleAddSession(roomId: string) {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/exam-sessions', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exam_id: examId, room_id: roomId, status: 'scheduled' }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to add session');
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm('Delete this session? All assignments are removed.')) return;
    const res = await fetch(`/api/exam-sessions/${sessionId}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? 'Delete failed');
      return;
    }
    void load();
  }

  // Rooms not yet in a session of this exam
  const usedRoomIds = new Set(sessions.map(s => s.room_id));
  const availableRooms = rooms.filter(r => !usedRoomIds.has(r.id));

  if (loading) return <p className="text-sm text-muted-foreground">Loading sessions…</p>;

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sessions</h2>
          {availableRooms.length > 0 && (
            <select
              onChange={e => { if (e.target.value) void handleAddSession(e.target.value); e.target.value = ''; }}
              disabled={adding}
              className="rounded-md border bg-background px-2 py-1 text-sm"
              defaultValue=""
            >
              <option value="" disabled>{adding ? 'Adding…' : '+ Add session'}</option>
              {availableRooms.map(r => (
                <option key={r.id} value={r.id}>{r.name}{r.capacity ? ` (cap. ${r.capacity})` : ''}</option>
              ))}
            </select>
          )}
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed p-6 text-center">
            No sessions yet. {availableRooms.length === 0 ? 'Register a room first.' : 'Add one above.'}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {sessions.map(s => (
              <SessionCard
                key={s.id}
                session={s}
                onDelete={() => handleDeleteSession(s.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SessionCard({ session, onDelete }: { session: SessionExpanded; onDelete: () => void }) {
  const [students, setStudents] = useState<Array<{ id: string; seat_number: string | null; students: Student }>>([]);
  const [proctors, setProctors] = useState<Array<{ id: string; role: string; user_profiles: { id: string; full_name: string; email: string } }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/exam-sessions/${session.id}`, { cache: 'no-store' });
      if (!res.ok || cancelled) return;
      const d = await res.json();
      if (cancelled) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-await async update
      setStudents(d.students ?? []);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- post-await async update
      setProctors(d.proctors ?? []);
    })();
    return () => { cancelled = true; };
  }, [session.id]);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{session.exam_rooms?.name ?? 'Unknown room'}</h3>
          <p className="text-xs text-muted-foreground">
            {session.exam_rooms?.capacity ? `Capacity ${session.exam_rooms.capacity}` : 'No capacity set'}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
          {session.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <Users size={14} className="mx-auto mb-1 text-muted-foreground" />
          <p className="font-semibold">{proctors.length}</p>
          <p className="text-muted-foreground">Proctor{proctors.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <GraduationCap size={14} className="mx-auto mb-1 text-muted-foreground" />
          <p className="font-semibold">{students.length}</p>
          <p className="text-muted-foreground">Student{students.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="rounded-md bg-muted/40 p-2 text-center">
          <CameraIcon size={14} className="mx-auto mb-1 text-muted-foreground" />
          <p className="font-semibold">—</p>
          <p className="text-muted-foreground">Cameras</p>
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 size={14} className="text-destructive" />
        </Button>
      </div>
    </div>
  );
}
