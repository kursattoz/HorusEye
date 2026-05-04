'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ClipboardList, CalendarDays, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { routes } from '@/constants/routes';
import type { Exam } from '@/types';

const STATUS_BADGE: Record<Exam['status'], string> = {
  draft:     'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  active:    'bg-green-500/10 text-green-600 dark:text-green-400',
  completed: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  cancelled: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export function ExamsList() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch('/api/exams')
      .then(r => r.json().then(d => ({ ok: r.ok, body: d })))
      .then(({ ok, body }) => {
        if (!ok) setError(body.error ?? 'Failed to load exams');
        else setExams(body.exams ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Network error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${exams.length} exam${exams.length !== 1 ? 's' : ''}`}
        </p>
        <Button asChild>
          <Link href={routes.examNew}>
            <Plus size={16} /> New exam
          </Link>
        </Button>
      </div>

      {error && (
        <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      {!loading && exams.length === 0 && !error && (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <h2 className="mt-4 text-lg font-semibold">No exams yet</h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            Create your first exam — pick rooms, assign proctors and students, then run AI proctoring during the session.
          </p>
          <Button asChild className="mt-4">
            <Link href={routes.examNew}><Plus size={16} /> Create first exam</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {exams.map(exam => (
          <Link
            key={exam.id}
            href={routes.examDetail(exam.id)}
            className="rounded-lg border bg-card p-4 hover:bg-accent/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold leading-tight">{exam.name}</h3>
              <span className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE[exam.status]}`}>
                {exam.status}
              </span>
            </div>
            {exam.course_code && (
              <p className="text-xs text-muted-foreground mt-1">{exam.course_code}</p>
            )}
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><CalendarDays size={12} />{exam.scheduled_date}</span>
              <span className="flex items-center gap-1"><Clock size={12} />{exam.scheduled_start.slice(0,5)}–{exam.scheduled_end.slice(0,5)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
