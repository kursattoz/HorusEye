'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import {
  LayoutDashboard,
  FileText,
  Users,
  MessageSquare,
  Activity,
} from 'lucide-react';
import { routes } from '@/constants/routes';
import type { UserRole } from '@/types';

interface NavItem {
  label:    string;
  href:     string;
  icon:     React.ElementType;
  roles:    UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',  href: routes.dashboard,  icon: LayoutDashboard, roles: ['admin','supervisor','assistant'] },
  { label: 'Dosyalar',   href: routes.files,       icon: FileText,        roles: ['admin'] },
  { label: 'Takım',      href: routes.team,        icon: Users,           roles: ['admin'] },
  { label: 'Feedback',   href: routes.feedback,    icon: MessageSquare,   roles: ['admin','supervisor','assistant'] },
  { label: 'Monitor',    href: routes.monitor,     icon: Activity,        roles: ['admin'] },
];

interface SidebarProps {
  role: UserRole;
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();

  const visible = NAV_ITEMS.filter(item => item.roles.includes(role));

  return (
    <aside className="w-56 border-r bg-background flex flex-col shrink-0">
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {visible.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
