'use client';

// BL-225 / BL-224 — Risk score visualization card.
// Shows current score, level badge, trend arrow, and 30d-vs-prior comparison.
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export interface StudentRisk {
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  risk_trend: 'rising' | 'stable' | 'falling';
  incident_count: number;
  recent_count: number;
  prior_count: number;
  severity_breakdown: Record<string, number>;
}

const LEVEL_STYLES: Record<StudentRisk['risk_level'], { fg: string; bg: string; bar: string }> = {
  low:      { fg: 'text-emerald-700', bg: 'bg-emerald-100', bar: 'bg-emerald-500' },
  medium:   { fg: 'text-amber-700',   bg: 'bg-amber-100',   bar: 'bg-amber-500' },
  high:     { fg: 'text-orange-700',  bg: 'bg-orange-100',  bar: 'bg-orange-500' },
  critical: { fg: 'text-red-700',     bg: 'bg-red-100',     bar: 'bg-red-500' },
};

const SEVERITY_ORDER: Array<keyof typeof SEVERITY_COLOR> = ['low','medium','high','critical'];
const SEVERITY_COLOR = {
  low:      'bg-blue-400',
  medium:   'bg-amber-400',
  high:     'bg-orange-500',
  critical: 'bg-red-500',
} as const;

interface Props {
  risk: StudentRisk;
  updatedAt?: string | null;
  className?: string;
}

export function RiskScoreCard({ risk, updatedAt, className }: Props) {
  const level = LEVEL_STYLES[risk.risk_level];
  const pct = Math.min(100, Math.round(risk.risk_score * 100));
  const total = Math.max(1, risk.incident_count);
  const TrendIcon = risk.risk_trend === 'rising' ? TrendingUp : risk.risk_trend === 'falling' ? TrendingDown : Minus;
  const trendLabel = risk.risk_trend === 'rising' ? 'Rising' : risk.risk_trend === 'falling' ? 'Falling' : 'Stable';
  const trendTone =
    risk.risk_trend === 'rising' ? 'text-red-600'
    : risk.risk_trend === 'falling' ? 'text-emerald-600'
    : 'text-muted-foreground';

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-semibold">Risk score</CardTitle>
        <span className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${level.bg} ${level.fg}`}>
          {risk.risk_level}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <span className={`text-4xl font-bold tabular-nums ${level.fg}`}>
            {risk.risk_score.toFixed(2)}
          </span>
          <span className={`mb-1.5 inline-flex items-center gap-1 text-xs font-medium ${trendTone}`}>
            <TrendIcon size={14} />
            {trendLabel}
            {risk.risk_trend !== 'stable' && (
              <span className="text-muted-foreground">
                · {risk.recent_count} vs {risk.prior_count}
              </span>
            )}
          </span>
        </div>

        <div>
          <Progress value={pct} className="h-1.5" />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>0.00</span><span>0.25</span><span>0.50</span><span>0.75</span><span>1.00</span>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">
            Severity breakdown · {risk.incident_count} incident{risk.incident_count === 1 ? '' : 's'} (last 90 days)
          </p>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {SEVERITY_ORDER.map((sev) => {
              const c = risk.severity_breakdown[sev] ?? 0;
              const w = (c / total) * 100;
              if (w === 0) return null;
              return <div key={sev} className={SEVERITY_COLOR[sev]} style={{ width: `${w}%` }} />;
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
            {SEVERITY_ORDER.map((sev) => {
              const c = risk.severity_breakdown[sev] ?? 0;
              if (c === 0) return null;
              return (
                <span key={sev} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${SEVERITY_COLOR[sev]}`} />
                  <span className="capitalize">{sev}</span>
                  <span className="font-mono text-muted-foreground">{c}</span>
                </span>
              );
            })}
          </div>
        </div>

        {updatedAt && (
          <p className="text-[10px] text-muted-foreground">
            Updated {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
