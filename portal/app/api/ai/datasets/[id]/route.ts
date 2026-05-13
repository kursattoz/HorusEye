// BL-266 (Sprint 14) — /api/ai/datasets/[id] detail + update + delete.
// PRD-017 §15. Admin-only RBAC; updates also fire dataset.* audit events
// when meaningful state transitions happen (status change, quality
// report attached, deploy).
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';
import { logDatasetEvent, type DatasetAuditAction } from '@/lib/audit/dataset';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

const STATUS_VALUES = ['importing', 'validating', 'ready', 'merged', 'training', 'archived'] as const;
type DatasetStatus = (typeof STATUS_VALUES)[number];

interface DatasetUpdateBody {
  name?:              string;
  version?:           string;
  source_url?:        string | null;
  license?:           string | null;
  target_classes?:    string[];
  total_images?:      number;
  total_annotations?: number;
  split_counts?:      Record<string, number>;
  class_counts?:      Record<string, number>;
  quality_report?:    Record<string, unknown>;
  status?:            DatasetStatus;
  ai_model_id?:       string | null;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { data, error } = await auth.supabase
    .from('datasets')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error)  return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data)  return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
  return NextResponse.json({ dataset: data });
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = await request.json().catch(() => null) as DatasetUpdateBody | null;
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 });

  if (body.status && !STATUS_VALUES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${STATUS_VALUES.join(', ')}` },
      { status: 400 },
    );
  }

  // Read prior status so the audit hook only fires on a real transition.
  const { data: prior } = await auth.supabase
    .from('datasets')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  if (!prior) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });

  const update: Record<string, unknown> = {};
  for (const key of [
    'name', 'version', 'source_url', 'license', 'target_classes',
    'total_images', 'total_annotations', 'split_counts', 'class_counts',
    'quality_report', 'status', 'ai_model_id',
  ] as const) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No updatable fields supplied' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('datasets')
    .update(update)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit hooks for meaningful transitions (PRD-021 BL-271 taxonomy).
  if (body.quality_report !== undefined) {
    await logDatasetEvent({
      action:    'validate',
      datasetId: id,
      actorId:   auth.userId,
      metadata: {
        passed: (body.quality_report as { passed?: boolean })?.passed ?? null,
        issues: (body.quality_report as { issues?: Record<string, number> })?.issues ?? null,
      },
    });
  }
  if (body.status && body.status !== prior.status) {
    const map: Partial<Record<DatasetStatus, DatasetAuditAction>> = {
      training: 'deploy',
      merged:   'merge',
    };
    const action = map[body.status];
    if (action) {
      await logDatasetEvent({
        action,
        datasetId: id,
        actorId:   auth.userId,
        metadata: { from: prior.status, to: body.status, ai_model_id: body.ai_model_id ?? null },
      });
    }
  }

  return NextResponse.json({ dataset: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  // Soft-archive instead of hard delete — PRD-017 §15: dataset history
  // must remain queryable so we can answer "which dataset trained X?".
  const { error } = await auth.supabase
    .from('datasets')
    .update({ status: 'archived' })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ archived: true });
}
