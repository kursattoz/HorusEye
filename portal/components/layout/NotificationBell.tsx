'use client';

import { useState } from 'react';
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
  id:      number;
  icon:    React.ElementType;
  title:   string;
  desc:    string;
  time:    string;
  unread:  boolean;
}

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 1,  icon: FileText,      title: 'New file uploaded',         desc: 'Exam_2025_Final.pdf was added.',              time: '2 min',  unread: true  },
  { id: 2,  icon: MessageSquare, title: 'New feedback',              desc: 'Student #4821 left feedback.',                time: '8 min',  unread: true  },
  { id: 3,  icon: Users,         title: 'New user added',            desc: 'ayse.kaya@tedu.edu.tr joined the system.',    time: '15 min', unread: true  },
  { id: 4,  icon: Activity,      title: 'System health warning',     desc: 'CPU usage exceeded 85% threshold.',           time: '32 min', unread: true  },
  { id: 5,  icon: FileText,      title: 'File updated',              desc: 'Guidelines_2025.pdf was revised.',            time: '1 hr',   unread: true  },
  { id: 6,  icon: MessageSquare, title: 'Feedback resolved',         desc: 'Student #3310\'s issue was closed.',          time: '2 hr',   unread: false },
  { id: 7,  icon: Users,         title: 'Role changed',              desc: 'mehmet.demir\'s role changed to supervisor.', time: '3 hr',   unread: false },
  { id: 8,  icon: FileText,      title: 'File deleted',              desc: 'Old_Exam_2024.pdf was removed.',              time: '5 hr',   unread: false },
  { id: 9,  icon: Activity,      title: 'Monitor session started',   desc: 'Supervision session #7 became active.',       time: '1 day',  unread: false },
  { id: 10, icon: MessageSquare, title: '5 new feedbacks pending',   desc: 'There are unreviewed feedback submissions.',  time: '1 day',  unread: false },
];

export function NotificationBell() {
  const [open, setOpen]           = useState(false);
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const unreadCount = notifications.filter(n => n.unread).length;

  function markAllRead() {
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
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
              Mark all as read
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {notifications.map(n => {
            const Icon = n.icon;
            return (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 border-b last:border-0 transition-colors hover:bg-muted/50',
                  n.unread && 'bg-primary/5'
                )}
              >
                <div className={cn(
                  'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  n.unread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  <Icon size={13} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs leading-snug', n.unread ? 'font-medium text-foreground' : 'text-foreground/80')}>
                    {n.title}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.desc}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{n.time}</span>
              </div>
            );
          })}
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
