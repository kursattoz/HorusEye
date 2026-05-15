import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { DatasetDetail } from '@/components/datasets/DatasetDetail';

export const metadata: Metadata = { title: 'Dataset — HorusEye' };

export default async function DatasetDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (user.role !== 'admin') redirect(routes.dashboard);

  const { id } = await params;
  return <DatasetDetail datasetId={id} />;
}
