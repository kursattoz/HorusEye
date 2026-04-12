'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, FileText, Users, MessageSquare, Activity, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { routes } from '@/constants/routes';

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

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    const res = await fetch('/api/notifications');
    if (res.ok) {
      const data = await res.json();
      setNotifications(data.notifications ?? []);
    }
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    const res = await fetch('/api/notifications/count');
    if (res.ok) {
      const data = await res.json();
      setUnreadCount(data.unread ?? 0);
    }
  }, []);

  // Fetch on mount + poll every 30s
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Fetch full list when popover opens
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function markAllRead() {
    const res = await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true }),
    });
    if (res.ok) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Notifications</span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck size={12} />
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No notifications</div>
          ) : (
            notifications.slice(0, 10).map(n => {
              const Icon = CATEGORY_ICONS[n.category] ?? Activity;
              return (
                <Link
                  key={n.id}
                  href={n.link ?? routes.notifications}
                  onClick={() => {
                    if (!n.is_read) {
                      fetch('/api/notifications/read', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: [n.id] }),
                      });
                      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
                      setUnreadCount(prev => Math.max(0, prev - 1));
                    }
                    setOpen(false);
                  }}
                  className={cn(
                    'flex items-start gap-3 px-4 py-3 border-b last:border-0 transition-colors hover:bg-muted/50',
                    !n.is_read && 'bg-primary/5'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                    !n.is_read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  )}>
                    <Icon size={13} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs leading-snug', !n.is_read ? 'font-medium text-foreground' : 'text-foreground/80')}>
                      {n.title}
                    </p>
                    {n.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.description}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {formatRelativeTime(n.created_at)}
                  </span>
                </Link>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2.5">
          <Link
            href={routes.notifications}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center text-xs text-muted-foreground hover:text-foreground transition-colors font-medium w-full"
          >
            View all notifications →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
