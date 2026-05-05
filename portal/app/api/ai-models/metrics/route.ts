// BL-208 (Sprint 9) — per-rule precision feedback from proctor decisions.
// Each incident is the AI's flag; the proctor's eventual decision is the
// ground truth. We aggregate over incidents.proctor_decision so the
// /settings/ai-thresholds panel (BL-209) can show ops which rules are
// most often confirmed vs. dismissed.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';

interface AggregateRow {
  incident_type:    string;
  total:            number;
  decided:          number;
  true_positive:    number;
  false_positive:   number;
  precision:        number | null;
}

const DECIDED_VIOLATION = ['violation', 'suspicious'];

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  const from      = url.searchParams.get('from');
  const to        = url.searchParams.get('to');

  let q = auth.supabase
    .from('incidents')
    .select('incident_type, proctor_decision');
  if (sessionId) q = q.eq('session_id', sessionId);
  if (from)      q = q.gte('occurred_at', from);
  if (to)        q = q.lte('occurred_at', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as Array<{ incident_type: string; proctor_decision: string | null }>;
  const buckets = new Map<string, AggregateRow>();
  for (const r of rows) {
    const t = r.incident_type;
    let agg = buckets.get(t);
    if (!agg) {
      agg = {
        incident_type:  t,
        total:          0,
        decided:        0,
        true_positive:  0,
        false_positive: 0,
        precision:      null,
      };
      buckets.set(t, agg);
    }
    agg.total += 1;
    if (r.proctor_decision !== null) {
      agg.decided += 1;
      if (DECIDED_VIOLATION.includes(r.proctor_decision)) {
        agg.true_positive += 1;
      } else if (r.proctor_decision === 'clean') {
        agg.false_positive += 1;
      }
    }
  }

  // Compute precision per row
  for (const agg of buckets.values()) {
    const denom = agg.true_positive + agg.false_positive;
    agg.precision = denom > 0 ? Number((agg.true_positive / denom).toFixed(3)) : null;
  }

  const metrics = Array.from(buckets.values()).sort((a, b) => b.total - a.total);
  return NextResponse.json({ metrics });
}
