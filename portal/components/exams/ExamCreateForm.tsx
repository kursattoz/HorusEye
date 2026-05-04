'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { routes } from '@/constants/routes';
import type { ExamRoom } from '@/types';

interface SessionDraft { room_id: string }

export function ExamCreateForm() {
  const router = useRouter();
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('16:00');
  const [duration, setDuration] = useState(120);
  const [sessions, setSessions] = useState<SessionDraft[]>([]);

  useEffect(() => {
    void fetch('/api/exam-rooms')
      .then(r => r.json())
      .then(d => setRooms(d.rooms ?? []))
      .catch(() => setRooms([]))
      .finally(() => setRoomsLoading(false));
  }, []);

  function addSession() {
    setSessions(s => [...s, { room_id: rooms[0]?.id ?? '' }]);
  }

  function removeSession(idx: number) {
    setSessions(s => s.filter((_, i) => i !== idx));
  }

  function updateSessionRoom(idx: number, roomId: string) {
    setSessions(s => s.map((sess, i) => (i === idx ? { ...sess, room_id: roomId } : sess)));
  }

  // When start/end time changes, auto-derive duration
  useEffect(() => {
    if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) return;
    const [sh, sm] = startTime.split(':').map(Number) as [number, number];
    const [eh, em] = endTime.split(':').map(Number) as [number, number];
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins > 0 && mins <= 600) setDuration(mins);
  }, [startTime, endTime]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim())  return setError('Exam name is required.');
    if (!date)         return setError('Date is required.');
    if (!startTime || !endTime) return setError('Start and end time are required.');

    const sessionsWithRoom = sessions.filter(s => s.room_id);
    const seenRooms = new Set(sessionsWithRoom.map(s => s.room_id));
    if (seenRooms.size !== sessionsWithRoom.length) {
      return setError('Each session must use a distinct room.');
    }

    setSubmitting(true);
    try {
      // 1) Create the exam
      const examRes = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          course_code: courseCode.trim() || null,
          description: description.trim() || null,
          scheduled_date:  date,
          scheduled_start: startTime,
          scheduled_end:   endTime,
          duration_minutes: duration,
          status: 'scheduled',
        }),
      });
      const examData = await examRes.json();
      if (!examRes.ok) throw new Error(examData.error ?? 'Failed to create exam');

      const examId = examData.exam.id as string;

      // 2) Create each session
      for (const s of sessionsWithRoom) {
        const sRes = await fetch('/api/exam-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exam_id: examId, room_id: s.room_id, status: 'scheduled' }),
        });
        if (!sRes.ok) {
          const sData = await sRes.json();
          throw new Error(`Session creation failed: ${sData.error ?? 'unknown'}`);
        }
      }

      router.push(routes.examDetail(examId));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Section: basic info */}
      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Exam info</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ex-name">Exam name *</Label>
            <Input id="ex-name" value={name} onChange={e => setName(e.target.value)} placeholder="CMPE 492 Final Sınavı" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-code">Course code</Label>
            <Input id="ex-code" value={courseCode} onChange={e => setCourseCode(e.target.value)} placeholder="CMPE 492" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-date">Date *</Label>
            <Input id="ex-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-start">Start time *</Label>
            <Input id="ex-start" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ex-end">End time *</Label>
            <Input id="ex-end" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ex-desc">Description</Label>
            <Input id="ex-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Senior Project Final" />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Auto-derived duration: <strong>{duration} min</strong>
        </p>
      </section>

      {/* Section: sessions */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Sessions (one per room)</h2>
          <Button type="button" variant="outline" size="sm" onClick={addSession} disabled={roomsLoading || rooms.length === 0}>
            <Plus size={14} /> Add session
          </Button>
        </div>

        {rooms.length === 0 && !roomsLoading && (
          <Alert>
            <AlertDescription>
              No rooms registered yet. <Link href="/exam-rooms" className="underline font-medium">Add a room</Link> first; sessions need a room to bind to.
            </AlertDescription>
          </Alert>
        )}

        {sessions.length === 0 ? (
          <p className="text-xs text-muted-foreground">No sessions yet. You can add them after creating the exam, or now if at least one room exists.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border bg-card p-3">
                <Label className="text-xs">Room</Label>
                <select
                  value={s.room_id}
                  onChange={e => updateSessionRoom(i, e.target.value)}
                  className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
                >
                  <option value="" disabled>— pick a room —</option>
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>{r.name}{r.capacity ? ` (cap. ${r.capacity})` : ''}</option>
                  ))}
                </select>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeSession(i)} title="Remove">
                  <Trash2 size={14} className="text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Proctors and students are assigned in the exam detail page after creation.
        </p>
      </section>

      {error && (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Create exam
        </Button>
        <Button type="button" variant="ghost" asChild>
          <Link href={routes.exams}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
