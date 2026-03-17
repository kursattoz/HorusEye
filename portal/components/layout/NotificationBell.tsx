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
  { id: 1,  icon: FileText,      title: 'Yeni dosya yüklendi',         desc: 'Sınav_2025_Final.pdf eklendi.',            time: '2 dk',   unread: true  },
  { id: 2,  icon: MessageSquare, title: 'Yeni feedback',               desc: 'Öğrenci #4821 geri bildirim bıraktı.',    time: '8 dk',   unread: true  },
  { id: 3,  icon: Users,         title: 'Yeni kullanıcı eklendi',      desc: 'ayse.kaya@tedu.edu.tr sisteme katıldı.', time: '15 dk',  unread: true  },
  { id: 4,  icon: Activity,      title: 'Sistem sağlığı uyarısı',      desc: 'CPU kullanımı %85 eşiğini geçti.',       time: '32 dk',  unread: true  },
  { id: 5,  icon: FileText,      title: 'Dosya güncellendi',           desc: 'Yönerge_2025.pdf revize edildi.',         time: '1 sa',   unread: true  },
  { id: 6,  icon: MessageSquare, title: 'Feedback çözüme kavuştu',     desc: 'Öğrenci #3310 sorunu kapatıldı.',        time: '2 sa',   unread: false },
  { id: 7,  icon: Users,         title: 'Rol değişikliği',             desc: 'mehmet.demir rolü supervisor oldu.',     time: '3 sa',   unread: false },
  { id: 8,  icon: FileText,      title: 'Dosya silindi',               desc: 'Eski_Sınav_2024.pdf kaldırıldı.',        time: '5 sa',   unread: false },
  { id: 9,  icon: Activity,      title: 'Monitor oturumu başladı',     desc: 'Gözetim #7 oturumu aktif.',              time: '1 gün',  unread: false },
  { id: 10, icon: MessageSquare, title: '5 yeni feedback bekliyor',    desc: 'İncelenmemiş geri bildirimler var.',     time: '1 gün',  unread: false },
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
        <Button variant="ghost" size="icon" className="relative" aria-label="Bildirimler">
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
            <span className="font-semibold text-sm">Bildirimler</span>
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
              Tümünü oku
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
            Tüm bildirimleri gör →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
