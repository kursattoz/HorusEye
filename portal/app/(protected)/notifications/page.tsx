import type { Metadata } from 'next';
import { Bell, FileText, Users, MessageSquare, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Notifications — HorusEye',
};

interface Notification {
  id:       number;
  icon:     React.ElementType;
  title:    string;
  desc:     string;
  time:     string;
  unread:   boolean;
  category: string;
}

const ALL_NOTIFICATIONS: Notification[] = [
  { id: 1,  icon: FileText,      category: 'Files',     title: 'New file uploaded',          desc: 'Exam_2025_Final.pdf was added to the system.',              time: '2 minutes ago',  unread: true  },
  { id: 2,  icon: MessageSquare, category: 'Feedback',  title: 'New feedback',               desc: 'Student #4821 left a feedback.',                           time: '8 minutes ago',  unread: true  },
  { id: 3,  icon: Users,         category: 'Team',      title: 'New user added',             desc: 'ayse.kaya@tedu.edu.tr joined the system.',                  time: '15 minutes ago', unread: true  },
  { id: 4,  icon: Activity,      category: 'System',    title: 'System health warning',      desc: 'CPU usage exceeded 85% threshold. Please check.',           time: '32 minutes ago', unread: true  },
  { id: 5,  icon: FileText,      category: 'Files',     title: 'File updated',               desc: 'Guidelines_2025.pdf document was revised.',                time: '1 hour ago',     unread: true  },
  { id: 6,  icon: MessageSquare, category: 'Feedback',  title: 'Feedback resolved',          desc: 'Student #3310\'s issue has been closed.',                  time: '2 hours ago',    unread: false },
  { id: 7,  icon: Users,         category: 'Team',      title: 'Role changed',               desc: 'mehmet.demir\'s role was updated to supervisor.',           time: '3 hours ago',    unread: false },
  { id: 8,  icon: FileText,      category: 'Files',     title: 'File deleted',               desc: 'Old_Exam_2024.pdf was removed from the archive.',           time: '5 hours ago',    unread: false },
  { id: 9,  icon: Activity,      category: 'System',    title: 'Monitor session started',    desc: 'Supervision session #7 became active.',                    time: '1 day ago',      unread: false },
  { id: 10, icon: MessageSquare, category: 'Feedback',  title: '5 new feedbacks pending',    desc: 'There are unreviewed feedback submissions.',                time: '1 day ago',      unread: false },
];

export default function NotificationsPage() {
  const unreadCount = ALL_NOTIFICATIONS.filter(n => n.unread).length;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {unreadCount > 0
            ? `You have ${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}.`
            : 'All notifications have been read.'}
        </p>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {ALL_NOTIFICATIONS.map((n, i) => {
          const Icon = n.icon;
          return (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/40',
                i < ALL_NOTIFICATIONS.length - 1 && 'border-b',
                n.unread && 'bg-primary/5'
              )}
            >
              {/* Icon */}
              <div className={cn(
                'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                n.unread ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                <Icon size={16} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={cn('text-sm', n.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>
                    {n.title}
                  </p>
                  {n.unread && (
                    <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{n.desc}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-xs text-muted-foreground/70 bg-muted rounded px-1.5 py-0.5">
                    {n.category}
                  </span>
                  <span className="text-xs text-muted-foreground/70">{n.time}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
