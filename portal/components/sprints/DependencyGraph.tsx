'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, User, Ban, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/constants/routes';
import type { BacklogStatus, BacklogPriority } from '@/types';

interface DependencyItem {
  id: string;
  seq_id: number;
  title: string;
  status: BacklogStatus;
  priority: BacklogPriority;
  prd_id: string | null;
  blocked_by: string | null;
  assigned_to: string | null;
  assignee?: { full_name: string; avatar_url: string | null; dev_role: string | null } | null;
}

const STATUS_COLORS: Record<BacklogStatus, string> = {
  backlog: 'border-muted-foreground/30 bg-muted/30',
  todo: 'border-amber-500/40 bg-amber-500/5',
  in_progress: 'border-blue-500/40 bg-blue-500/5',
  review: 'border-purple-500/40 bg-purple-500/5',
  done: 'border-green-500/40 bg-green-500/5',
};

const STATUS_DOT: Record<BacklogStatus, string> = {
  backlog: 'bg-muted-foreground/50',
  todo: 'bg-amber-500',
  in_progress: 'bg-blue-500',
  review: 'bg-purple-500',
  done: 'bg-green-500',
};

const PRIORITY_BORDER: Record<BacklogPriority, string> = {
  critical: 'ring-red-500/30',
  high: 'ring-orange-500/20',
  medium: 'ring-transparent',
  low: 'ring-transparent',
};

