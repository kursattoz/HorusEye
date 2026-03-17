import { createClient } from '@/lib/supabase/server';
import { PublicLayout } from '@/components/public/PublicLayout';
import type { PublicFile } from '@/components/public/FileTree';

async function getPublicFiles(): Promise<PublicFile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_files')
    .select('id, display_name, file_type, public_url, slug, category, description, created_at');
  return (data ?? []) as PublicFile[];
}

export default async function HomePage() {
  const files = await getPublicFiles();

  return (
    <div className="h-[calc(100svh-3.5rem)] overflow-hidden">
      <PublicLayout files={files} />
    </div>
  );
}
