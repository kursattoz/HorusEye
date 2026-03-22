import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

// POST /api/files/[id]/restore — restore a soft-deleted file (admin only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = await createClient({ serviceRole: true });

  // Verify file exists and is soft-deleted
  const { data: file } = await admin
    .from('files')
    .select('id, name, display_name, deleted_at')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .maybeSingle();

  if (!file) {
    return NextResponse.json({ error: 'File not found or not deleted.' }, { status: 404 });
  }

  // Restore: clear deleted_at
  const { error } = await admin
    .from('files')
    .update({ deleted_at: null })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await log({
    event_type: 'file.restore',
    severity: 'info',
    user_id: user.id,
    resource_type: 'file',
    resource_id: id,
    action: `Restored file: ${file.display_name}`,
  });

  return NextResponse.json({ success: true, file: { ...file, deleted_at: null } });
}
