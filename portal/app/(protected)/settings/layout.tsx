import { redirect }       from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes }         from '@/constants/routes';
import { SettingsSidebar } from '@/components/settings/SettingsSidebar';

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and system preferences.</p>
      </div>

      <div className="flex gap-8 items-start">
        <SettingsSidebar isAdmin={user.role === 'admin'} />
        <div className="flex-1 min-w-0">
          {children}
        </div>
      </div>
    </div>
  );
}
