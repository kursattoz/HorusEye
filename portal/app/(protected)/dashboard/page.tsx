import { getCurrentUser } from '@/app/actions/auth';
import { createClient }  from '@/lib/supabase/server';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { FileText, MessageSquare, Users } from 'lucide-react';

async function getStats() {
  const supabase = await createClient();
  const [files, feedbacks, users] = await Promise.all([
    supabase.from('files').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('feedbacks').select('id', { count: 'exact', head: true }).eq('is_hidden', false),
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);
  return {
    files:     files.count ?? 0,
    feedbacks: feedbacks.count ?? 0,
    users:     users.count ?? 0,
  };
}

export default async function DashboardPage() {
  // getCurrentUser() is already verified by ProtectedLayout — safe to call again
  const user    = await getCurrentUser();
  const isAdmin = user?.role === 'admin';
  const stats   = isAdmin ? await getStats() : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Welcome, {user?.full_name ?? user?.email}
        </p>
      </div>

      {isAdmin && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard title="Files"     value={stats.files}     icon={FileText}      />
          <StatCard title="Comments"  value={stats.feedbacks} icon={MessageSquare} />
          <StatCard title="Users"     value={stats.users}     icon={Users}         />
        </div>
      )}

      {!isAdmin && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Use the <strong>Feedback</strong> section in the left menu to leave comments on files.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ title, value, icon: Icon }: { title: string; value: number; icon: React.ElementType }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon size={16} className="text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
