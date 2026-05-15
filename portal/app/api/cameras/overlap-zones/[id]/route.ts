// BL-316 (Sprint 18) — /api/cameras/overlap-zones/[id] delete.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/auth/api';

export const dynamic    = 'force-dynamic';
export const revalidate = 0;

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const { error } = await auth.supabase
    .from('camera_overlap_zones')
    .delete()
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
