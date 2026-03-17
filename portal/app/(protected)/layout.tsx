import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { Topbar }  from '@/components/layout/Topbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { routes }  from '@/constants/routes';
import type { UserRole } from '@/types';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user || !user.is_active) {
    redirect(routes.login);
  }

  return (
    <div className="h-svh flex flex-col">
      <Topbar
        user={{
          full_name:  user.full_name,
          email:      user.email,
          avatar_url: user.avatar_url,
          role:       user.role,
        }}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar role={user.role as UserRole} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
