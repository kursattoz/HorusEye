'use client';

// BL-231 — Per-student charts: incident frequency over time + severity/type distribution.
// Pulls 90-day pre-aggregated data from GET /api/students/[id]/incidents.
import { useEffect, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DailyRow {
  date: string;
  total: number;
  low: number;
  medium: number;
  high: number;
  critical: number;
}

interface ByTypeRow {
  type: string;
  count: number;
}

interface ApiPayload {
  charts: { daily: DailyRow[]; by_type: ByTypeRow[] };
}

const SEVERITY_COLOR = {
  low:      '#60a5fa',
  medium:   '#fbbf24',
  high:     '#f97316',
  critical: '#ef4444',
} as const;

export function IncidentCharts({ studentUuid }: { studentUuid: string }) {
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [byType, setByType] = useState<ByTypeRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/students/${studentUuid}/incidents?limit=1&offset=0`)
      .then(async (r) => {
        const body = (await r.json()) as ApiPayload & { error?: string };
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setDaily(filled90d(body.charts.daily));
        setByType([...body.charts.by_type].sort((a, b) => b.count - a.count));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [studentUuid]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!loaded) return <div className="h-64 animate-pulse rounded-md border bg-muted/30" />;

  const allEmpty = daily.every((d) => d.total === 0) && byType.length === 0;
  if (allEmpty) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        Not enough data for charts. Charts populate as incidents accumulate over the 90-day window.
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Frequency over time</CardTitle>
          <p className="text-[11px] text-muted-foreground">Stacked by severity · last 90 days</p>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip
                  labelFormatter={(v: string) => new Date(v).toLocaleDateString()}
                  contentStyle={{ fontSize: 11 }}
                />
                <Area type="monotone" dataKey="low"      stackId="1" stroke={SEVERITY_COLOR.low}      fill={SEVERITY_COLOR.low}      fillOpacity={0.5} />
                <Area type="monotone" dataKey="medium"   stackId="1" stroke={SEVERITY_COLOR.medium}   fill={SEVERITY_COLOR.medium}   fillOpacity={0.5} />
                <Area type="monotone" dataKey="high"     stackId="1" stroke={SEVERITY_COLOR.high}     fill={SEVERITY_COLOR.high}     fillOpacity={0.6} />
                <Area type="monotone" dataKey="critical" stackId="1" stroke={SEVERITY_COLOR.critical} fill={SEVERITY_COLOR.critical} fillOpacity={0.7} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
            {(['low','medium','high','critical'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: SEVERITY_COLOR[s] }} />
                <span className="capitalize">{s}</span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">By incident type</CardTitle>
          <p className="text-[11px] text-muted-foreground">90-day totals</p>
        </CardHeader>
        <CardContent>
          {byType.length === 0 ? (
            <p className="text-xs text-muted-foreground">No incidents yet.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType} layout="vertical" margin={{ top: 4, right: 16, left: 24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" opacity={0.3} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="type"
                    tick={{ fontSize: 10 }}
                    width={110}
                    tickFormatter={(v: string) => v.replace(/_/g, ' ')}
                  />
                  <Tooltip contentStyle={{ fontSize: 11 }} formatter={(v: number) => [v, 'count']} />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Fill in zero rows for any missing days in the 90-day window so the area
// chart doesn't visually compress sparse data.
function filled90d(rows: DailyRow[]): DailyRow[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const out: DailyRow[] = [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push(byDate.get(key) ?? { date: key, total: 0, low: 0, medium: 0, high: 0, critical: 0 });
  }
  return out;
}
