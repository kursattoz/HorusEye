import { redirect }       from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { createClient }   from '@/lib/supabase/server';
import { routes }         from '@/constants/routes';
import { MonitorView }    from '@/components/monitor/MonitorView';

async function getRecentLogs() {
  const supabase = await createClient();
  const [auditRes, errorRes] = await Promise.all([
    supabase
      .from('audit_logs')
      .select('id, event_type, severity, action, user_id, created_at, metadata')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('error_logs')
      .select('id, severity, error_message, error_code, request_path, created_at, sentry_event_id')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);
  return {
    auditLogs: auditRes.data ?? [],
    errorLogs: errorRes.data ?? [],
  };
}

export default async function MonitorPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect(routes.dashboard);

  const { auditLogs, errorLogs } = await getRecentLogs();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sistem Monitörü</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gerçek zamanlı log akışı ve sistem sağlığı.
        </p>
      </div>
      <MonitorView auditLogs={auditLogs} errorLogs={errorLogs} />
    </div>
  );
}
