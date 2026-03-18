import { getCurrentUser } from '@/app/actions/auth';
import { redirect }       from 'next/navigation';
import { routes }         from '@/constants/routes';
import { ReportDetail }   from '@/components/reports/ReportDetail';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ReportDetailPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const { id } = await params;

  return (
    <div className="space-y-6">
      <ReportDetail deliverableId={id} userId={user.id} />
    </div>
  );
}
