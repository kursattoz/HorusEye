'use client';

import { useEffect, useState } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { ColorThemeInitializer } from './ColorThemeInitializer';
import type { UserRole } from '@/types';

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

interface AppShellProps {
  user: {
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

  // Restore persisted sidebar state on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === 'true');
    } catch { /* noop */ }
  }, []);

  function toggleSidebar() {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch { /* noop */ }
      return next;
    });
  }

  return (
    <>
      <ColorThemeInitializer colorTheme={colorTheme} />
      <div className="h-svh flex flex-col">
        <Topbar
          user={user}
          sidebarCollapsed={collapsed}
          onToggleSidebar={toggleSidebar}
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
