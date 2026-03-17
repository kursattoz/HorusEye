'use client';

import { useState } from 'react';
import { Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import type { UserRole } from '@/types';

interface AppShellProps {
  user: {
    full_name:  string | null;
    email:      string;
    avatar_url: string | null;
    role:       string;
  };
  role:     UserRole;
  children: React.ReactNode;
}

export function AppShell({ user, role, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="h-svh flex flex-col">
      <Topbar
        user={user}
        sidebarCollapsed={collapsed}
        onToggleSidebar={() => setCollapsed(c => !c)}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar role={role} collapsed={collapsed} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
