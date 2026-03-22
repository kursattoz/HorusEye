import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const PURGE_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  // Auth: either admin user or cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  const isCronCall = PURGE_SECRET && cronSecret === PURGE_SECRET;

  if (!isCronCall) {
    // Check admin auth
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
  }

  const supabase = await createClient({ serviceRole: true });

  // Find files soft-deleted more than 30 days ago
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: expiredFiles, error: fetchError } = await supabase
    .from('files')
    .select('id, name, storage_path')
    .not('deleted_at', 'is', null)
    .lt('deleted_at', thirtyDaysAgo.toISOString());

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch expired files' }, { status: 500 });
  }

  if (!expiredFiles || expiredFiles.length === 0) {
    return NextResponse.json({ purged: 0, message: 'No files to purge' });
  }

  let purgedCount = 0;

  for (const file of expiredFiles) {
    try {
      // Delete from storage
      await supabase.storage
        .from('horuseye-files')
        .remove([file.storage_path]);

      // Hard-delete from DB
      await supabase
        .from('files')
        .delete()
        .eq('id', file.id);

      purgedCount++;

      await log({
        event_type: 'file.delete',
        severity: 'info',
        action: `Auto-purged file: ${file.name} (30-day retention)`,
        resource_type: 'file',
        resource_id: file.id,
        metadata: { storage_path: file.storage_path, auto_purge: true },
      });
    } catch (err) {
      await log({
        event_type: 'system.error',
        severity: 'error',
        action: `Failed to purge file: ${file.name}`,
        resource_type: 'file',
        resource_id: file.id,
        metadata: { error: err instanceof Error ? err.message : 'Unknown' },
      });
    }
  }

  return NextResponse.json({
    purged: purgedCount,
    total_expired: expiredFiles.length,
    message: `Purged ${purgedCount} of ${expiredFiles.length} expired files`,
  });
}
