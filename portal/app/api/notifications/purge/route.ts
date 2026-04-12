import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const PURGE_SECRET = process.env.CRON_SECRET;

export async function POST(request: NextRequest) {
  // Auth: either admin user or cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  const isCronCall = PURGE_SECRET && cronSecret === PURGE_SECRET;

  if (!isCronCall) {
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

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { count, error } = await supabase
    .from('notifications')
    .delete()
    .lt('created_at', ninetyDaysAgo.toISOString())
    .select('*', { count: 'exact', head: true });

  if (error) {
    await log({
      event_type: 'system.error',
      severity: 'error',
      action: 'Failed to purge old notifications',
      metadata: { error: error.message },
    });
    return NextResponse.json({ error: 'Failed to purge notifications' }, { status: 500 });
  }

  await log({
    event_type: 'system.info',
    severity: 'info',
    action: `Auto-purged ${count ?? 0} notifications older than 90 days`,
    metadata: { purged: count ?? 0, auto_purge: true },
  });

  return NextResponse.json({
    purged: count ?? 0,
    message: `Purged ${count ?? 0} notifications older than 90 days`,
  });
}
