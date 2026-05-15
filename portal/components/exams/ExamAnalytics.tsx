'use client';

// BL-243 — Cross-exam trends dashboard.
import { useEffect, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts';
import { AlertTriangle, Clock, Target, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ExamRow {
  id: string;
  name: string;
  scheduled_date: string | null;
  total: number;
  clean: number;
  suspicious: number;
  violation: number;
  pending: number;
}

interface MonthRow {
  month: string;
  total: number;
  violation: number;
  suspicious: number;
  clean: number;
  pending: number;
}

interface ApiPayload {
  window_days: number;
  totals: {
    incidents: number; violations: number; suspicious: number; clean: number; pending: number; decided: number;
  };
  avg_decision_hours: number | null;
  by_type: Array<{ type: string; count: number }>;
  by_month: MonthRow[];
  exams: ExamRow[];
}

const DECISION_COLORS = {
  violation:  '#dc2626',
  suspicious: '#d97706',
  clean:      '#059669',
  pending:    '#71717a',
} as const;

export function ExamAnalytics() {
  const [data, setData] = useState<ApiPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/exams/analytics')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        if (!cancelled) setData(body as ApiPayload);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm text-muted-foreground">Could not load: {error}</p>
      </div>
    );
  }

  if (!data) {
    return <div className="h-64 animate-pulse rounded-md border bg-muted/30" />;
  }

  const decidedPct = data.totals.incidents > 0
    ? Math.round((data.totals.decided / data.totals.incidents) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Exam analytics</h1>
        <p className="text-sm text-muted-foreground">
          Last {data.window_days} days · {data.exams.length} recent exam{data.exams.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryTile Icon={Target}     label="Incidents"             value={data.totals.incidents} />
        <SummaryTile Icon={AlertTriangle} label="Violations"          value={data.totals.violations} tone="red" />
        <SummaryTile Icon={TrendingUp}  label="Decided"               value={`${decidedPct}%`}     tone="emerald" sub={`${data.totals.decided}/${data.totals.incidents}`} />
        <SummaryTile Icon={Clock}       label="Avg decision latency" value={data.avg_decision_hours !== null ? `${data.avg_decision_hours.toFixed(1)}h` : '—'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Incidents per month — stacked by decision</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_month} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" opacity={0.3} />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip
                  cursor={{ fill: 'var(--accent)', opacity: 0.3 }}
                  contentStyle={{
                    fontSize:        11,
                    background:      'var(--popover)',
                    color:           'var(--popover-foreground)',
                    border:          '1px solid var(--border)',
                    borderRadius:    '0.5rem',
                    boxShadow:       '0 4px 12px rgb(0 0 0 / 0.10)',
                  }}
                  labelStyle={{ color: 'var(--popover-foreground)' }}
                  itemStyle={{ color: 'var(--popover-foreground)' }}
                />
                  <Bar dataKey="violation"  stackId="d" fill={DECISION_COLORS.violation}  radius={[0,0,0,0]} />
                  <Bar dataKey="suspicious" stackId="d" fill={DECISION_COLORS.suspicious} radius={[0,0,0,0]} />
                  <Bar dataKey="clean"      stackId="d" fill={DECISION_COLORS.clean}      radius={[0,0,0,0]} />
                  <Bar dataKey="pending"    stackId="d" fill={DECISION_COLORS.pending}    radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Legend />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">By incident type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.by_type.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 16, left: 24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" opacity={0.3} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 10 }} width={120}
                    tickFormatter={(v: string) => v.replace(/_/g, ' ')} />
                  <Tooltip
                  cursor={{ fill: 'var(--accent)', opacity: 0.3 }}
                  contentStyle={{
                    fontSize:        11,
                    background:      'var(--popover)',
                    color:           'var(--popover-foreground)',
                    border:          '1px solid var(--border)',
                    borderRadius:    '0.5rem',
                    boxShadow:       '0 4px 12px rgb(0 0 0 / 0.10)',
                  }}
                  labelStyle={{ color: 'var(--popover-foreground)' }}
                  itemStyle={{ color: 'var(--popover-foreground)' }}
                />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 2, 2, 0]}>
                    {data.by_type.slice(0, 10).map((_, i) => (
                      <Cell key={i} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Recent exams</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-2">Exam</th>
                <th className="p-2">Scheduled</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-right">Violations</th>
                <th className="p-2 text-right">Suspicious</th>
                <th className="p-2 text-right">Clean</th>
                <th className="p-2 text-right">Pending</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.exams.map((e) => (
                <tr key={e.id} className="hover:bg-muted/30">
                  <td className="p-2 font-medium">{e.name}</td>
                  <td className="p-2 text-xs text-muted-foreground">{e.scheduled_date ?? '—'}</td>
                  <td className="p-2 text-right tabular-nums">{e.total}</td>
                  <td className="p-2 text-right tabular-nums text-red-700 dark:text-red-400">{e.violation}</td>
                  <td className="p-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{e.suspicious}</td>
                  <td className="p-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{e.clean}</td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">{e.pending}</td>
                </tr>
              ))}
              {data.exams.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground text-sm">No exams in this window.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ Icon, label, value, sub, tone }: {
  Icon: typeof Target; label: string; value: number | string; sub?: string;
  tone?: 'red' | 'emerald';
}) {
  const toneCls = tone === 'red'     ? 'text-red-700 dark:text-red-400'
                : tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-400'
                :                      'text-foreground';
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={`text-2xl font-bold tabular-nums ${toneCls}`}>{value}</p>
          {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        </div>
        <Icon className="h-6 w-6 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
      {(['violation', 'suspicious', 'clean', 'pending'] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5 capitalize">
          <span className="h-2 w-2 rounded-full" style={{ background: DECISION_COLORS[k] }} />
          {k}
        </span>
      ))}
    </div>
  );
}
