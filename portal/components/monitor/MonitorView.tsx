'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  MinusCircle,
  RefreshCw,
  Search,
  Activity,
  Users,
  Eye,
  ShieldAlert,
  AlertOctagon,
  Server,
  Database,
  HardDrive,
  Shield,
  Radio,
  Info,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface AuditLog {
  id: string;
  event_type: string;
  severity: string;
  action: string;
  user_id: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface ErrorLog {
  id: string;
  severity: string;
  error_message: string;
  error_code: string | null;
  request_path: string | null;
  created_at: string;
  sentry_event_id: string | null;
}

interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  latency_ms: number | null;
  last_checked: string;
  message: string | null;
}

interface HealthResponse {
  status: 'healthy' | 'degraded';
  services: ServiceHealth[];
  database: {
    row_counts: Array<{ table: string; count: number | null }>;
  };
  environment: {
    env: string;
    node_version: string;
    app_url: string;
    server_time: string;
  };
  stats_24h: {
    total_audit_events: number | null;
    unique_users: number | null;
    error_count: number | null;
  };
  checked_at: string;
}

interface MonitorViewProps {
  auditLogs: AuditLog[];
  errorLogs: ErrorLog[];
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

const STATUS_DOT: Record<ServiceStatus, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
  down: 'bg-red-500',
  unknown: 'bg-gray-400',
};

const STATUS_ICON: Record<ServiceStatus, typeof CheckCircle2> = {
  healthy: CheckCircle2,
  degraded: AlertTriangle,
  down: XCircle,
  unknown: MinusCircle,
};

const STATUS_TEXT_COLOR: Record<ServiceStatus, string> = {
  healthy: 'text-green-600 dark:text-green-400',
  degraded: 'text-yellow-600 dark:text-yellow-400',
  down: 'text-red-600 dark:text-red-400',
  unknown: 'text-gray-500 dark:text-gray-400',
};

const SERVICE_ICONS: Record<string, typeof Database> = {
  supabase_db: Database,
  supabase_storage: HardDrive,
  supabase_auth: Shield,
  app: Server,
  sentry: AlertOctagon,
  camera_module: Radio,
};

const SERVICE_LABELS: Record<string, string> = {
  supabase_db: 'Supabase DB',
  supabase_storage: 'Storage',
  supabase_auth: 'Auth',
  app: 'App',
  sentry: 'Sentry',
  camera_module: 'Camera Module',
};

const SEVERITY_COLORS: Record<string, string> = {
  debug: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  warn: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  critical: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
] as const;

const AUTO_REFRESH_INTERVAL = 30_000;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function userColor(userId: string | null): string {
  if (!userId) return 'text-muted-foreground';
  const colors = [
    'text-blue-600 dark:text-blue-400',
    'text-emerald-600 dark:text-emerald-400',
    'text-violet-600 dark:text-violet-400',
    'text-orange-600 dark:text-orange-400',
    'text-pink-600 dark:text-pink-400',
    'text-cyan-600 dark:text-cyan-400',
    'text-amber-600 dark:text-amber-400',
    'text-rose-600 dark:text-rose-400',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  }
  return colors[Math.abs(hash) % colors.length] ?? 'text-muted-foreground';
}

