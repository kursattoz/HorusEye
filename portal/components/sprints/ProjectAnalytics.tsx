'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { MonthlyCalendar } from './MonthlyCalendar';
import { ArrowLeft, Clock, Target, TrendingUp, CalendarDays, User, FileCode2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/constants/routes';
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart';
import {
  Bar, BarChart, CartesianGrid, XAxis, YAxis,
} from 'recharts';

interface SprintStat {
  id: string; name: string; start_date: string; end_date: string; status: string;
  total: number; done: number; estimated_hours: number; actual_hours: number; progress: number;
}

interface MemberStat {
  id: string; name: string; avatar_url: string | null;
  total: number; done: number; in_progress: number; review_assigned: number;
  estimated_hours: number; actual_hours: number; completion_rate: number;
  sprint_breakdown: { sprint_id: string; sprint_name: string; total: number; done: number; estimated: number; actual: number }[];
}

interface PrdCoverage {
  prd_id: string; total: number; done: number; progress: number;
}

interface CalendarEvent {
  date: string; type: string; title: string; color: string;
}

interface ProjectData {
  summary: {
    total_items: number; done_items: number;
    total_estimated_hours: number; total_actual_hours: number;
    velocity_items_per_day: number; estimated_days_left: number | null;
    projected_end_date: string | null; deadline: string | null;
  };
  sprint_stats: SprintStat[];
  members: MemberStat[];
  prd_coverage: PrdCoverage[];
  calendar_events: CalendarEvent[];
}

const sprintChartConfig = {
  done: { label: 'Done', color: '#22c55e' },
  total: { label: 'Total', color: 'var(--muted)' },
} satisfies ChartConfig;

const SPRINT_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#22c55e'];

export function ProjectAnalytics() {
  const router = useRouter();
  const [data, setData] = useState<ProjectData | null>(null);

  useEffect(() => {
    fetch('/api/sprints/analytics', { cache: 'no-store' })
      .then(r => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading project analytics...</div>;
  }

  const { summary, sprint_stats, members, prd_coverage, calendar_events } = data;
  const progressPct = summary.total_items > 0 ? Math.round((summary.done_items / summary.total_items) * 100) : 0;
  const isOnTrack = summary.projected_end_date && summary.deadline ? summary.projected_end_date <= summary.deadline : null;


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(routes.sprints)}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Project Analytics</h1>
          <p className="text-xs text-muted-foreground">Cross-sprint overview, team performance, and timeline</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Target size={13} /> Progress</div>
            <p className="text-2xl font-bold">{progressPct}%</p>
            <p className="text-[11px] text-muted-foreground">{summary.done_items}/{summary.total_items} items done</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Clock size={13} /> Hours</div>
            <p className="text-2xl font-bold">{summary.total_estimated_hours}h</p>
            <p className="text-[11px] text-muted-foreground">{summary.total_actual_hours}h actual logged</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp size={13} /> Velocity</div>
            <p className="text-2xl font-bold">{summary.velocity_items_per_day}</p>
            <p className="text-[11px] text-muted-foreground">items/day</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CalendarDays size={13} /> Projected</div>
            <p className={cn('text-lg font-bold', isOnTrack === false && 'text-destructive', isOnTrack === true && 'text-green-500')}>
              {summary.projected_end_date
                ? new Date(summary.projected_end_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
                : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {summary.estimated_days_left ? `${summary.estimated_days_left} days left` : 'insufficient data'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><CalendarDays size={13} /> Deadline</div>
            <p className="text-lg font-bold">
              {summary.deadline ? new Date(summary.deadline).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '—'}
            </p>
            <p className={cn('text-[11px]', isOnTrack === false ? 'text-destructive' : 'text-green-500')}>
              {isOnTrack === true ? 'On track' : isOnTrack === false ? 'At risk' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Overall Project Progress</span>
          <span>{summary.done_items}/{summary.total_items}</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Project Calendar — full width */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><CalendarDays size={14} /> Project Calendar</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyCalendar events={calendar_events} />
        </CardContent>
      </Card>

      {/* Sprint comparison */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Sprint Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={sprintChartConfig} className="h-[250px] w-full">
            <BarChart data={sprint_stats} accessibilityLayer>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} tickFormatter={n => n.split('—')[0]?.trim() ?? n} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="done" fill="var(--color-done)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Team workload across sprints */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><User size={14} /> Team Workload by Sprint</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium text-muted-foreground">Member</th>
                  {sprint_stats.map((s, i) => (
                    <th key={s.id} className="text-center py-2 px-2 font-medium" style={{ color: SPRINT_COLORS[i % SPRINT_COLORS.length] }}>
                      {s.name.split('—')[0]?.trim()}
                    </th>
                  ))}
                  <th className="text-center py-2 px-2 font-medium text-muted-foreground">Total</th>
                  <th className="text-center py-2 px-2 font-medium text-muted-foreground">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {members.sort((a, b) => b.total - a.total).map(m => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        {m.avatar_url ? (
                          <Image src={m.avatar_url} alt="" width={20} height={20} className="size-5 rounded-full object-cover" />
                        ) : (
                          <User size={12} className="text-muted-foreground" />
                        )}
                        <span className="font-medium truncate max-w-[100px]">{m.name}</span>
                      </div>
                    </td>
                    {sprint_stats.map(s => {
                      const sb = m.sprint_breakdown.find(b => b.sprint_id === s.id);
                      return (
                        <td key={s.id} className="text-center py-2 px-2">
                          {sb ? (
                            <div>
                              <span className="font-medium">{sb.done}/{sb.total}</span>
                              <p className="text-[9px] text-muted-foreground">{sb.estimated}h</p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-2">
                      <span className={cn('font-bold', m.completion_rate === 100 && 'text-green-500')}>
                        {m.done}/{m.total}
                      </span>
                    </td>
                    <td className="text-center py-2 px-2 text-muted-foreground">{m.review_assigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* PRD Coverage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><FileCode2 size={14} /> PRD Coverage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            {prd_coverage.map(p => (
              <div key={p.prd_id} className="border rounded-lg p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium">{p.prd_id}</span>
                  <Badge
                    variant={p.progress === 100 ? 'default' : 'secondary'}
                    className={cn('text-[9px]', p.progress === 100 && 'bg-green-500')}
                  >
                    {p.progress}%
                  </Badge>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', p.progress === 100 ? 'bg-green-500' : 'bg-primary')}
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">{p.done}/{p.total} items</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
