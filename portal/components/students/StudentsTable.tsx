'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Search, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { routes } from '@/constants/routes';
import { RiskBadge } from '@/components/students/RiskBadge';
import type { Student } from '@/types';

interface ImportResult {
  imported: number;
  updated:  number;
  skipped:  number;
  errors:   string[];
}

export function StudentsTable() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const [adding,   setAdding]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastImport, setLastImport] = useState<ImportResult | null>(null);
  const [, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New-student form fields
  const [newId,    setNewId]    = useState('');
  const [newName,  setNewName]  = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDept,  setNewDept]  = useState('');

  async function load(q?: string) {
    setLoading(true);
    setError(null);
    try {
      const url = q ? `/api/students?q=${encodeURIComponent(q)}` : '/api/students';
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load students');
      setStudents(data.students ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => {
      startTransition(() => { void load(search.trim() || undefined); });
    }, 300);
    return () => clearTimeout(id);
  }, [search]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch('/api/students', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: newId.trim(),
        full_name:  newName.trim(),
        email:      newEmail.trim() || undefined,
        department: newDept.trim()  || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to add student');
      return;
    }
    setNewId(''); setNewName(''); setNewEmail(''); setNewDept('');
    setAdding(false);
    void load(search.trim() || undefined);
  }

  async function handleDelete(s: Student) {
    if (!confirm(`Soft-delete student ${s.student_id} (${s.full_name})?`)) return;
    const res = await fetch(`/api/students/${s.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? 'Delete failed');
      return;
    }
    void load(search.trim() || undefined);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/students/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Import failed');
        return;
      }
      setLastImport(data);
      void load(search.trim() || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by ID, name, or email…"
            className="pl-9"
          />
        </div>
        <Button onClick={() => setAdding(v => !v)} variant="outline">
          <Plus size={16} /> Add student
        </Button>
        <Button
          onClick={() => fileInputRef.current?.click()}
          variant="outline"
          disabled={importing}
        >
          {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Import CSV
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleImport}
          className="hidden"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {lastImport && (
        <Alert>
          <AlertDescription>
            Import completed: {lastImport.imported} added, {lastImport.updated} updated, {lastImport.skipped} skipped.
            {lastImport.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs">{lastImport.errors.length} row error(s)</summary>
                <ul className="mt-1 list-disc list-inside text-xs space-y-0.5">
                  {lastImport.errors.slice(0, 10).map((er, i) => <li key={i}>{er}</li>)}
                </ul>
              </details>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Add form */}
      {adding && (
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-md border bg-card p-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Student ID *</label>
            <Input value={newId}    onChange={e => setNewId(e.target.value)}    placeholder="20210001" required className="w-32" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Full name *</label>
            <Input value={newName}  onChange={e => setNewName(e.target.value)}  placeholder="Ayşe Kaya"      required className="w-48" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Email</label>
            <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="ayse@tedu.edu.tr"        type="email" className="w-56" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Department</label>
            <Input value={newDept}  onChange={e => setNewDept(e.target.value)}  placeholder="CMPE"           className="w-32" />
          </div>
          <Button type="submit">Save</Button>
          <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
        </form>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : students.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {search ? 'No students match your search.' : 'No students yet. Add one or import a CSV.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Student ID</th>
                <th className="px-3 py-2 font-medium">Full name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Risk</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => (
                <tr
                  key={s.id}
                  className="border-t hover:bg-muted/30 cursor-pointer"
                  onClick={() => router.push(routes.studentDetail(s.id))}
                >
                  <td className="px-3 py-2 font-mono text-xs">{s.student_id}</td>
                  <td className="px-3 py-2 font-medium">{s.full_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.email ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.department ?? '—'}</td>
                  <td className="px-3 py-2">
                    <RiskBadge
                      level={s.risk_level}
                      score={s.risk_score}
                      trend={s.risk_trend}
                      hideLow
                    />
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(s)}
                      title="Soft-delete"
                    >
                      <Trash2 size={14} className="text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && students.length > 0 && (
        <p className="text-xs text-muted-foreground">{students.length} student{students.length !== 1 ? 's' : ''}</p>
      )}
    </div>
  );
}