function formatNum(n: number | null | undefined): string {
  if (n == null) return '-';
  return n.toLocaleString('en-US');
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function MonitorView({ auditLogs: initialAuditLogs, errorLogs: initialErrorLogs }: MonitorViewProps) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);
  const [errorLogs, setErrorLogs] = useState<ErrorLog[]>(initialErrorLogs);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Filters
  const [activitySearch, setActivitySearch] = useState('');
  const [errorTimeRange, setErrorTimeRange] = useState<number>(24);
  const [errorSeverity, setErrorSeverity] = useState<string>('all');
  const [selectedError, setSelectedError] = useState<ErrorLog | null>(null);

  /* ---- Fetch health data ---- */
  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/health/detailed');
      if (res.ok) {
        const data: HealthResponse = await res.json();
        setHealth(data);
      }
    } catch {
      // Health fetch failed silently — dashboard shows stale data
    } finally {
      setLoading(false);
      setLastRefresh(new Date());
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/health/detailed');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch {
      // Silently fail
    }
  }, []);

  /* ---- Initial fetch + auto-refresh ---- */
  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchLogs();
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  /* ---- Derived: services including camera ---- */
  const services: ServiceHealth[] = useMemo(() => {
    const base = health?.services ?? [];
    const cameraModule: ServiceHealth = {
      service: 'camera_module',
      status: 'unknown',
      latency_ms: null,
      last_checked: new Date().toISOString(),
      message: 'Not yet active',
    };
    return [...base, cameraModule];
  }, [health]);

  /* ---- Stats from audit logs ---- */
  const stats = useMemo(() => {
    const pageVisits = auditLogs.filter((l) => l.event_type === 'page.visit').length;
    const uniqueUsers = new Set(auditLogs.filter((l) => l.user_id).map((l) => l.user_id)).size;
    const fileViews = auditLogs.filter(
      (l) => l.event_type === 'file.view' || l.event_type === 'file.download'
    ).length;
    const failedLogins = auditLogs.filter((l) => l.event_type === 'auth.failed').length;
    const totalErrors = health?.stats_24h?.error_count ?? errorLogs.length;

    return { pageVisits, uniqueUsers, fileViews, failedLogins, totalErrors };
  }, [auditLogs, errorLogs, health]);

  /* ---- Filtered errors ---- */
  const filteredErrors = useMemo(() => {
    const cutoff = new Date(Date.now() - errorTimeRange * 60 * 60 * 1000);
    return errorLogs
      .filter((l) => new Date(l.created_at) >= cutoff)
      .filter((l) => errorSeverity === 'all' || l.severity === errorSeverity)
      .slice(0, 50);
  }, [errorLogs, errorTimeRange, errorSeverity]);

  /* ---- Filtered audit ---- */
  const filteredAudit = useMemo(() => {
    const q = activitySearch.toLowerCase();
    return auditLogs
      .filter(
        (l) =>
          !q ||
          l.action.toLowerCase().includes(q) ||
          l.event_type.toLowerCase().includes(q) ||
          (l.user_id ?? '').toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [auditLogs, activitySearch]);

  /* ---- Unique severities for filter ---- */
  const severityOptions = useMemo(() => {
    const set = new Set(errorLogs.map((l) => l.severity));
    return Array.from(set).sort();
  }, [errorLogs]);

  return (
    <div className="space-y-6">
      {/* ---------- Header with refresh ---------- */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">System Monitor</h2>
          {lastRefresh && (
            <p className="text-xs text-muted-foreground">
              Last refresh: {formatDistanceToNow(lastRefresh, { addSuffix: true, locale: enUS })}
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchHealth}
          disabled={loading}
          className="gap-1.5"
        >
          <RefreshCw size={14} className={cn(loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* ---------- 1. Health Cards ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {services.map((svc) => {
          const Icon = STATUS_ICON[svc.status];
          const ServiceIcon = SERVICE_ICONS[svc.service] ?? Server;
          return (
            <Card key={svc.service} className="relative overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ServiceIcon size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium truncate">
                    {SERVICE_LABELS[svc.service] ?? svc.service}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', STATUS_DOT[svc.status])} />
                  <Icon size={14} className={cn(STATUS_TEXT_COLOR[svc.status])} />
                  <span className={cn('text-xs font-medium capitalize', STATUS_TEXT_COLOR[svc.status])}>
                    {svc.status}
                  </span>
                </div>
                {svc.latency_ms !== null && (
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                    {svc.latency_ms}ms
                  </p>
                )}
                {svc.message && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{svc.message}</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ---------- 2. Environment Info ---------- */}
      {health?.environment && (
        <Alert>
          <Info size={14} />
          <AlertDescription className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span>
              <strong>Environment:</strong> {health.environment.env}
            </span>
            <span>
              <strong>Node:</strong> {health.environment.node_version}
            </span>
            <span>
              <strong>App URL:</strong> {health.environment.app_url}
            </span>
            <span>
              <strong>Server Time:</strong>{' '}
              {new Date(health.environment.server_time).toLocaleString('en-US')}
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* ---------- 3. Statistics Cards ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Page Visits', value: stats.pageVisits, icon: Eye },
          { label: 'Unique Users', value: stats.uniqueUsers, icon: Users },
          { label: 'File Views', value: stats.fileViews, icon: HardDrive },
          { label: 'Failed Logins', value: stats.failedLogins, icon: ShieldAlert },
          { label: 'Total Errors', value: stats.totalErrors, icon: AlertOctagon },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatNum(s.value)}</p>
              <p className="text-[10px] text-muted-foreground">Last 24 hours</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ---------- 4. Database Row Counts ---------- */}
      {health?.database?.row_counts && health.database.row_counts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database size={14} />
              Database Row Counts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {health.database.row_counts.map((row) => (
                <div
                  key={row.table}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-xs font-mono truncate mr-2">{row.table}</span>
                  <span className="text-xs font-semibold tabular-nums">
                    {row.count != null ? formatNum(row.count) : '-'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---------- 5 & 6. Tabs: Errors + Activity ---------- */}
      <Tabs defaultValue="errors">
        <TabsList>
          <TabsTrigger value="errors" className="gap-1.5">
            <AlertOctagon size={12} />
            Errors ({filteredErrors.length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5">
            <Activity size={12} />
            Activity ({filteredAudit.length})
          </TabsTrigger>
        </TabsList>

        {/* ---- 5. Recent Errors ---- */}
        <TabsContent value="errors" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* Time range buttons */}
            <div className="flex items-center gap-1">
              {TIME_RANGES.map((tr) => (
                <Button
                  key={tr.label}
                  variant={errorTimeRange === tr.hours ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setErrorTimeRange(tr.hours)}
                >
                  {tr.label}
                </Button>
              ))}
            </div>
            {/* Severity filter */}
            <Select value={errorSeverity} onValueChange={setErrorSeverity}>
              <SelectTrigger className="h-7 w-[130px] text-xs">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                {severityOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="h-[400px] rounded-md border">
            <div className="p-1 space-y-px">
              {filteredErrors.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">
                  No errors in the selected time range.
                </p>
              )}
              {filteredErrors.map((log) => (
                <button
                  key={log.id}
                  type="button"
                  className="w-full flex items-start gap-3 px-3 py-2 hover:bg-muted/50 rounded text-sm text-left"
                  onClick={() => setSelectedError(log)}
                >
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0',
                      SEVERITY_COLORS[log.severity]
                    )}
                  >
                    {log.severity.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {log.error_code && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">
                          {log.error_code}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), {
                          addSuffix: true,
                          locale: enUS,
                        })}
                      </span>
                    </div>
                    <p className="truncate text-xs">{log.error_message}</p>
                    {log.request_path && (
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {log.request_path}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ---- 6. Live Activity Feed ---- */}
        <TabsContent value="activity" className="mt-4 space-y-3">
          <div className="relative max-w-sm">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder="Search activity..."
              value={activitySearch}
              onChange={(e) => setActivitySearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>

          <ScrollArea className="h-[400px] rounded-md border">
            <div className="p-1 space-y-px">
              {filteredAudit.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">No activity found.</p>
              )}
              {filteredAudit.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 px-3 py-2 hover:bg-muted/50 rounded text-sm"
                >
                  <span
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0',
                      SEVERITY_COLORS[log.severity]
                    )}
                  >
                    {log.severity.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs font-mono text-muted-foreground">
                        {log.event_type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), {
                          addSuffix: true,
                          locale: enUS,
                        })}
                      </span>
                    </div>
                    <p className="truncate text-xs">{log.action}</p>
                    {log.user_id && (
                      <p className={cn('text-[10px] font-mono truncate', userColor(log.user_id))}>
                        {log.user_id}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* ---------- Error Detail Dialog ---------- */}
      <Dialog open={!!selectedError} onOpenChange={(open) => !open && setSelectedError(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertOctagon size={16} className="text-red-500" />
              Error Detail
            </DialogTitle>
            <DialogDescription>
              Full error information and metadata
            </DialogDescription>
          </DialogHeader>
          {selectedError && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <span className="text-muted-foreground font-medium">Severity</span>
                <span>
                  <Badge
                    className={cn(
                      'text-[10px] px-1.5 py-0.5 font-mono',
                      SEVERITY_COLORS[selectedError.severity]
                    )}
                  >
                    {selectedError.severity.toUpperCase()}
                  </Badge>
                </span>

                <span className="text-muted-foreground font-medium">Error Code</span>
                <span className="font-mono text-xs">
                  {selectedError.error_code ?? 'N/A'}
                </span>

                <span className="text-muted-foreground font-medium">Request Path</span>
                <span className="font-mono text-xs break-all">
                  {selectedError.request_path ?? 'N/A'}
                </span>

                <span className="text-muted-foreground font-medium">Time</span>
                <span className="text-xs">
                  {new Date(selectedError.created_at).toLocaleString('en-US')}
                  {' ('}
                  {formatDistanceToNow(new Date(selectedError.created_at), {
                    addSuffix: true,
                    locale: enUS,
                  })}
                  {')'}
                </span>

                {selectedError.sentry_event_id && (
                  <>
                    <span className="text-muted-foreground font-medium">Sentry</span>
                    <a
                      href={`https://sentry.io/organizations/horuseye/issues/?query=${selectedError.sentry_event_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline font-mono break-all"
                    >
                      {selectedError.sentry_event_id}
                    </a>
                  </>
                )}
              </div>

              <div>
                <p className="text-muted-foreground font-medium mb-1">Error Message</p>
                <div className="rounded-md border bg-muted/50 p-3">
                  <p className="text-xs font-mono whitespace-pre-wrap break-all">
                    {selectedError.error_message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
