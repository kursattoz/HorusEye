// PRD-006 — Two-layer logger: Sentry (errors) + Supabase audit_logs/error_logs
import type { LogEventType, LogSeverity } from '@/types';
import { config } from '@/constants/config';

export interface LogPayload {
  event_type: LogEventType;
  severity:   LogSeverity;
  user_id?:      string;
  session_id?:   string;
  resource_type?: string;
  resource_id?:  string;
  action:        string;
  metadata?:     Record<string, unknown>;
  ip_address?:   string;
  user_agent?:   string;
}

export async function log(payload: LogPayload): Promise<void> {
  // Local dev: colorized console
  if (config.env === 'local') {
    const color =
      payload.severity === 'critical' ? '\x1b[35m' :
      payload.severity === 'error'    ? '\x1b[31m' :
      payload.severity === 'warn'     ? '\x1b[33m' :
                                        '\x1b[36m';
    console.log(`${color}[${payload.severity.toUpperCase()}]\x1b[0m`, payload.event_type, payload.action, payload.metadata ?? '');
  }

  // Critical/error → Sentry
  if (payload.severity === 'error' || payload.severity === 'critical') {
    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureEvent({
        message: payload.action,
        level:   payload.severity as 'error' | 'fatal',
        extra:   payload.metadata,
        user:    payload.user_id ? { id: payload.user_id } : undefined,
      });
    } catch { /* Sentry not configured in this env */ }
  }

  // All events → Supabase (fire-and-forget, never block the request)
  const table = (payload.severity === 'error' || payload.severity === 'critical')
    ? 'error_logs'
    : 'audit_logs';

  // Dynamic import to avoid importing server-only code in client components
  import('@/lib/supabase/server').then(({ createClient }) =>
    createClient({ serviceRole: true }).then(supabase =>
      supabase.from(table).insert(payload).then(({ error }) => {
        if (error && config.env !== 'production') {
          console.error('[Logger] DB insert failed:', error.message);
        }
      })
    )
  ).catch(() => { /* silently fail in environments without DB access */ });
}

export const logDebug    = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'debug' });
export const logInfo     = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'info' });
export const logWarn     = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'warn' });
export const logError    = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'error' });
export const logCritical = (p: Omit<LogPayload, 'severity'>) => log({ ...p, severity: 'critical' });
