'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge }       from '@/components/ui/badge';
import { Input }       from '@/components/ui/input';
import { ScrollArea }  from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn }          from '@/lib/utils';
import { Search }      from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { tr }          from 'date-fns/locale';

interface AuditLog {
  id:         string;
  event_type: string;
  severity:   string;
  action:     string;
  user_id:    string | null;
  created_at: string;
  metadata:   Record<string, unknown> | null;
}

interface ErrorLog {
  id:              string;
  severity:        string;
  error_message:   string;
  error_code:      string | null;
  request_path:    string | null;
  created_at:      string;
  sentry_event_id: string | null;
}

const SEVERITY_COLORS: Record<string, string> = {
  debug:    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  info:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  warn:     'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  error:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  critical: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
};

interface MonitorViewProps {
  auditLogs: AuditLog[];
  errorLogs: ErrorLog[];
}

export function MonitorView({ auditLogs, errorLogs }: MonitorViewProps) {
  const [search, setSearch] = useState('');

  const filteredAudit = auditLogs.filter(l =>
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.event_type.toLowerCase().includes(search.toLowerCase())
  );
  const filteredErrors = errorLogs.filter(l =>
    l.error_message.toLowerCase().includes(search.toLowerCase()) ||
    (l.error_code ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Health check */}
      <HealthCard />

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Log ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit">Audit Logs ({filteredAudit.length})</TabsTrigger>
          <TabsTrigger value="errors">Error Logs ({filteredErrors.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="mt-4">
          <ScrollArea className="h-[500px] rounded-md border">
            <div className="p-1 space-y-px">
              {filteredAudit.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">Log bulunamadı.</p>
              )}
              {filteredAudit.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-3 py-2 hover:bg-muted/50 rounded text-sm">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0', SEVERITY_COLORS[log.severity])}>
                    {log.severity.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs font-mono text-muted-foreground">{log.event_type}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: tr })}
                      </span>
                    </div>
                    <p className="truncate text-xs">{log.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="errors" className="mt-4">
          <ScrollArea className="h-[500px] rounded-md border">
            <div className="p-1 space-y-px">
              {filteredErrors.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">Hata logu bulunamadı.</p>
              )}
              {filteredErrors.map(log => (
                <div key={log.id} className="flex items-start gap-3 px-3 py-2 hover:bg-muted/50 rounded text-sm">
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0', SEVERITY_COLORS[log.severity])}>
                    {log.severity.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {log.error_code && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 font-mono">{log.error_code}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: tr })}
                      </span>
                    </div>
                    <p className="truncate text-xs">{log.error_message}</p>
                    {log.request_path && (
                      <p className="text-[10px] text-muted-foreground font-mono">{log.request_path}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HealthCard() {
  const [status, setStatus] = useState<{ status: string; services: { service: string; status: string; latency_ms: number | null }[] } | null>(null);
  const [checked, setChecked] = useState(false);

  async function check() {
    const res = await fetch('/api/health');
    const data = await res.json();
    setStatus(data);
    setChecked(true);
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Sistem Sağlığı</CardTitle>
        <button onClick={check} className="text-xs text-primary hover:underline">Kontrol Et</button>
      </CardHeader>
      <CardContent>
        {!checked ? (
          <p className="text-xs text-muted-foreground">"Kontrol Et" butonuna basın.</p>
        ) : status ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <div className={cn('h-2 w-2 rounded-full', status.status === 'healthy' ? 'bg-green-500' : 'bg-red-500')} />
              <span className="text-xs capitalize font-medium">{status.status}</span>
            </div>
            {status.services.map(s => (
              <div key={s.service} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-mono">{s.service}</span>
                {s.latency_ms !== null && <span>{s.latency_ms}ms</span>}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
