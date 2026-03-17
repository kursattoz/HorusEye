import { redirect }       from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes }         from '@/constants/routes';
import { SettingsTabs }   from '@/components/settings/SettingsTabs';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Ayarlar</h1>
        <p className="text-muted-foreground text-sm mt-1">Hesap ve sistem tercihlerinizi yönetin.</p>
      </div>
      <SettingsTabs user={user} />
    </div>
  );
}
