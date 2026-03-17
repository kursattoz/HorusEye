import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { routes } from '@/constants/routes';
import { TeamTable } from '@/components/dashboard/team/TeamTable';

async function getUsers() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, role, is_active, avatar_url, created_at, deleted_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect(routes.dashboard);

  const users = await getUsers();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Takım Yönetimi</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Kullanıcıları görüntüleyin, rol atayın veya hesap durumunu değiştirin.
        </p>
      </div>
      <TeamTable users={users} />
    </div>
  );
}
