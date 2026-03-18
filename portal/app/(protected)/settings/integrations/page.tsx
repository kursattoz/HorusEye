import type { Metadata } from 'next';
import { redirect }       from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes }         from '@/constants/routes';
import { SmtpTab }        from '@/components/settings/SmtpTab';

export const metadata: Metadata = { title: 'Integrations — HorusEye' };

export default async function IntegrationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (user.role !== 'admin') redirect(routes.settings);
  return <SmtpTab />;
}
