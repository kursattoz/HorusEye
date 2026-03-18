import { NextResponse, type NextRequest } from 'next/server';
import { createClient }                   from '@/lib/supabase/server';

const SIGNED_URL_EXPIRY = 300; // 5 minutes

// GET /d/[id]       → open in browser (302 redirect)
// GET /d/[id]?dl=1  → force download (streams with Content-Disposition: attachment)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || !/^[0-9a-f-]{36}$/.test(id)) {
    return new NextResponse('Not found.', { status: 404 });
  }

  const admin = await createClient({ serviceRole: true });
  const { data: file } = await admin
    .from('files')
    .select('storage_path, is_public, public_url, display_name')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!file) {
    return new NextResponse('File not found.', { status: 404 });
  }

  // Always use signed URLs — never expose permanent Supabase URLs in email links.
  // Login page preview uses public_url directly (not this route).
  const { data: signed, error } = await admin.storage
    .from('horuseye-files')
    .createSignedUrl(file.storage_path, SIGNED_URL_EXPIRY);

  if (error || !signed?.signedUrl) {
    return new NextResponse('File unavailable.', { status: 502 });
  }
  const fileUrl = signed.signedUrl;

  const forceDownload = request.nextUrl.searchParams.get('dl') === '1';

  if (!forceDownload) {
    return NextResponse.redirect(fileUrl, { status: 302 });
  }

  // Stream the file with Content-Disposition: attachment
  const upstream = await fetch(fileUrl);
  if (!upstream.ok) {
    return new NextResponse('File unavailable.', { status: 502 });
  }

  const fileName = file.display_name ?? 'document';
  const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type':        contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
