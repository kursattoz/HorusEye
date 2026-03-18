'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  Users,
  MessageSquare,
  Activity,
  Settings,
  Sun,
  Moon,
  Monitor,
  ClipboardList,
  GraduationCap,
  Laptop,
} from 'lucide-react';
import { routes } from '@/constants/routes';
import { switchTheme } from '@/lib/utils/switchTheme';
import type { UserRole } from '@/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HorusEyeIcon } from './HorusEyeIcon';

interface NavItem {
  label: string;
  href:  string;
  icon:  React.ElementType;
  roles: UserRole[];
}

interface ComingSoonItem {
  label: string;
  icon:  React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: routes.dashboard, icon: LayoutDashboard, roles: ['admin','supervisor','assistant'] },
  { label: 'Files',     href: routes.files,     icon: FileText,        roles: ['admin'] },
  { label: 'Team',      href: routes.team,      icon: Users,           roles: ['admin'] },
  { label: 'Feedback',  href: routes.feedback,  icon: MessageSquare,   roles: ['admin','supervisor','assistant'] },
  { label: 'Reports',   href: routes.reports,   icon: ClipboardList,   roles: ['admin','supervisor','assistant'] },
  { label: 'Monitor',   href: routes.monitor,   icon: Activity,        roles: ['admin'] },
];

const COMING_SOON: ComingSoonItem[] = [
  { label: 'Monitoring', icon: Monitor       },
  { label: 'Exams',      icon: ClipboardList },
  { label: 'Students',   icon: GraduationCap },
  { label: 'Devices',    icon: Laptop        },
];

interface SidebarProps {
  role:      UserRole;
  collapsed: boolean;
}

export function Sidebar({ role, collapsed }: SidebarProps) {
  const pathname             = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const visible = NAV_ITEMS.filter(item => item.roles.includes(role));

  function NavLink({ item }: { item: NavItem }) {
    const Icon   = item.icon;
    const active = pathname === item.href || pathname.startsWith(item.href + '/');

    const inner = (
      <Link
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          collapsed && 'justify-center px-2',
          active
            ? 'bg-accent text-accent-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
        )}
      >
        <Icon size={16} className="shrink-0" />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );

    if (!collapsed) return inner;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  function ComingSoonLink({ item }: { item: ComingSoonItem }) {
    const Icon = item.icon;

    const inner = (
      <div
        className={cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm cursor-not-allowed select-none',
          collapsed && 'justify-center px-2',
          'text-muted-foreground/40'
        )}
        aria-disabled="true"
      >
        <Icon size={16} className="shrink-0" />
        {!collapsed && (
          <span className="flex-1">{item.label}</span>
        )}
        {!collapsed && (
          <span className="text-[9px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground/60 px-1.5 py-0.5 rounded-full">
            Soon
          </span>
        )}
      </div>
    );

    if (!collapsed) return inner;
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{inner}</div>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label} — Coming Soon</TooltipContent>
      </Tooltip>
    );
  }

  const settingsActive = pathname === routes.settings;
  const settingsInner  = (
    <Link
      href={routes.settings}
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
        collapsed && 'justify-center px-2',
        settingsActive
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
      )}
    >
      <Settings size={16} className="shrink-0" />
      {!collapsed && <span>Settings</span>}
    </Link>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'border-r bg-background flex flex-col shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden',
          collapsed ? 'w-14' : 'w-56'
        )}
      >
        {/* Main nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {visible.map(item => <NavLink key={item.href} item={item} />)}

          {/* Divider */}
          {!collapsed && (
            <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
              Coming Soon
            </p>
          )}
          {collapsed && <div className="my-2 border-t border-border/40" />}

          {COMING_SOON.map(item => <ComingSoonLink key={item.label} item={item} />)}
        </nav>

        {/* Bottom section */}
        <div className="border-t px-2 py-2 space-y-1">
          {/* Settings */}
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{settingsInner}</TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          ) : settingsInner}

          {/* Theme toggle — ghost glide sliding pill */}
          <div
            className={cn(
              'relative flex rounded-lg bg-muted p-0.5',
              collapsed ? 'flex-col' : 'flex-row'
            )}
          >
            {/* Sliding pill indicator */}
            {mounted && (
              <span
                aria-hidden
                className="absolute rounded-md bg-background shadow-sm pointer-events-none"
                style={collapsed
                  ? {
                      top: '2px', left: '2px', right: '2px',
                      height: 'calc(50% - 2px)',
                      transform: resolvedTheme === 'dark' ? 'translateY(100%)' : 'translateY(0)',
                      transition: 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }
                  : {
                      top: '2px', bottom: '2px', left: '2px',
                      width: 'calc(50% - 2px)',
                      transform: resolvedTheme === 'dark' ? 'translateX(100%)' : 'translateX(0)',
                      transition: 'transform 380ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                    }
                }
              />
            )}
            <button
              onClick={() => switchTheme(setTheme, 'light')}
              className={cn(
                'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium',
                mounted && resolvedTheme === 'light'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Sun
                size={13}
                className={cn(
                  'shrink-0',
                  mounted && resolvedTheme === 'light' && 'animate-sun-appear'
                )}
              />
              {!collapsed && 'Light'}
            </button>
            <button
              onClick={() => switchTheme(setTheme, 'dark')}
              className={cn(
                'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium',
                mounted && resolvedTheme === 'dark'
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Moon
                size={13}
                className={cn(
                  'shrink-0',
                  mounted && resolvedTheme === 'dark' && 'animate-moon-appear'
                )}
              />
              {!collapsed && 'Dark'}
            </button>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
