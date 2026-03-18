import type { Metadata } from 'next';
import { redirect }       from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes }         from '@/constants/routes';
import { ProfileTab }     from '@/components/settings/ProfileTab';

export const metadata: Metadata = { title: 'Profile — HorusEye' };

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  return <ProfileTab user={user} />;
}
