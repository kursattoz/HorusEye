import { redirect }  from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { AppShell }  from '@/components/layout/AppShell';
import { routes }    from '@/constants/routes';
import type { UserRole } from '@/types';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  if (!user || !user.is_active) {
    redirect(routes.login);
  }

  return (
    <AppShell
      user={{
        full_name:  user.full_name,
        email:      user.email,
        avatar_url: user.avatar_url,
        role:       user.role,
      }}
      role={user.role as UserRole}
    >
      {children}
    </AppShell>
  );
}
