'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { ArrowLeft, Clock, Target, TrendingUp, User, Activity, Info } from 'lucide-react';
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { routes } from '@/constants/routes';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis,
} from 'recharts';

interface MemberStats {
  id: string;
  name: string;
  avatar_url: string | null;
  total: number;
  done: number;
  in_progress: number;
  estimated_hours: number;
  actual_hours: number;
  completion_rate: number;
  avg_cycle_hours: number | null;
}

interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

interface EpicStat {
  name: string;
  total: number;
  done: number;
  hours: number;
}

interface ActivityItem {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  hours_logged: number | null;
  created_at: string;
  user: { full_name: string } | null;
}

interface ReviewerStat {
  id: string;
  name: string;
  avatar_url: string | null;
  total_reviews: number;
  approved: number;
  changes_requested: number;
  avg_comment_length: number;
  with_screenshot: number;
  quality_score: number;
}

interface AnalyticsData {
  sprint: { name: string; start_date: string; end_date: string };
  summary: {
    total_items: number;
    done_items: number;
    total_estimated_hours: number;
    total_actual_hours: number;
    completed_estimated_hours: number;
    status_counts: Record<string, number>;
    priority_counts: Record<string, number>;
  };
  burndown: BurndownPoint[];
  members: MemberStats[];
  epics: EpicStat[];
  review_stats: ReviewerStat[];
  pending_reviews: Record<string, number>;
  recent_activity: ActivityItem[];
}

const burndownConfig = {
  ideal: { label: 'Ideal', color: '#a1a1aa' },
  remaining: { label: 'Remaining', color: 'var(--primary)' },
} satisfies ChartConfig;

const epicConfig = {
  done: { label: 'Done', color: '#22c55e' },
  total: { label: 'Total', color: 'var(--muted)' },
} satisfies ChartConfig;

const STATUS_COLORS: Record<string, string> = {
  backlog: '#a1a1aa',
  todo: '#f59e0b',
  in_progress: '#3b82f6',
  review: '#a855f7',
  done: '#22c55e',
};

