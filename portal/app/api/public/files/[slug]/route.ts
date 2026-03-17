import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

interface Params { params: Promise<{ slug: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from('public_files')
    .select('id, display_name, file_type, public_url, slug, category, description, created_at')
    .eq('slug', slug)
    .single();

  if (!data) return NextResponse.json({ error: 'File not found.' }, { status: 404 });

  // Log view event (no auth required)
  await log({ event_type: 'file.view', severity: 'info', action: `Viewed file: ${slug}`, metadata: { slug } });

  return NextResponse.json({ file: data });
}
