// BL-230 — Compact risk indicator for student tiles + tables.
// Sized variants: 'sm' (icon-only, table cells) and 'md' (icon + level label).
import { Shield, ShieldAlert, AlertTriangle, ShieldCheck } from 'lucide-react';
import type { RiskLevel, RiskTrend } from '@/types';

const LEVEL_STYLES: Record<RiskLevel, { fg: string; bg: string; icon: typeof Shield; label: string }> = {
  low:      { fg: 'text-emerald-700', bg: 'bg-emerald-100', icon: ShieldCheck,  label: 'Low'      },
  medium:   { fg: 'text-amber-700',   bg: 'bg-amber-100',   icon: Shield,       label: 'Medium'   },
  high:     { fg: 'text-orange-700',  bg: 'bg-orange-100',  icon: ShieldAlert,  label: 'High'     },
  critical: { fg: 'text-red-700',     bg: 'bg-red-100',     icon: AlertTriangle, label: 'Critical' },
};

interface Props {
  level: RiskLevel;
  score?: number;
  trend?: RiskTrend;
  size?: 'sm' | 'md';
  hideLow?: boolean;          // for tables — hide a badge when level is 'low'
  className?: string;
}

export function RiskBadge({ level, score, trend, size = 'md', hideLow, className }: Props) {
  if (hideLow && level === 'low') return null;
  const s = LEVEL_STYLES[level];
  const Icon = s.icon;
  const isSm = size === 'sm';

  const trendGlyph = trend === 'rising' ? '↑' : trend === 'falling' ? '↓' : null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide ${s.bg} ${s.fg} ${
        isSm ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      } ${className ?? ''}`}
      title={
        score !== undefined
          ? `Risk ${s.label} · score ${score.toFixed(2)}${trend ? ` · ${trend}` : ''}`
          : `Risk ${s.label}${trend ? ` · ${trend}` : ''}`
      }
    >
      <Icon size={isSm ? 10 : 12} />
      {!isSm && <span>{s.label}</span>}
      {trendGlyph && <span aria-hidden>{trendGlyph}</span>}
    </span>
  );
}
