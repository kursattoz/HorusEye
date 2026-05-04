'use client';

// Modal that lists either the student pool or the team and lets the
// user pick a multi-selection to assign to a session.
// Used inside ExamDetail's SessionCard for both students (with optional
// seat number) and proctors (with role: proctor / chief_proctor).

import { useEffect, useMemo, useState } from 'react';
import { Search, Trash2, Loader2, Plus, X } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Student } from '@/types';

interface BasePerson {
  id: string;
  primary: string;     // e.g. student_id or full_name
  secondary?: string;  // e.g. full_name or email
}

interface AssignedRow {
  id:     string;            // assignment row id (session_students.id / session_proctors.id)
  personId: string;          // students.id / user_profiles.id
  primary: string;
  secondary?: string;
  meta?: { seat_number?: string | null; role?: string | null };
}

type Mode = 'students' | 'proctors';

interface Props {
  open:    boolean;
  onClose: () => void;
  sessionId: string;
  mode:    Mode;
  onAssigned?: () => void;
}

export function SessionAssignModal({ open, onClose, sessionId, mode, onAssigned }: Props) {
  const [pool, setPool]         = useState<BasePerson[]>([]);
  const [assigned, setAssigned] = useState<AssignedRow[]>([]);
  const [search, setSearch]     = useState('');
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [seatNumbers, setSeatNumbers] = useState<Record<string, string>>({});
  const [proctorRoles, setProctorRoles] = useState<Record<string, 'proctor' | 'chief_proctor'>>({});
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const [poolRes, assignRes] = await Promise.all([
        fetch(mode === 'students' ? '/api/students' : '/api/users', { cache: 'no-store' }),
        fetch(`/api/exam-sessions/${sessionId}`, { cache: 'no-store' }),
      ]);
      const poolData   = await poolRes.json();
      const assignData = await assignRes.json();
      if (!poolRes.ok)   throw new Error(poolData.error   ?? 'Failed to load pool');
      if (!assignRes.ok) throw new Error(assignData.error ?? 'Failed to load session');

      if (mode === 'students') {
        setPool((poolData.students as Student[] ?? []).map(s => ({
          id:        s.id,
          primary:   s.student_id,
          secondary: `${s.full_name}${s.department ? ' · ' + s.department : ''}`,
        })));
        setAssigned((assignData.students ?? []).map((row: { id: string; seat_number: string | null; students: Student }) => ({
          id:        row.id,
          personId:  row.students.id,
          primary:   row.students.student_id,
          secondary: row.students.full_name,
          meta:      { seat_number: row.seat_number },
        })));
      } else {
        const users = (poolData.users ?? []) as Array<{ id: string; full_name: string; email: string; is_active: boolean }>;
        setPool(users.filter(u => u.is_active).map(u => ({
          id:        u.id,
          primary:   u.full_name,
          secondary: u.email,
        })));
        setAssigned((assignData.proctors ?? []).map((row: { id: string; role: string; user_profiles: { id: string; full_name: string; email: string } }) => ({
          id:        row.id,
          personId:  row.user_profiles.id,
          primary:   row.user_profiles.full_name,
          secondary: row.user_profiles.email,
          meta:      { role: row.role },
        })));
      }
      setSelected({});
      setSeatNumbers({});
      setProctorRoles({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [open, sessionId, mode]);

  const assignedIds = useMemo(() => new Set(assigned.map(a => a.personId)), [assigned]);

  const filteredPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool
      .filter(p => !assignedIds.has(p.id))
      .filter(p => !q || p.primary.toLowerCase().includes(q) || (p.secondary ?? '').toLowerCase().includes(q));
  }, [pool, assignedIds, search]);

  const selectedIds = useMemo(() => Object.keys(selected).filter(id => selected[id]), [selected]);

  async function handleAssign() {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const url  = `/api/exam-sessions/${sessionId}/${mode}`;
      const body = mode === 'students'
        ? { students: selectedIds.map(id => ({ student_id: id, seat_number: seatNumbers[id] ?? null })) }
        : { proctors: selectedIds.map(id => ({ user_id: id, role: proctorRoles[id] ?? 'proctor' })) };
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Failed to assign');
      onAssigned?.();
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnassign(row: AssignedRow) {
    setError(null);
    try {
      const qs = mode === 'students'
        ? `student_id=${encodeURIComponent(row.personId)}`
        : `user_id=${encodeURIComponent(row.personId)}`;
      const res = await fetch(`/api/exam-sessions/${sessionId}/${mode}?${qs}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Failed to remove');
      }
      onAssigned?.();
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  }

  const title    = mode === 'students' ? 'Manage students' : 'Manage proctors';
  const desc     = mode === 'students'
    ? 'Pick students from the pool and (optionally) assign a seat number.'
    : 'Pick teammates and set proctor / chief_proctor for each.';
  const emptyMsg = mode === 'students'
    ? 'Pool empty — add students at /students first.'
    : 'No active team members found.';

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

        {/* Currently assigned */}
        <section className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Currently assigned ({assigned.length})
          </p>
          {assigned.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No one assigned yet.</p>
          ) : (
            <ul className="rounded-md border divide-y max-h-40 overflow-y-auto">
              {assigned.map(a => (
                <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                  <div>
                    <p className="font-medium">{a.primary}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.secondary}
                      {mode === 'students' && a.meta?.seat_number ? ` · seat ${a.meta.seat_number}` : ''}
                      {mode === 'proctors' && a.meta?.role        ? ` · ${a.meta.role}` : ''}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleUnassign(a)}>
                    <Trash2 size={13} className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pool to add from */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Add from pool ({filteredPool.length})
            </p>
            {selectedIds.length > 0 && (
              <span className="text-xs text-muted-foreground">{selectedIds.length} selected</span>
            )}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…" className="pl-9 h-8 text-sm" />
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground p-2 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" /> Loading…
            </p>
          ) : filteredPool.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{search ? 'No matches.' : emptyMsg}</p>
          ) : (
            <ul className="rounded-md border max-h-64 overflow-y-auto">
              {filteredPool.map(p => {
                const checked = !!selected[p.id];
                return (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm border-b last:border-b-0 hover:bg-muted/30">
                    <input type="checkbox" checked={checked}
                      onChange={e => setSelected(s => ({ ...s, [p.id]: e.target.checked }))}
                      className="h-4 w-4" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.primary}</p>
                      {p.secondary && <p className="text-xs text-muted-foreground truncate">{p.secondary}</p>}
                    </div>
                    {checked && mode === 'students' && (
                      <Input value={seatNumbers[p.id] ?? ''}
                        onChange={e => setSeatNumbers(s => ({ ...s, [p.id]: e.target.value }))}
                        placeholder="Seat" className="h-7 w-20 text-xs" />
                    )}
                    {checked && mode === 'proctors' && (
                      <select value={proctorRoles[p.id] ?? 'proctor'}
                        onChange={e => setProctorRoles(r => ({ ...r, [p.id]: e.target.value as 'proctor' | 'chief_proctor' }))}
                        className="h-7 rounded-md border bg-background px-1 text-xs"
                      >
                        <option value="proctor">proctor</option>
                        <option value="chief_proctor">chief_proctor</option>
                      </select>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}><X size={14} /> Close</Button>
          <Button onClick={handleAssign} disabled={selectedIds.length === 0 || submitting}>
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Assign {selectedIds.length || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
