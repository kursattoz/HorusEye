// BL-224 — Per-student profile page (demographics + risk + past sessions).
// Sub-components: RiskScoreCard, IncidentsTimeline (BL-227), IncidentCharts (BL-231).
import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { StudentProfile } from '@/components/students/StudentProfile';

interface Params { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: 'Student profile — HorusEye' };

export default async function StudentDetailPage({ params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  // UUID gate — quick reject for bad URLs without hitting the API.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    notFound();
  }

  return <StudentProfile studentUuid={id} />;
}
