import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { HealthStatus } from '@/types';

async function checkSupabaseDb(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const supabase = await createClient({ serviceRole: true });
    await supabase.from('user_profiles').select('id', { count: 'exact', head: true });
    return {
      service: 'supabase_db',
      status: 'healthy',
      latency_ms: Date.now() - start,
      last_checked: new Date().toISOString(),
      message: null,
    };
  } catch (err) {
    return {
      service: 'supabase_db',
      status: 'down',
      latency_ms: Date.now() - start,
      last_checked: new Date().toISOString(),
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkSupabaseStorage(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const supabase = await createClient({ serviceRole: true });
    await supabase.storage.listBuckets();
    return {
      service: 'supabase_storage',
      status: 'healthy',
      latency_ms: Date.now() - start,
      last_checked: new Date().toISOString(),
      message: null,
    };
  } catch (err) {
    return {
      service: 'supabase_storage',
      status: 'down',
      latency_ms: Date.now() - start,
      last_checked: new Date().toISOString(),
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function checkSupabaseAuth(): Promise<HealthStatus> {
  const start = Date.now();
  try {
    const supabase = await createClient({ serviceRole: true });
    // Listing users with a limit of 1 verifies Auth service is responsive
    await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    return {
      service: 'supabase_auth',
      status: 'healthy',
      latency_ms: Date.now() - start,
      last_checked: new Date().toISOString(),
      message: null,
    };
  } catch (err) {
    return {
      service: 'supabase_auth',
      status: 'down',
      latency_ms: Date.now() - start,
      last_checked: new Date().toISOString(),
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function checkSentry(): HealthStatus {
  const configured = !!process.env.SENTRY_DSN || !!process.env.NEXT_PUBLIC_SENTRY_DSN;
  return {
    service: 'sentry',
    status: configured ? 'healthy' : 'unknown',
    latency_ms: null,
    last_checked: new Date().toISOString(),
    message: configured ? null : 'Sentry DSN not configured',
  };
}

function checkApp(): HealthStatus {
  return {
    service: 'app',
    status: 'healthy',
    latency_ms: null,
    last_checked: new Date().toISOString(),
    message: `Node ${process.version}`,
  };
}

interface TableCount {
  table: string;
  count: number | null;
}

async function getDbRowCounts(): Promise<TableCount[]> {
  const supabase = await createClient({ serviceRole: true });
  const tables = [
    'user_profiles',
    'files',
    'feedbacks',
    'audit_logs',
    'error_logs',
    'report_deliverables',
    'checklist_items',
  ];

  const results = await Promise.all(
    tables.map(async (table) => {
      try {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        return { table, count: count ?? 0 };
      } catch {
        return { table, count: null };
      }
    })
  );

  return results;
}

interface Stats24h {
  total_audit_events: number | null;
  unique_users: number | null;
  error_count: number | null;
}

async function get24hStats(): Promise<Stats24h> {
  const supabase = await createClient({ serviceRole: true });
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [auditResult, errorResult] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('user_id', { count: 'exact' })
      .gte('created_at', since),
    supabase
      .from('error_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since),
  ]);

  const uniqueUsers = auditResult.data
    ? new Set(auditResult.data.map((row: { user_id: string }) => row.user_id)).size
    : null;

  return {
    total_audit_events: auditResult.count ?? null,
    unique_users: uniqueUsers,
    error_count: errorResult.count ?? null,
  };
}

export async function GET() {
  // Auth check — must be an admin
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden — admin access required' },
        { status: 403 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    );
  }

  // Run all checks in parallel
  const [
    dbStatus,
    storageStatus,
    authStatus,
    rowCounts,
    stats,
  ] = await Promise.all([
    checkSupabaseDb(),
    checkSupabaseStorage(),
    checkSupabaseAuth(),
    getDbRowCounts(),
    get24hStats(),
  ]);

  const appStatus = checkApp();
  const sentryStatus = checkSentry();

  const services: HealthStatus[] = [
    dbStatus,
    storageStatus,
    authStatus,
    appStatus,
    sentryStatus,
  ];

  const allHealthy = services.every(
    (s) => s.status === 'healthy' || s.status === 'unknown'
  );

  return NextResponse.json({
    status: allHealthy ? 'healthy' : 'degraded',
    services,
    database: {
      row_counts: rowCounts,
    },
    environment: {
      env: process.env.NEXT_PUBLIC_ENV ?? 'unknown',
      node_version: process.version,
      app_url: process.env.NEXT_PUBLIC_APP_URL ?? 'unknown',
      server_time: new Date().toISOString(),
    },
    stats_24h: stats,
    checked_at: new Date().toISOString(),
  }, { status: allHealthy ? 200 : 503 });
}
