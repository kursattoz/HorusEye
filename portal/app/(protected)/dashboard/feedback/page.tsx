import { getCurrentUser } from '@/app/actions/auth';
import { createClient }   from '@/lib/supabase/server';
import { redirect }       from 'next/navigation';
import { routes }         from '@/constants/routes';
import { FeedbackView }   from '@/components/dashboard/feedback/FeedbackView';

async function getPublicFiles() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_files')
    .select('id, display_name, file_type, public_url, slug, category, description, created_at');
  return data ?? [];
}

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect(routes.login);

  const files = await getPublicFiles();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Dosyaları görüntüleyin ve yorum yapın.
        </p>
      </div>
      <FeedbackView files={files} userRole={user.role} userId={user.id} />
    </div>
  );
}
