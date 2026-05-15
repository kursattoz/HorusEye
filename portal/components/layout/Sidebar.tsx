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
  Kanban,
  CalendarDays,
  Trash2,
  BarChart3,
  Database,
  ChevronDown,
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

interface NavGroup {
  label?:       string;
  key?:         string;   // when set, group is collapsible & state persisted under this key
  defaultOpen?: boolean;  // default expansion when no localStorage value
  items:        NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard', href: routes.dashboard, icon: LayoutDashboard, roles: ['admin','supervisor','assistant'] },
    ],
  },
  {
    label:       'Exam Module',
    key:         'exam',
    defaultOpen: true,
    items: [
      { label: 'Exams',     href: routes.exams,         icon: ClipboardList,   roles: ['admin','supervisor','assistant'] },
      { label: 'Analytics', href: routes.examAnalytics, icon: BarChart3,       roles: ['admin','supervisor','assistant'] },
      { label: 'Students',  href: routes.students,      icon: GraduationCap,   roles: ['admin','supervisor','assistant'] },
      { label: 'Rooms',     href: routes.examRooms,     icon: Laptop,          roles: ['admin'] },
      { label: 'Datasets',  href: routes.datasets,      icon: Database,        roles: ['admin'] },
      { label: 'Cam Overlap', href: routes.cameraOverlap, icon: Laptop,        roles: ['admin'] },
    ],
  },
  {
    label:       'Project Management',
    key:         'pm',
    defaultOpen: false,
    items: [
      { label: 'Sprints',   href: routes.sprints,   icon: Kanban,          roles: ['admin','supervisor','assistant'] },
      { label: 'Calendar',  href: routes.calendar,  icon: CalendarDays,    roles: ['admin','supervisor','assistant'] },
      { label: 'Reports',   href: routes.reports,   icon: ClipboardList,   roles: ['admin','supervisor','assistant'] },
      { label: 'Files',     href: routes.files,     icon: FileText,        roles: ['admin'] },
      { label: 'Trash',     href: routes.filesTrash, icon: Trash2,         roles: ['admin'] },
      { label: 'Team',      href: routes.team,      icon: Users,           roles: ['admin'] },
      { label: 'Feedback',  href: routes.feedback,  icon: MessageSquare,   roles: ['admin','supervisor','assistant'] },
    ],
  },
  {
    items: [
      { label: 'Monitor',   href: routes.monitor,   icon: Activity,        roles: ['admin'] },
    ],
  },
];

const SIDEBAR_GROUPS_LS_KEY = 'horuseye.sidebar.groups';

const COMING_SOON: ComingSoonItem[] = [
  { label: 'Live Monitoring', icon: Monitor },
  { label: 'Devices',         icon: Laptop  },
];

interface SidebarProps {
  role:      UserRole;
  collapsed: boolean;
}

export function Sidebar({ role, collapsed }: SidebarProps) {
  const pathname             = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration guard: must detect client mount
    setMounted(true);
    try {
      const raw = window.localStorage.getItem(SIDEBAR_GROUPS_LS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate persisted accordion state
      if (raw) setOpenGroups(JSON.parse(raw) as Record<string, boolean>);
    } catch { /* ignore corrupted localStorage */ }
  }, []);

  function toggleGroup(key: string, defaultOpen: boolean) {
    setOpenGroups(prev => {
      const current = prev[key] ?? defaultOpen;
      const next = { ...prev, [key]: !current };
      try { window.localStorage.setItem(SIDEBAR_GROUPS_LS_KEY, JSON.stringify(next)); } catch { /* quota or disabled */ }
      return next;
    });
  }

  function isGroupOpen(group: NavGroup): boolean {
    if (!group.key) return true;
    if (!mounted)   return group.defaultOpen ?? true;
    return openGroups[group.key] ?? group.defaultOpen ?? true;
  }

  const visibleGroups = NAV_GROUPS.map(group => ({
    ...group,
    items: group.items.filter(item => item.roles.includes(role)),
  })).filter(group => group.items.length > 0);

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
        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {visibleGroups.map((group, gi) => {
            const collapsible = !!(group.key && group.label && !collapsed);
            const open        = isGroupOpen(group);
            const panelId     = group.key ? `sidebar-group-${group.key}` : undefined;

            return (
              <div key={gi} className="space-y-0.5">
                {group.label && !collapsed && (
                  collapsible ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key!, group.defaultOpen ?? true)}
                      aria-expanded={open}
                      aria-controls={panelId}
                      className="w-full flex items-center justify-between px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        size={12}
                        className={cn(
                          'shrink-0 transition-transform duration-200',
                          !open && '-rotate-90'
                        )}
                      />
                    </button>
                  ) : (
                    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                      {group.label}
                    </p>
                  )
                )}
                {group.label && collapsed && gi > 0 && (
                  <div className="my-2 border-t border-border/40" />
                )}
                {collapsible ? (
                  <div
                    id={panelId}
                    className={cn(
                      'grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none',
                      open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    )}
                  >
                    <div className="overflow-hidden space-y-0.5">
                      {group.items.map(item => <NavLink key={item.href} item={item} />)}
                    </div>
                  </div>
                ) : (
                  group.items.map(item => <NavLink key={item.href} item={item} />)
                )}
              </div>
            );
          })}

          {/* Coming Soon */}
          {!collapsed && (
            <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
              Coming Soon
            </p>
          )}
          {collapsed && <div className="my-2 border-t border-border/40" />}
          <div className="space-y-0.5">
            {COMING_SOON.map(item => <ComingSoonLink key={item.label} item={item} />)}
          </div>
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
