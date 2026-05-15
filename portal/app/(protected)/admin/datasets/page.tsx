import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { DatasetsList } from '@/components/datasets/DatasetsList';

export const metadata: Metadata = { title: 'Datasets — HorusEye' };

export default async function DatasetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (user.role !== 'admin') redirect(routes.dashboard);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Datasets</h1>
        <p className="text-sm text-muted-foreground">
          AI training corpora — imports, validations, merges. PRD-017 §15.
        </p>
      </div>
      <DatasetsList />
    </div>
  );
}
