'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';
import { FileText, ListChecks, Presentation, Paperclip, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/constants/routes';
import type { DeliverableStatus } from '@/types';

interface DeliverableRow {
  id: string;
  title: string;
  deliverable_number: string;
  deadline: string;
  status: DeliverableStatus;
  assigned_to: string | null;
  assignee_name: string | null;
  assignee_avatar: string | null;
  file_id: string | null;
  checklist_total: number;
  checklist_checked: number;
}

/* ── Category detection from title ─────────────────────────────────── */

type Category = 'report' | 'backlog' | 'special';

function detectCategory(title: string): Category {
  const t = title.toLowerCase();
  if (t.includes('todo') || t.includes('backlog')) return 'backlog';
  if (t.includes('presentation') || t.includes('demo') || t.includes('return')) return 'special';
  return 'report';
}

const CATEGORY_CONFIG: Record<Category, {
  icon: typeof FileText;
  label: string;
  border: string;
  badge: string;
  accent: string;
}> = {
  report: {
    icon: FileText,
    label: 'Report',
    border: 'border-blue-500/30',
    badge: 'bg-blue-500/10 text-blue-500',
    accent: 'bg-blue-500',
  },
  backlog: {
    icon: ListChecks,
    label: 'Backlog',
    border: 'border-amber-500/30',
    badge: 'bg-amber-500/10 text-amber-500',
    accent: 'bg-amber-500',
  },
  special: {
    icon: Presentation,
    label: 'Special',
    border: 'border-purple-500/30',
    badge: 'bg-purple-500/10 text-purple-500',
    accent: 'bg-purple-500',
  },
};

const STATUS_LABELS: Record<DeliverableStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const STATUS_COLORS: Record<DeliverableStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-primary/10 text-primary',
  completed: 'bg-green-500/10 text-green-600 dark:text-green-400',
};

/* ── Group deliverables by deadline week ──────────────────────────── */

interface WeekGroup {
  label: string;
  deadline: string;
  items: DeliverableRow[];
}

function groupByWeek(deliverables: DeliverableRow[]): WeekGroup[] {
  const map = new Map<string, DeliverableRow[]>();

  for (const d of deliverables) {
    const key = d.deadline;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }

  const groups: WeekGroup[] = [];
  let weekIdx = 1;
  for (const [deadline, items] of map) {
    const date = new Date(deadline);
    const formatted = date.toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
    groups.push({
      label: `Week ${weekIdx} — ${formatted}`,
      deadline,
      items,
    });
    weekIdx++;
  }

  return groups;
}

/* ── Avatar with image fallback ───────────────────────────────────── */

function UserAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const parts = (name || '?').trim().split(/\s+/);
  const first = parts[0] ?? '?';
  const last = parts[parts.length - 1] ?? '';
  const initials = parts.length >= 2
    ? `${first[0]}${last[0]}`
    : first.slice(0, 2);

  if (avatarUrl) {
    return (
      <Image
        src={avatarUrl}
        alt={name}
        width={24}
        height={24}
        className="size-6 rounded-full object-cover"
        title={name}
      />
    );
  }

  return (
    <span
      className="inline-flex items-center justify-center size-6 rounded-full bg-muted text-[10px] font-medium uppercase"
      title={name}
    >
      {initials}
    </span>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */

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
  const groups = groupByWeek(deliverables);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 min-[1920px]:grid-cols-3 gap-6">
      {groups.map(group => {
        const groupDeadline = new Date(group.deadline);
        const isGroupPast = groupDeadline < now;
        const allDone = group.items.every(d => d.status === 'completed');

        return (
          <section key={group.deadline}>
            {/* Week header */}
            <div className="flex items-center gap-3 mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{group.label}</h2>
              {allDone && (
                <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 text-[10px]">
                  All done
                </Badge>
              )}
              {isGroupPast && !allDone && (
                <Badge variant="destructive" className="text-[10px]">Overdue</Badge>
              )}
            </div>

            {/* Cards grid */}
            <div className="grid gap-3 sm:grid-cols-2">
              {group.items.map(d => {
                const category = detectCategory(d.title);
                const config = CATEGORY_CONFIG[category];
                const Icon = config.icon;
                const isPast = new Date(d.deadline) < now && d.status !== 'completed';
                const progress = d.checklist_total > 0
                  ? Math.round((d.checklist_checked / d.checklist_total) * 100)
                  : 0;

                return (
                  <button
                    key={d.id}
                    onClick={() => router.push(routes.reportDetail(d.id))}
                    className={cn(
                      'text-left border rounded-lg p-4 space-y-3 transition-all hover:bg-muted/50 hover:shadow-sm',
                      isPast ? 'border-destructive/50' : config.border,
                    )}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon size={15} className="shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-muted-foreground">{d.deliverable_number}</span>
                            <Badge className={cn('text-[9px] px-1.5 py-0', config.badge)}>
                              {config.label}
                            </Badge>
                          </div>
                          <h3 className="text-sm font-medium leading-tight truncate">{d.title}</h3>
                        </div>
                      </div>
                      <Badge className={cn('shrink-0 text-[10px]', STATUS_COLORS[d.status])}>
                        {STATUS_LABELS[d.status]}
                      </Badge>
                    </div>

                    {/* Deadline */}
                    <p className={cn('text-xs', isPast ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                      {isPast && 'OVERDUE — '}
                      {new Date(d.deadline).toLocaleDateString('tr-TR', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </p>

                    {/* Progress bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Checklist</span>
                        <span>{d.checklist_checked}/{d.checklist_total}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all duration-300',
                            d.status === 'completed' ? 'bg-green-500' : config.accent,
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer: assignee + file status */}
                    <div className="flex items-center justify-between pt-0.5">
                      {d.assignee_name ? (
                        <div className="flex items-center gap-1.5">
                          <UserAvatar name={d.assignee_name} avatarUrl={d.assignee_avatar} />
                          <span className="text-[11px] text-muted-foreground truncate max-w-[100px]">
                            {d.assignee_name}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground/50">
                          <User size={13} />
                          <span className="text-[11px]">Unassigned</span>
                        </div>
                      )}

                      {d.file_id ? (
                        <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                          <Paperclip size={12} />
                          <span className="text-[10px]">Uploaded</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground/40">
                          <Paperclip size={12} />
                          <span className="text-[10px]">No file</span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
