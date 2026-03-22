import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/files/trash — list soft-deleted files (admin only)
export async function GET() {
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

  // Use service role to bypass RLS (deleted files may not be visible via normal RLS)
  const admin = await createClient({ serviceRole: true });
  const { data, error } = await admin
    .from('files')
    .select('id, name, display_name, file_type, file_size_bytes, deleted_at, uploaded_by')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ files: data ?? [] });
}
