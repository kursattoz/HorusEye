import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import sharp from 'sharp';

interface Params { params: Promise<{ id: string }> }

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const ACCEPTED_TYPES = [...IMAGE_TYPES, ...VIDEO_TYPES, 'application/pdf'];

// Compress images to max 1200px wide, 80% quality
async function compressImage(buffer: Buffer, mimeType: string): Promise<{ data: Buffer; type: string }> {
  let pipeline = sharp(buffer).rotate(); // auto-rotate from EXIF

  if (mimeType === 'image/png') {
    pipeline = pipeline.png({ quality: 80, compressionLevel: 9 });
  } else {
    pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
  }

  const data = await pipeline.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).toBuffer();
  return { data, type: mimeType === 'image/png' ? 'image/png' : 'image/jpeg' };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('backlog_attachments')
    .select('*')
    .eq('backlog_item_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ attachments: data ?? [] });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'File is required' }, { status: 400 });

  if (!ACCEPTED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type. Use JPG, PNG, WebP, MP4, WebM, or PDF.' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File exceeds 20 MB limit.' }, { status: 400 });
  }

  const rawBytes = new Uint8Array(await file.arrayBuffer());
  let uploadBytes: Uint8Array | Buffer = rawBytes;
  let contentType = file.type;

  // Compress images
  if (IMAGE_TYPES.includes(file.type)) {
    const compressed = await compressImage(Buffer.from(rawBytes), file.type);
    uploadBytes = compressed.data;
    contentType = compressed.type;
  }

  // Upload to Supabase Storage
  const adminClient = await createClient({ serviceRole: true });
  const timestamp = Date.now();
  const ext = file.name.split('.').pop() ?? 'bin';
  const storagePath = `backlog/${id}/${timestamp}.${ext}`;

  const { error: uploadError } = await adminClient.storage
    .from('horuseye-files')
    .upload(storagePath, uploadBytes, { contentType, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { data: urlData } = adminClient.storage
    .from('horuseye-files')
    .getPublicUrl(storagePath);

  const { data: attachment, error: insertError } = await supabase
    .from('backlog_attachments')
    .insert({
      backlog_item_id: id,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_type: contentType,
      file_size_bytes: uploadBytes.length,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ attachment }, { status: 201 });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const attachmentId = searchParams.get('attachment_id');
  if (!attachmentId) return NextResponse.json({ error: 'attachment_id required' }, { status: 400 });

  const { error } = await supabase
    .from('backlog_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('backlog_item_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
