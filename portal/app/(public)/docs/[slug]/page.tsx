import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { PublicLayout } from '@/components/public/PublicLayout';
import type { PublicFile } from '@/components/public/FileTree';

interface Props {
  params: Promise<{ slug: string }>;
}

async function getFiles(): Promise<PublicFile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_files')
    .select('id, display_name, file_type, public_url, slug, category, description, created_at');
  return (data ?? []) as PublicFile[];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const files = await getFiles();
  const file  = files.find(f => (f.slug ?? f.id) === slug);
  if (!file) return { title: 'Document Not Found — HorusEye' };
  return {
    title:       `${file.display_name} — HorusEye`,
    description: file.description ?? undefined,
  };
}

export default async function DocPage({ params }: Props) {
  const { slug }  = await params;
  const files     = await getFiles();
  const file      = files.find(f => (f.slug ?? f.id) === slug);

  if (!file) notFound();

  return (
    <div className="h-[calc(100svh-3.5rem)] overflow-hidden">
      <PublicLayout files={files} initialFile={file} />
    </div>
  );
}
