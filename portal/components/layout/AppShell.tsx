'use client';

import { useState } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { ColorThemeInitializer } from './ColorThemeInitializer';
import { usePageTracking } from '@/hooks/usePageTracking';
import type { UserRole } from '@/types';

interface AppShellProps {
  user: {
    id:         string;
    full_name:  string | null;
    email:      string;
    avatar_url: string | null;
    role:       string;
  };
  role:       UserRole;
  colorTheme: string;
  children:   React.ReactNode;
}

export function AppShell({ user, role, colorTheme, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  usePageTracking(user.id);

  return (
    <>
      <ColorThemeInitializer colorTheme={colorTheme} />
      <div className="h-svh flex flex-col">
        <Topbar
          user={user}
          sidebarCollapsed={collapsed}
          onToggleSidebar={() => setCollapsed(c => !c)}
        />
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — hidden on mobile, visible md+ */}
          <div className="hidden md:flex">
            <Sidebar role={role} collapsed={collapsed} />
          </div>
          <main className="flex-1 overflow-y-auto p-6 pb-[calc(1.5rem+64px)] md:pb-6">
            {children}
          </main>
        </div>
      </div>
      {/* Bottom tab bar — mobile only */}
      <BottomNav role={role} />
    </>
  );
}
