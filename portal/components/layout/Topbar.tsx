'use client';

import { ChevronLeft, ChevronRight, LogOut, Settings } from 'lucide-react';
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

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4 shrink-0">
      {/* Left: logo + collapse toggle */}
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
            H
          </div>
          <span className="font-semibold text-sm">HorusEye</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed
            ? <ChevronRight className="h-4 w-4" />
            : <ChevronLeft  className="h-4 w-4" />
          }
        </Button>
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
            <DropdownMenuItem>
              <form action={logoutAction} className="w-full">
                <button type="submit" className="flex w-full items-center text-sm">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