export function DependencyGraph({ sprintId }: { sprintId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<DependencyItem[]>([]);
  const [sprintName, setSprintName] = useState('');

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/sprints/${sprintId}`);
    if (!res.ok) return;
    const data = await res.json();
    setSprintName(data.sprint?.name ?? '');
    setItems(data.items ?? []);
  }, [sprintId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchData(); }, [fetchData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Build dependency chains
  const blockerMap = new Map<string, DependencyItem>(); // id → item
  const dependentsMap = new Map<string, string[]>(); // blocker_id → [dependent_ids]
  const itemMap = new Map<string, DependencyItem>();

  for (const item of items) {
    itemMap.set(item.id, item);
    if (item.blocked_by) {
      blockerMap.set(item.id, item);
      const deps = dependentsMap.get(item.blocked_by) ?? [];
      deps.push(item.id);
      dependentsMap.set(item.blocked_by, deps);
    }
  }

  // Find root blockers (items that block others but aren't blocked themselves)
  const roots = new Set<string>();
  for (const blockerId of dependentsMap.keys()) {
    const blockerItem = itemMap.get(blockerId);
    if (blockerItem && !blockerItem.blocked_by) {
      roots.add(blockerId);
    }
  }

  // Items with no dependencies at all
  const independent = items.filter(i => !i.blocked_by && !dependentsMap.has(i.id));

  // Build chains from roots
  function buildChain(rootId: string): string[] {
    const chain: string[] = [rootId];
    const dependents = dependentsMap.get(rootId) ?? [];
    for (const depId of dependents) {
      chain.push(...buildChain(depId));
    }
    return chain;
  }

  const chains: string[][] = [];
  const visited = new Set<string>();
  for (const rootId of roots) {
    if (!visited.has(rootId)) {
      const chain = buildChain(rootId);
      chain.forEach(id => visited.add(id));
      chains.push(chain);
    }
  }

  // Orphan blocked items (blocker not in this sprint)
  const orphanBlocked = items.filter(i => i.blocked_by && !itemMap.has(i.blocked_by));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(routes.sprintDetail(sprintId))}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Dependencies</h1>
          <p className="text-xs text-muted-foreground">{sprintName}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground border rounded-lg p-3">
        {(['backlog', 'todo', 'in_progress', 'review', 'done'] as BacklogStatus[]).map(s => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', STATUS_DOT[s])} />
            {s.replace('_', ' ')}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <ArrowRight size={12} />
          blocks
        </span>
        <span className="flex items-center gap-1.5 text-destructive">
          <Ban size={11} />
          blocked
        </span>
      </div>

      {/* Dependency chains */}
      {chains.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground">Dependency Chains</h2>
          <div className="space-y-6">
            {chains.map((chain, ci) => (
              <div key={ci} className="flex items-start gap-0 overflow-x-auto pb-2">
                {chain.map((itemId, idx) => {
                  const item = itemMap.get(itemId);
                  if (!item) return null;
                  const isBlocker = dependentsMap.has(itemId);
                  const isBlocked = !!item.blocked_by && itemMap.get(item.blocked_by)?.status !== 'done';

                  return (
                    <div key={itemId} className="flex items-center shrink-0">
                      {idx > 0 && (
                        <div className="flex items-center px-1">
                          <div className={cn(
                            'w-8 h-px',
                            itemMap.get(chain[idx - 1]!)?.status === 'done' ? 'bg-green-500' : 'bg-muted-foreground/30',
                          )} />
                          <ArrowRight
                            size={12}
                            className={cn(
                              '-ml-1',
                              itemMap.get(chain[idx - 1]!)?.status === 'done' ? 'text-green-500' : 'text-muted-foreground/40',
                            )}
                          />
                        </div>
                      )}
                      <DepCard item={item} isBlocker={isBlocker} isBlocked={isBlocked} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Orphan blocked (blocker in another sprint) */}
      {orphanBlocked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Blocked by External Items</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {orphanBlocked.map(item => (
              <DepCard key={item.id} item={item} isBlocker={false} isBlocked />
            ))}
          </div>
        </section>
      )}

      {/* Independent items */}
      {independent.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Independent</h2>
            <Badge variant="secondary" className="text-[10px]">{independent.length}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {independent.map(item => (
              <DepCard key={item.id} item={item} isBlocker={false} isBlocked={false} mini />
            ))}
          </div>
        </section>
      )}

      {chains.length === 0 && orphanBlocked.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No dependencies configured in this sprint. All items are independent.
        </div>
      )}
    </div>
  );
}

/* ── Dependency Card ─────────────────────────────────────── */

function DepCard({
  item,
  isBlocker,
  isBlocked,
  mini = false,
}: {
  item: DependencyItem;
  isBlocker: boolean;
  isBlocked: boolean;
  mini?: boolean;
}) {
  const isDone = item.status === 'done';

  return (
    <div
      className={cn(
        'border rounded-lg transition-all',
        mini ? 'p-2' : 'p-3',
        mini ? 'w-full' : 'w-[220px]',
        STATUS_COLORS[item.status],
        (item.priority === 'critical' || item.priority === 'high') && `ring-1 ${PRIORITY_BORDER[item.priority]}`,
        isBlocked && !isDone && 'opacity-60',
      )}
    >
      {/* Status dot + title */}
      <div className="flex items-start gap-1.5">
        <span className={cn('size-2 rounded-full mt-1 shrink-0', STATUS_DOT[item.status])} />
        <div className="min-w-0 flex-1">
          <p className={cn(
            'font-medium leading-tight',
            mini ? 'text-[11px] line-clamp-1' : 'text-xs line-clamp-2',
            isDone && 'line-through text-muted-foreground',
          )}>
            {item.title}
          </p>
        </div>
        {isDone && <Check size={12} className="text-green-500 shrink-0 mt-0.5" />}
        {isBlocked && !isDone && <Ban size={11} className="text-destructive shrink-0 mt-0.5" />}
      </div>

      {/* Meta row */}
      {!mini && (
        <div className="flex items-center justify-between mt-2 gap-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] font-mono text-muted-foreground/70">BL-{item.seq_id}</span>
            {item.prd_id && (
              <span className="text-[9px] font-mono text-muted-foreground">{item.prd_id}</span>
            )}
            {isBlocker && (
              <Badge variant="outline" className="text-[8px] px-1 py-0 border-orange-500/30 text-orange-600">
                blocker
              </Badge>
            )}
          </div>
          {item.assignee && (
            <div className="flex items-center gap-1">
              {item.assignee.avatar_url ? (
                <Image src={item.assignee.avatar_url} alt="" width={14} height={14} className="size-3.5 rounded-full object-cover" />
              ) : (
                <User size={10} className="text-muted-foreground" />
              )}
              <span className="text-[9px] text-muted-foreground truncate max-w-[60px]">
                {item.assignee.full_name?.split(' ')[0]}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
