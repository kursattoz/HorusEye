import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { HealthStatus } from '@/types';

async function checkSupabase(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const supabase = await createClient();
    await supabase.from('user_profiles').select('id', { count: 'exact', head: true });
    return {
      service:      'supabase',
      status:       'healthy',
      latency_ms:   Date.now() - start,
      last_checked: new Date().toISOString(),
      message:      null,
    };
  } catch (err) {
    return {
      service:      'supabase',
      status:       'down',
      latency_ms:   Date.now() - start,
      last_checked: new Date().toISOString(),
      message:      err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

export async function GET() {
  const supabaseStatus = await checkSupabase();
  const allHealthy     = supabaseStatus.status === 'healthy';

  return NextResponse.json({
    status:   allHealthy ? 'healthy' : 'degraded',
    services: [supabaseStatus],
    checked_at: new Date().toISOString(),
  }, { status: allHealthy ? 200 : 503 });
}
