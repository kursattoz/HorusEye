import { getCurrentUser } from '@/app/actions/auth';
import { redirect }       from 'next/navigation';
import { routes }         from '@/constants/routes';
import { ReportsList }    from '@/components/reports/ReportsList';

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track deliverables, checklists, and deadlines.
        </p>
      </div>
      <ReportsList />
    </div>
  );
}
