// BL-266 (Sprint 14) — /api/ai/datasets list + create.
// PRD-017 §15. Admin-only RBAC enforced by requireAdmin(); the datasets
// table already has admin-only RLS as a defense-in-depth backstop.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { logDatasetEvent } from '@/lib/audit/dataset';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const SOURCE_TYPES = ['roboflow', 'open_images', 'kaggle', 'coco', 'internal', 'merged', 'custom'] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const url       = new URL(request.url);
  const status    = url.searchParams.get('status');
  const source    = url.searchParams.get('source_type');

  let q = auth.supabase
    .from('datasets')
    .select('id, name, version, source_type, source_url, license, target_classes, ' +
            'total_images, total_annotations, split_counts, class_counts, ' +
            'storage_path, status, ai_model_id, parent_id, merged_from, ' +
            'created_by, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  if (source) q = q.eq('source_type', source);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ datasets: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as {
    name?:           string;
    version?:        string;
    source_type?:    SourceType;
    source_url?:     string | null;
    license?:        string | null;
    target_classes?: string[];
    storage_path?:   string;
    status?:         string;
  } | null;

  if (!body?.name?.trim() || !body.source_type || !body.storage_path?.trim()) {
    return NextResponse.json(
      { error: 'name, source_type and storage_path are required' },
      { status: 400 },
    );
  }
  if (!SOURCE_TYPES.includes(body.source_type)) {
    return NextResponse.json(
      { error: `source_type must be one of: ${SOURCE_TYPES.join(', ')}` },
      { status: 400 },
    );
  }
  if (!Array.isArray(body.target_classes) || body.target_classes.length === 0) {
    return NextResponse.json(
      { error: 'target_classes must be a non-empty string array' },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase
    .from('datasets')
    .insert({
      name:           body.name.trim(),
      version:        body.version?.trim() || '1.0',
      source_type:    body.source_type,
      source_url:     body.source_url ?? null,
      license:        body.license    ?? null,
      target_classes: body.target_classes,
      storage_path:   body.storage_path.trim(),
      status:         body.status     ?? 'importing',
      created_by:     auth.userId,
    })
    .select()
    .single();

  if (error) {
    // Postgres unique violation on (name, version) — surface 409.
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await logDatasetEvent({
    action:    'import',
    datasetId: data.id,
    actorId:   auth.userId,
    metadata: {
      name:           data.name,
      version:        data.version,
      source_type:    data.source_type,
      target_classes: data.target_classes,
      storage_path:   data.storage_path,
    },
  });

  return NextResponse.json({ dataset: data }, { status: 201 });
}
