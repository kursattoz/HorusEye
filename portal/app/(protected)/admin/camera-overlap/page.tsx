import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { routes } from '@/constants/routes';
import { OverlapZonesAdmin } from '@/components/cameras/OverlapZonesAdmin';

export const metadata: Metadata = { title: 'Camera Overlap — HorusEye' };

export default async function CameraOverlapPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);
  if (user.role !== 'admin') redirect(routes.dashboard);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Camera overlap zones</h1>
        <p className="text-sm text-muted-foreground">
          Declare which cameras see overlapping ground so the multi-cam coordinator (PRD-013 §3.8 / BL-310) can cross-confirm incidents.
        </p>
      </div>
      <OverlapZonesAdmin />
    </div>
  );
}
