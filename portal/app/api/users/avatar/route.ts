import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

const MAX_SIZE = 15 * 1024 * 1024; // 15 MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('avatar') as File | null;

  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File must be under 15 MB.' }, { status: 400 });

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Only JPG, PNG, and WebP are allowed.' }, { status: 400 });

  const storagePath = `avatars/${user.id}/${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadErr } = await supabase.storage
    .from('horuseye-files')
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from('horuseye-files').getPublicUrl(storagePath);

  const { error: updateErr } = await supabase
    .from('user_profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  await log({
    event_type: 'user.update',
    severity:   'info',
    user_id:    user.id,
    action:     'Avatar updated',
  });

  return NextResponse.json({ avatar_url: publicUrl });
}