export function SprintAnalytics({ sprintId }: { sprintId: string }) {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/sprints/${sprintId}/analytics`);
    if (res.ok) setData(await res.json());
  }, [sprintId]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { fetchData(); }, [fetchData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!data) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading analytics...</div>;
  }

  const { sprint, summary, burndown, members, epics, review_stats, pending_reviews, recent_activity } = data;
  const capacityPct = summary.total_estimated_hours > 0
    ? Math.round((summary.total_actual_hours / summary.total_estimated_hours) * 100)
    : 0;

  // Burndown analysis: compare today's actual remaining vs ideal
  const todayStr = new Date().toISOString().split('T')[0]!;
  const todayPoint = burndown.find(b => b.date === todayStr) ?? burndown[burndown.length - 1];
  const burndownDelta = todayPoint ? todayPoint.remaining - todayPoint.ideal : 0;
  // negative = ahead (less remaining than ideal), positive = behind
  const burndownStatus: { label: string; color: string; detail: string } =
    burndownDelta < -2
      ? { label: 'Ahead of schedule', color: 'text-green-500', detail: `${Math.abs(burndownDelta)} items ahead of ideal pace` }
      : burndownDelta > 2
        ? { label: 'Behind schedule', color: 'text-destructive', detail: `${burndownDelta} items behind ideal pace` }
        : { label: 'On track', color: 'text-primary', detail: 'Progress matches ideal pace' };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(routes.sprintDetail(sprintId))}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Sprint Analytics</h1>
          <p className="text-xs text-muted-foreground">{sprint.name}</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Target size={13} /> Progress
            </div>
            <p className="text-2xl font-bold">{summary.done_items}/{summary.total_items}</p>
            <p className="text-[11px] text-muted-foreground">{Math.round((summary.done_items / Math.max(summary.total_items, 1)) * 100)}% complete</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock size={13} /> Estimated
            </div>
            <p className="text-2xl font-bold">{summary.total_estimated_hours}h</p>
            <p className="text-[11px] text-muted-foreground">{summary.completed_estimated_hours}h completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp size={13} /> Actual
            </div>
            <p className="text-2xl font-bold">{summary.total_actual_hours}h</p>
            <p className="text-[11px] text-muted-foreground">{capacityPct}% of estimate used</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Activity size={13} /> Capacity
            </div>
            <p className={cn('text-2xl font-bold', summary.total_estimated_hours > 200 ? 'text-destructive' : '')}>
              {summary.total_estimated_hours}h
            </p>
            <p className="text-[11px] text-muted-foreground">
              {summary.total_estimated_hours > 200 ? 'Overloaded' : 'Within capacity'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Burndown + Status + Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Burndown */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">Burndown Chart</CardTitle>
                <span className={cn('text-xs font-semibold', burndownStatus.color)}>
                  — {burndownStatus.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">{burndownStatus.detail}</span>
                <TooltipProvider delayDuration={200}>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground transition-colors">
                        <Info size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-[280px] text-xs leading-relaxed">
                      <p className="font-medium mb-1">How to read this chart:</p>
                      <p><strong>Dashed line (Ideal)</strong> — Expected pace if items completed evenly across the sprint.</p>
                      <p><strong>Solid area (Remaining)</strong> — Actual remaining items over time.</p>
                      <p className="mt-1">If the solid line is <strong>above</strong> the dashed line, the sprint is behind schedule. If <strong>below</strong>, ahead of schedule.</p>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={burndownConfig} className="h-[250px] w-full">
              <AreaChart data={burndown} accessibilityLayer>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area type="monotone" dataKey="ideal" stroke="var(--color-ideal)" fill="transparent" strokeDasharray="5 5" />
                <Area type="monotone" dataKey="remaining" stroke="var(--color-remaining)" fill="var(--color-remaining)" fillOpacity={0.1} />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Status + Priority breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Status & Priority</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Status bars */}
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Status</p>
              {(['backlog', 'todo', 'in_progress', 'review', 'done'] as const).map(s => {
                const count = summary.status_counts[s] ?? 0;
                const pct = summary.total_items > 0 ? Math.round((count / summary.total_items) * 100) : 0;
                return (
                  <div key={s} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[s] }} />
                        <span className="text-muted-foreground">{s.replace('_', ' ')}</span>
                      </div>
                      <span className="font-medium">{count} <span className="text-muted-foreground/60">({pct}%)</span></span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: STATUS_COLORS[s] }} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Priority breakdown */}
            <div className="space-y-2">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Priority</p>
              {([
                { key: 'critical', color: '#ef4444', label: 'Critical' },
                { key: 'high', color: '#f97316', label: 'High' },
                { key: 'medium', color: '#3b82f6', label: 'Medium' },
                { key: 'low', color: '#a1a1aa', label: 'Low' },
              ] as const).map(p => {
                const count = summary.priority_counts[p.key] ?? 0;
                const pct = summary.total_items > 0 ? Math.round((count / summary.total_items) * 100) : 0;
                return (
                  <div key={p.key} className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="text-muted-foreground">{p.label}</span>
                    </div>
                    <span className="font-medium">{count}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Team Performance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <User size={14} /> Team Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.sort((a, b) => b.completion_rate - a.completion_rate).map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg border">
                {m.avatar_url ? (
                  <Image src={m.avatar_url} alt={m.name} width={32} height={32} className="size-8 rounded-full object-cover" />
                ) : (
                  <div className="size-8 rounded-full bg-muted flex items-center justify-center">
                    <User size={14} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    <span>{m.done}/{m.total} done</span>
                    <span>{m.in_progress} active</span>
                    {m.avg_cycle_hours && <span>~{m.avg_cycle_hours}h/task</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('text-lg font-bold', m.completion_rate === 100 ? 'text-green-500' : '')}>
                    {m.completion_rate}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {m.actual_hours}h / {m.estimated_hours}h
                  </p>
                </div>
                <div className="w-24 shrink-0 hidden sm:block">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${m.completion_rate}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Epics + Velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Epic breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Epic Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {epics.length > 0 ? (
              <ChartContainer config={epicConfig} className="h-[200px] w-full">
                <BarChart data={epics} layout="vertical" accessibilityLayer>
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="done" fill="var(--color-done)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">No epics defined. Add epic labels to backlog items.</p>
            )}
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {recent_activity.length > 0 ? recent_activity.map(a => (
                <div key={a.id} className="flex items-start gap-2 text-[11px]">
                  <div className={cn(
                    'size-1.5 rounded-full mt-1.5 shrink-0',
                    a.action === 'status_change' && a.to_status === 'done' ? 'bg-green-500' :
                    a.action === 'status_change' ? 'bg-blue-500' :
                    a.action === 'hours_logged' ? 'bg-amber-500' : 'bg-muted-foreground',
                  )} />
                  <div className="min-w-0">
                    <span className="font-medium">{(a.user as { full_name: string } | null)?.full_name ?? 'Unknown'}</span>
                    {' '}
                    {a.action === 'status_change' && (
                      <span>moved to <Badge variant="secondary" className="text-[9px] px-1 py-0">{a.to_status?.replace('_', ' ')}</Badge></span>
                    )}
                    {a.action === 'hours_logged' && <span>logged {a.hours_logged}h</span>}
                    {a.action === 'reassigned' && <span>reassigned task</span>}
                  </div>
                  <span className="text-muted-foreground/50 shrink-0 ml-auto">
                    {new Date(a.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Review Tracking */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity size={14} /> Review Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          {review_stats.length > 0 ? (
            <div className="space-y-3">
              {review_stats.sort((a, b) => b.quality_score - a.quality_score).map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border">
                  {r.avatar_url ? (
                    <Image src={r.avatar_url} alt={r.name} width={32} height={32} className="size-8 rounded-full object-cover" />
                  ) : (
                    <div className="size-8 rounded-full bg-muted flex items-center justify-center">
                      <User size={14} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                      <span>{r.total_reviews} reviews</span>
                      <span className="text-green-500">{r.approved} approved</span>
                      <span className="text-amber-500">{r.changes_requested} changes</span>
                      {r.with_screenshot > 0 && <span>{r.with_screenshot} with screenshot</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Quality</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            r.quality_score >= 70 ? 'bg-green-500' : r.quality_score >= 40 ? 'bg-amber-500' : 'bg-muted-foreground',
                          )}
                          style={{ width: `${r.quality_score}%` }}
                        />
                      </div>
                      <span className="text-xs font-bold">{r.quality_score}</span>
                    </div>
                  </div>
                  {(pending_reviews[r.id] ?? 0) > 0 && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {pending_reviews[r.id]} pending
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No reviews submitted yet. Reviews are recorded when items move to &quot;review&quot; status.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
