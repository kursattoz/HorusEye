'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  MessageSquare,
  Settings,
  Activity,
  ClipboardList,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/constants/routes';
import type { UserRole } from '@/types';

interface NavItem {
  label: string;
  href:  string;
  icon:  React.ElementType;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: routes.dashboard, icon: LayoutDashboard, roles: ['admin', 'supervisor', 'assistant'] },
  { label: 'Files',     href: routes.files,     icon: FileText,        roles: ['admin'] },
  { label: 'Feedback',  href: routes.feedback,  icon: MessageSquare,   roles: ['admin', 'supervisor', 'assistant'] },
  { label: 'Reports',   href: routes.reports,   icon: ClipboardList,   roles: ['admin', 'supervisor', 'assistant'] },
  { label: 'Settings',  href: routes.settings,  icon: Settings,        roles: ['admin', 'supervisor', 'assistant'] },
];

interface BottomNavProps {
  role: UserRole;
}

export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const visible  = NAV_ITEMS.filter(item => item.roles.includes(role));

  return (
    <nav
      aria-label="Mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="flex items-center justify-around px-2 py-1 safe-area-bottom">
        {visible.map(item => {
          const Icon   = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg min-w-[52px] transition-colors',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon
                size={20}
                strokeWidth={active ? 2.5 : 1.75}
                className="shrink-0"
              />
              <span className={cn(
                'text-[10px] font-medium leading-tight',
                active ? 'text-primary' : 'text-muted-foreground'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
