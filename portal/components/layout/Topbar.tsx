'use client';

import { useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeft, ArrowLeft, LogOut, Settings, Loader2 } from 'lucide-react';
import Image from 'next/image';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button }           from '@/components/ui/button';
import { logoutAction }     from '@/app/actions/auth';
import Link                 from 'next/link';
import { routes }           from '@/constants/routes';
import { NotificationBell } from './NotificationBell';

interface TopbarProps {
  user: {
    full_name:  string | null;
    email:      string;
    avatar_url: string | null;
    role:       string;
  };
  sidebarCollapsed:  boolean;
  onToggleSidebar:   () => void;
}

function getInitials(name: string | null, email: string): string {
  if (name) return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return email[0]?.toUpperCase() ?? 'U';
}

export function Topbar({ user, sidebarCollapsed, onToggleSidebar }: TopbarProps) {
  const initials = getInitials(user.full_name, user.email);
  const [signingOut, startSignOut] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  // Show back button on deep pages (e.g. /sprints/123, /reports/456)
  const pathSegments = pathname.split('/').filter(Boolean);
  const isDeepPage = pathSegments.length > 1;

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between pr-4 shrink-0">
      {/* Mobile: back button (deep pages) + logo */}
      <div className="flex md:hidden items-center gap-1 pl-2">
        {isDeepPage && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => router.back()}>
            <ArrowLeft size={16} />
          </Button>
        )}
        <div className="flex items-center gap-2 pl-1">
          <Image src="/images/cover-icon.png" alt="HorusEye" width={28} height={28} className="shrink-0 dark:invert" />
          <Image src="/images/cover-wordmark.png" alt="horuseye" width={80} height={16} className="h-4 w-auto dark:invert" />
        </div>
      </div>

      {/* Desktop: animated sidebar toggle area */}
      <div
        className="hidden md:flex items-center shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out"
        style={{ width: sidebarCollapsed ? '56px' : '224px' }}
      >
        {sidebarCollapsed ? (
          /* Collapsed: icon centered within 56px — matches sidebar nav icon alignment */
          <div className="w-full flex items-center justify-center">
            <button
              onClick={onToggleSidebar}
              aria-label="Expand sidebar"
              className="h-7 w-7 flex items-center justify-center shrink-0 hover:opacity-70 transition-opacity"
            >
              <Image src="/images/cover-icon.png" alt="HorusEye" width={28} height={28} className="dark:invert" />
            </button>
          </div>
        ) : (
          /* Expanded: px-2 outer + px-3 inner matches sidebar nav indent */
          <div className="flex items-center justify-between w-full px-2">
            <div className="flex items-center gap-2 px-1">
              <Image src="/images/cover-icon.png" alt="HorusEye" width={28} height={28} className="shrink-0 dark:invert" />
              <Image src="/images/cover-wordmark.png" alt="horuseye" width={80} height={16} className="h-4 w-auto dark:invert" />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleSidebar}
              className="h-7 w-7 text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Right: notifications + user */}
      <div className="flex items-center gap-1">
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full" aria-label="Account menu">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatar_url ?? undefined} alt={user.full_name ?? user.email} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user.full_name ?? 'User'}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={routes.settings}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={signingOut}
              onSelect={() => startSignOut(() => logoutAction())}
            >
              {signingOut
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <LogOut className="mr-2 h-4 w-4" />}
              {signingOut ? 'Signing out...' : 'Sign Out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
