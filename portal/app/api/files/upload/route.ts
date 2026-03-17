import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const MAX_SIZE = 50 * 1024 * 1024;
const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf':                                                      'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':   'docx',
  'image/png':  'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const formData    = await request.formData();
  const file        = formData.get('file') as File | null;
  const displayName = (formData.get('display_name') as string) || file?.name || 'Untitled';
  const category    = (formData.get('category') as string) || 'other';
  const isPublic    = formData.get('is_public') === 'true';

  if (!file) return NextResponse.json({ error: 'File not found.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Maximum file size is 50MB.' }, { status: 400 });

  const fileType = ACCEPTED_TYPES[file.type];
  if (!fileType) return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });

  const bytes      = await file.arrayBuffer();
  const folder     = isPublic ? 'public' : 'private';
  const storagePath = `${folder}/${user.id}/${Date.now()}-${file.name}`;

  const { error: uploadErr } = await supabase.storage
    .from('horuseye-files')
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });

  if (uploadErr) {
    await log({ event_type: 'file.upload', severity: 'error', user_id: user.id, action: `Upload failed: ${uploadErr.message}` });
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from('horuseye-files').getPublicUrl(storagePath);

  const { data: fileRow, error: dbErr } = await supabase.from('files').insert({
    name:            file.name,
    display_name:    displayName,
    file_type:       fileType,
    storage_path:    storagePath,
    public_url:      publicUrl,
    file_size_bytes: file.size,
    is_public:       isPublic,
    uploaded_by:     user.id,
    metadata:        { category, slug: slugify(displayName) },
  }).select().single();

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  await log({ event_type: 'file.upload', severity: 'info', user_id: user.id, action: `Uploaded: ${displayName}`, metadata: { category, is_public: isPublic } });
  return NextResponse.json({ file: fileRow }, { status: 201 });
}
