'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { routes } from '@/constants/routes';
import type { DeliverableStatus } from '@/types';

interface DeliverableRow {
  id: string;
  title: string;
  deliverable_number: string;
  deadline: string;
  status: DeliverableStatus;
  assigned_to: string | null;
  checklist_total: number;
  checklist_checked: number;
}

const STATUS_COLORS: Record<DeliverableStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
};

const STATUS_LABELS: Record<DeliverableStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function ReportsList() {
  const router = useRouter();
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports')
      .then(res => res.json())
      .then(data => setDeliverables(data.deliverables ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading...</div>;
  }

  const now = new Date();

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {deliverables.map(d => {
        const deadline = new Date(d.deadline);
        const isPast = deadline < now && d.status !== 'completed';
        const progress = d.checklist_total > 0
          ? Math.round((d.checklist_checked / d.checklist_total) * 100)
          : 0;

        return (
          <button
            key={d.id}
            onClick={() => router.push(routes.reportDetail(d.id))}
            className={`text-left border rounded-lg p-4 space-y-3 transition-colors hover:bg-muted/50 ${
              isPast ? 'border-destructive/50' : ''
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] font-mono text-muted-foreground">{d.deliverable_number}</span>
                <h3 className="text-sm font-medium leading-tight">{d.title}</h3>
              </div>
              <Badge className={`shrink-0 text-[10px] ${STATUS_COLORS[d.status]}`}>
                {STATUS_LABELS[d.status]}
              </Badge>
            </div>

            {/* Deadline */}
            <p className={`text-xs ${isPast ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
              {isPast && 'OVERDUE — '}
              {deadline.toLocaleDateString('tr-TR', { year: 'numeric', month: 'short', day: 'numeric' })}
            </p>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Checklist</span>
                <span>{d.checklist_checked}/{d.checklist_total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    d.status === 'completed' ? 'bg-green-500' : 'bg-primary'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
