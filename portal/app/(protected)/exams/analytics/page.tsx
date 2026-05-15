// BL-243 — Trends dashboard across all exams.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { ExamAnalytics } from '@/components/exams/ExamAnalytics';

export const metadata: Metadata = { title: 'Exam analytics — HorusEye' };

export default async function ExamAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  return <ExamAnalytics />;
}
