'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppearanceTab }  from './AppearanceTab';
import { ProfileTab }     from './ProfileTab';
import { AccountTab }     from './AccountTab';
import { UsersTab }       from './UsersTab';

interface SettingsTabsProps {
  user: {
    id:        string;
    email:     string;
    full_name: string | null;
    role:      string;
    avatar_url: string | null;
  };
}

export function SettingsTabs({ user }: SettingsTabsProps) {
  const isAdmin = user.role === 'admin';

  return (
    <Tabs defaultValue="appearance">
      <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-4' : 'grid-cols-3'}`}>
        <TabsTrigger value="appearance">Görünüm</TabsTrigger>
        <TabsTrigger value="profile">Profil</TabsTrigger>
        <TabsTrigger value="account">Hesap</TabsTrigger>
        {isAdmin && <TabsTrigger value="users">Kullanıcılar</TabsTrigger>}
      </TabsList>

      <TabsContent value="appearance" className="mt-6">
        <AppearanceTab />
      </TabsContent>
      <TabsContent value="profile" className="mt-6">
        <ProfileTab user={user} />
      </TabsContent>
      <TabsContent value="account" className="mt-6">
        <AccountTab />
      </TabsContent>
      {isAdmin && (
        <TabsContent value="users" className="mt-6">
          <UsersTab />
        </TabsContent>
      )}
    </Tabs>
  );
}
