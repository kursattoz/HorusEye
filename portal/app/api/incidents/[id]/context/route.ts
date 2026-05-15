// BL-238 — ±15s incident context (the "clip" view).
// The AI pipeline persists a single JPEG per incident, not a continuous
// frame buffer, so the "clip" is reconstructed as the strip of every
// OTHER incident from the same session within ±15s. Each entry returns
// its evidence path + a short-lived signed URL the UI can render
// directly.
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface Params { params: Promise<{ id: string }> }

const WINDOW_SECONDS = 15;
const SIGN_TTL_SECONDS = 5 * 60;

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: anchor, error: anchorErr } = await supabase
    .from('incidents')
    .select('id, session_id, occurred_at, evidence_paths')
    .eq('id', id)
    .maybeSingle();
  if (anchorErr) return NextResponse.json({ error: anchorErr.message }, { status: 500 });
  if (!anchor) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const anchorTs = new Date(anchor.occurred_at as string).getTime();
  const fromIso = new Date(anchorTs - WINDOW_SECONDS * 1000).toISOString();
  const toIso   = new Date(anchorTs + WINDOW_SECONDS * 1000).toISOString();

  const { data: neighbors, error: nErr } = await supabase
    .from('incidents')
    .select('id, occurred_at, incident_type, severity, evidence_paths, student_id, track_id')
    .eq('session_id', anchor.session_id)
    .gte('occurred_at', fromIso)
    .lte('occurred_at', toIso)
    .order('occurred_at', { ascending: true });
  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  const admin = await createClient({ serviceRole: true });

  interface NeighborRow {
    id: string;
    occurred_at: string;
    incident_type: string;
    severity: string;
    evidence_paths: string[];
    student_id: string | null;
    track_id: number | null;
  }
  const rows = (neighbors ?? []) as NeighborRow[];
  const items = await Promise.all(rows.map(async (n) => {
    const path = n.evidence_paths?.[0] ?? null;
    let signedUrl: string | null = null;
    if (path) {
      const { data: signed } = await admin.storage
        .from('incident-evidence')
        .createSignedUrl(path, SIGN_TTL_SECONDS);
      signedUrl = signed?.signedUrl ?? null;
    }
    return {
      id:             n.id,
      occurred_at:    n.occurred_at,
      delta_seconds:  (new Date(n.occurred_at).getTime() - anchorTs) / 1000,
      incident_type:  n.incident_type,
      severity:       n.severity,
      student_id:     n.student_id,
      track_id:       n.track_id,
      evidence_path:  path,
      signed_url:     signedUrl,
      is_anchor:      n.id === id,
    };
  }));

  return NextResponse.json({
    anchor_id:     id,
    window_seconds: WINDOW_SECONDS,
    items,
  });
}
