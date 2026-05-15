'use client';

// BL-235 — Post-exam decision view. Wraps ExamReviewQueue with header,
// session-strip filter, and a (BL-237) bulk-decision callback.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExamReviewQueue } from '@/components/exams/ExamReviewQueue';
import { routes } from '@/constants/routes';
import type { ProctorDecision } from '@/types';

interface Exam { id: string; name: string; scheduled_date: string | null }
interface Session {
  id: string;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  exam_rooms: { id: string; name: string } | null;
}

interface Props {
  exam: Exam;
  sessions: Session[];
}

export function ExamReview({ exam, sessions }: Props) {
  const [activeSessionId, setActiveSessionId] = useState<string | 'all'>('all');

  const filteredSessionIds = useMemo(
    () => (activeSessionId === 'all' ? sessions.map((s) => s.id) : [activeSessionId]),
    [activeSessionId, sessions],
  );

  const handleBulk = async (incidentIds: string[], decision: ProctorDecision) => {
    if (incidentIds.length === 0) return;
    const res = await fetch('/api/incidents/bulk-decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incident_ids: incidentIds, decision }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={routes.examDetail(exam.id)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft size={14} /> {exam.name}
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight inline-flex items-center gap-2">
            <ClipboardCheck size={20} /> Post-exam review
          </h1>
          <p className="text-sm text-muted-foreground">
            Walk every incident and mark clean / suspicious / violation. Decisions feed the report (BL-239) and audit (BL-241).
          </p>
        </div>
      </div>

      {sessions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Session:</span>
          <Button size="sm" variant={activeSessionId === 'all' ? 'default' : 'outline'} onClick={() => setActiveSessionId('all')}>
            All ({sessions.length})
          </Button>
          {sessions.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={activeSessionId === s.id ? 'default' : 'outline'}
              onClick={() => setActiveSessionId(s.id)}
              title={s.started_at ? new Date(s.started_at).toLocaleString() : undefined}
            >
              {s.exam_rooms?.name ?? 'Room ?'}
            </Button>
          ))}
        </div>
      )}

      <ExamReviewQueue sessionIds={filteredSessionIds} onBulkDecide={handleBulk} />
    </div>
  );
}
