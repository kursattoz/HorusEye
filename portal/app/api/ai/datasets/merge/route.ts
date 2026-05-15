// BL-266 (Sprint 14) — /api/ai/datasets/merge.
// PRD-017 §15: register a merged dataset spanning multiple parents. The
// heavy lifting (file IO, class mapping, stratified split) is handled by
// scripts/merge_datasets.py — this endpoint just records the result so
// the admin UI (BL-267) can list it.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { logDatasetEvent } from '@/lib/audit/dataset';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

interface MergeBody {
  name?:           string;
  version?:        string;
  source_ids?:     string[];      // parent dataset UUIDs
  target_classes?: string[];
  storage_path?:   string;        // e.g. 'data/merged/v1_earbuds_phone/'
  split_counts?:   Record<string, number>;
  class_counts?:   Record<string, number>;
  quality_report?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as MergeBody | null;
  if (!body?.name?.trim() || !body.storage_path?.trim() ||
      !Array.isArray(body.source_ids) || body.source_ids.length < 2 ||
      !Array.isArray(body.target_classes) || body.target_classes.length === 0) {
    return NextResponse.json(
      { error: 'name, storage_path, source_ids (>=2), target_classes are required' },
      { status: 400 },
    );
  }

  // Verify every parent exists. PRD-017 §15: merge inputs must resolve;
  // missing rows mean the caller built the corpus from a stale UI snapshot.
  const { data: parents, error: parentErr } = await auth.supabase
    .from('datasets')
    .select('id, status')
    .in('id', body.source_ids);
  if (parentErr) {
    return NextResponse.json({ error: parentErr.message }, { status: 500 });
  }
  if (!parents || parents.length !== body.source_ids.length) {
    const found = new Set((parents ?? []).map(p => p.id));
    const missing = body.source_ids.filter(id => !found.has(id));
    return NextResponse.json(
      { error: 'Some source datasets were not found', missing },
      { status: 404 },
    );
  }

  const totalImages = Object.values(body.split_counts ?? {}).reduce(
    (s, n) => s + (typeof n === 'number' ? n : 0), 0,
  );

  const { data, error } = await auth.supabase
    .from('datasets')
    .insert({
      name:           body.name.trim(),
      version:        body.version?.trim() || '1.0',
      source_type:    'merged',
      target_classes: body.target_classes,
      total_images:   totalImages,
      split_counts:   body.split_counts   ?? {},
      class_counts:   body.class_counts   ?? {},
      quality_report: body.quality_report ?? {},
      storage_path:   body.storage_path.trim(),
      merged_from:    body.source_ids,
      status:         'ready',
      created_by:     auth.userId,
    })
    .select()
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await logDatasetEvent({
    action:    'merge',
    datasetId: data.id,
    actorId:   auth.userId,
    metadata: {
      name:         data.name,
      version:      data.version,
      source_ids:   body.source_ids,
      total_images: totalImages,
      split_counts: data.split_counts,
      class_counts: data.class_counts,
    },
  });

  return NextResponse.json({ dataset: data }, { status: 201 });
}
