// BL-316 (Sprint 18) — /api/cameras/overlap-zones list + create.
// Admin-only writes; supervisors can read.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth/api';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

export async function GET(_req: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.supabase
    .from('camera_overlap_zones')
    .select('id, camera_a_id, camera_b_id, label, confidence, created_by, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ overlap_zones: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null) as {
    camera_a_id?: string;
    camera_b_id?: string;
    label?:       string | null;
    confidence?:  number;
  } | null;

  if (!body?.camera_a_id || !body.camera_b_id) {
    return NextResponse.json({ error: 'camera_a_id and camera_b_id are required' }, { status: 400 });
  }
  if (body.camera_a_id === body.camera_b_id) {
    return NextResponse.json({ error: 'camera_a_id and camera_b_id must differ' }, { status: 400 });
  }

  const conf = typeof body.confidence === 'number' ? body.confidence : 0.8;
  if (conf < 0 || conf > 1) {
    return NextResponse.json({ error: 'confidence must be between 0 and 1' }, { status: 400 });
  }

  const { data, error } = await auth.supabase
    .from('camera_overlap_zones')
    .insert({
      camera_a_id: body.camera_a_id,
      camera_b_id: body.camera_b_id,
      label:       body.label?.trim() || null,
      confidence:  conf,
      created_by:  auth.userId,
    })
    .select()
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json({ overlap_zone: data }, { status: 201 });
}
