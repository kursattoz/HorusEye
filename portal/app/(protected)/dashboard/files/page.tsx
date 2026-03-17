import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/app/actions/auth';
import { createClient } from '@/lib/supabase/server';
import { routes } from '@/constants/routes';
import { FilesTable } from '@/components/dashboard/files/FilesTable';

async function getFiles() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('files')
    .select('id, display_name, name, file_type, file_size_bytes, is_public, storage_path, public_url, metadata, created_at, uploaded_by, deleted_at, blurred_page, sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  return data ?? [];
}

export default async function FilesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') redirect(routes.dashboard);

  const files = await getFiles();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Files</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Upload, edit, and manage project files.
        </p>
      </div>
      <FilesTable files={files} />
    </div>
  );
}
