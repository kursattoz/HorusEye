import type { Metadata } from 'next';
import { Bell, FileText, Users, MessageSquare, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Bildirimler — HorusEye',
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
  { id: 1,  icon: FileText,      category: 'Dosyalar',  title: 'Yeni dosya yüklendi',           desc: 'Sınav_2025_Final.pdf sisteme eklendi.',              time: '2 dakika önce',   unread: true  },
  { id: 2,  icon: MessageSquare, category: 'Feedback',  title: 'Yeni feedback',                 desc: 'Öğrenci #4821 bir geri bildirim bıraktı.',           time: '8 dakika önce',   unread: true  },
  { id: 3,  icon: Users,         category: 'Takım',     title: 'Yeni kullanıcı eklendi',        desc: 'ayse.kaya@tedu.edu.tr sisteme katıldı.',             time: '15 dakika önce',  unread: true  },
  { id: 4,  icon: Activity,      category: 'Sistem',    title: 'Sistem sağlığı uyarısı',        desc: 'CPU kullanımı %85 eşiğini geçti. Kontrol edin.',     time: '32 dakika önce',  unread: true  },
  { id: 5,  icon: FileText,      category: 'Dosyalar',  title: 'Dosya güncellendi',             desc: 'Yönerge_2025.pdf dökümanı revize edildi.',           time: '1 saat önce',     unread: true  },
  { id: 6,  icon: MessageSquare, category: 'Feedback',  title: 'Feedback çözüme kavuştu',       desc: 'Öğrenci #3310\'un sorunu kapatıldı.',               time: '2 saat önce',     unread: false },
  { id: 7,  icon: Users,         category: 'Takım',     title: 'Rol değişikliği',               desc: 'mehmet.demir kullanıcısının rolü supervisor olarak güncellendi.', time: '3 saat önce', unread: false },
  { id: 8,  icon: FileText,      category: 'Dosyalar',  title: 'Dosya silindi',                 desc: 'Eski_Sınav_2024.pdf arşivden kaldırıldı.',           time: '5 saat önce',     unread: false },
  { id: 9,  icon: Activity,      category: 'Sistem',    title: 'Monitor oturumu başladı',       desc: 'Gözetim #7 oturumu aktif hale geldi.',               time: '1 gün önce',      unread: false },
  { id: 10, icon: MessageSquare, category: 'Feedback',  title: '5 yeni feedback bekliyor',      desc: 'İncelenmemiş geri bildirimler bulunuyor.',           time: '1 gün önce',      unread: false },
];

export default function NotificationsPage() {
  const unreadCount = ALL_NOTIFICATIONS.filter(n => n.unread).length;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Bildirimler</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {unreadCount > 0
            ? `${unreadCount} okunmamış bildiriminiz var.`
            : 'Tüm bildirimler okundu.'}
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
