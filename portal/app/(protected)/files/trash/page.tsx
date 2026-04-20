import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { routes } from '@/constants/routes';
import { TrashTable } from '@/components/dashboard/files/TrashTable';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Info } from 'lucide-react';

export default async function FilesTrashPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect(routes.dashboard);

  const admin = await createClient({ serviceRole: true });
  const { data } = await admin
    .from('files')
    .select('id, name, display_name, file_type, file_size_bytes, deleted_at, uploaded_by')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  const files = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href={routes.files}>
            <ArrowLeft size={16} />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Trash</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Soft-deleted files that can be restored.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          Deleted files are kept for <strong className="text-foreground">30 days</strong> before
          being permanently purged. After purge, files cannot be recovered. Use the restore
          button to move a file back to the active files list.
        </p>
      </div>

      <TrashTable files={files} />
    </div>
  );
}
