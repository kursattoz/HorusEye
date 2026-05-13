// BL-266 (Sprint 14) — /api/ai/datasets/[id]/export.
// PRD-017 §15: return a signed download URL for the dataset's storage
// path. The actual bytes live in the anonymized-training-frames bucket
// (private), so admins go through a short-lived signed URL instead of
// shipping the binary through the API.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { createClient } from '@/lib/supabase/server';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const SIGNED_URL_TTL_SECONDS = 5 * 60;  // 5 minutes — matches private-file convention.
const EXPORT_BUCKET          = 'anonymized-training-frames';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { data: dataset, error } = await auth.supabase
    .from('datasets')
    .select('id, name, version, storage_path, status')
    .eq('id', id)
    .maybeSingle();
  if (error)    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!dataset) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });

  if (dataset.status !== 'ready' && dataset.status !== 'merged' && dataset.status !== 'training') {
    return NextResponse.json(
      { error: `Dataset status '${dataset.status}' is not exportable yet` },
      { status: 409 },
    );
  }

  // Service-role client — admin RLS is already enforced above; we use
  // service role here only because storage.createSignedUrl needs it for
  // private buckets behind RLS.
  const service = await createClient({ serviceRole: true });
  const { data: signed, error: signErr } = await service
    .storage
    .from(EXPORT_BUCKET)
    .createSignedUrl(`${dataset.storage_path.replace(/\/$/, '')}/export.zip`, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message ?? 'Could not create signed URL' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    dataset_id: dataset.id,
    name:       dataset.name,
    version:    dataset.version,
    url:        signed.signedUrl,
    expires_in: SIGNED_URL_TTL_SECONDS,
    bucket:     EXPORT_BUCKET,
  });
}
