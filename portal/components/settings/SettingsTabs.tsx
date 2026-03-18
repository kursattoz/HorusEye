'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppearanceTab }  from './AppearanceTab';
import { ProfileTab }     from './ProfileTab';
import { AccountTab }     from './AccountTab';
import { UsersTab }       from './UsersTab';
import { SmtpTab }        from './SmtpTab';

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
  const colCount = isAdmin ? 5 : 3;

  return (
    <Tabs defaultValue="appearance">
      <TabsList className={`grid w-full grid-cols-${colCount}`}>
        <TabsTrigger value="appearance">Appearance</TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="account">Account</TabsTrigger>
        {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
        {isAdmin && <TabsTrigger value="integrations">Integrations</TabsTrigger>}
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
      {isAdmin && (
        <TabsContent value="integrations" className="mt-6">
          <SmtpTab />
        </TabsContent>
      )}
    </Tabs>
  );
}
