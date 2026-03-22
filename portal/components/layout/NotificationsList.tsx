'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, FileText, Users, MessageSquare, Activity, CheckCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  category: 'files' | 'feedback' | 'team' | 'system';
  title: string;
  description: string | null;
  is_read: boolean;
  link: string | null;
  created_at: string;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  files: FileText,
  feedback: MessageSquare,
  team: Users,
  system: Activity,
};

const CATEGORY_LABELS: Record<string, string> = {
  files: 'Files',
  feedback: 'Feedback',
  team: 'Team',
  system: 'System',
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function NotificationsList() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/notifications')
      .then(r => r.json())
      .then(d => setNotifications(d.notifications ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function markAllRead() {
    const res = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    }
  }

  async function markRead(id: string) {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const filtered = filter === 'all'
    ? notifications
    : filter === 'unread'
      ? notifications.filter(n => !n.is_read)
      : notifications.filter(n => n.category === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={20} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {unreadCount > 0
              ? `You have ${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}.`
              : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            <CheckCheck size={14} className="mr-1.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 border rounded-lg p-0.5 w-fit">
        {[
          { key: 'all', label: 'All' },
          { key: 'unread', label: `Unread (${unreadCount})` },
          { key: 'files', label: 'Files' },
          { key: 'feedback', label: 'Feedback' },
          { key: 'team', label: 'Team' },
          { key: 'system', label: 'System' },
        ].map(f => (
          <Button
            key={f.key}
            variant={filter === f.key ? 'default' : 'ghost'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Bell size={32} className="mb-3 opacity-30" />
          <p className="text-sm">{filter === 'all' ? 'No notifications yet.' : `No ${filter} notifications.`}</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          {filtered.map((n, i) => {
            const Icon = CATEGORY_ICONS[n.category] ?? Activity;
            return (
              <Link
                key={n.id}
                href={n.link ?? '#'}
                onClick={() => { if (!n.is_read) markRead(n.id); }}
                className={cn(
                  'flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/40',
                  i < filtered.length - 1 && 'border-b',
                  !n.is_read && 'bg-primary/5'
                )}
              >
                <div className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  !n.is_read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={cn('text-sm', !n.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>
                      {n.title}
                    </p>
                    {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0" />}
                  </div>
                  {n.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{n.description}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {CATEGORY_LABELS[n.category] ?? n.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground/70">{formatRelativeTime(n.created_at)}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
