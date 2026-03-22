import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { CalendarView } from '@/components/calendar/CalendarView';

export const metadata: Metadata = { title: 'Calendar — HorusEye' };

export default async function CalendarPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  return <CalendarView />;
}
