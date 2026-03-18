import { NextResponse, type NextRequest } from 'next/server';
import { createClient }                   from '@/lib/supabase/server';
import { sendMail }                       from '@/lib/mailer';
import { fileAccessLinkTemplate }         from '@/lib/mailer/templates';

const TEDU_DOMAIN = '@tedu.edu.tr';
const RATE_LIMIT  = 3; // max requests per email per hour

// POST — send a file access link to a @tedu.edu.tr address
export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { email, file_id, action } = body as Record<string, unknown>;
  const isDownload = action === 'download';

  // Validate email domain
  if (typeof email !== 'string' || !email.toLowerCase().endsWith(TEDU_DOMAIN)) {
    return NextResponse.json(
      { error: `Only ${TEDU_DOMAIN} email addresses are accepted.` },
      { status: 400 }
    );
  }
  const normalizedEmail = email.trim().toLowerCase();

  // Validate file_id
  if (typeof file_id !== 'string' || !/^[0-9a-f-]{36}$/.test(file_id)) {
    return NextResponse.json({ error: 'Invalid file.' }, { status: 400 });
  }

  const admin   = await createClient({ serviceRole: true });
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Rate limit per email
  const { count: emailCount } = await admin
    .from('file_access_requests')
    .select('*', { count: 'exact', head: true })
    .eq('email', normalizedEmail)
    .gte('created_at', hourAgo);

  if ((emailCount ?? 0) >= RATE_LIMIT) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again in an hour.' },
      { status: 429 }
    );
  }

  // Verify file exists and is public
  const { data: fileRow } = await admin
    .from('files')
    .select('id, display_name')
    .eq('id', file_id)
    .eq('is_public', true)
    .maybeSingle();

  if (!fileRow) {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }

  // Log the request (for rate limiting)
  await admin
    .from('file_access_requests')
    .insert({ email: normalizedEmail, file_id });

  // Always use the /d/[id] proxy route — it handles both public and private files
  const origin   = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const cleanUrl = `${origin}/d/${fileRow.id}${isDownload ? '?dl=1' : ''}`;

  // Send access link email
  const { subject, html } = fileAccessLinkTemplate({
    fileName: fileRow.display_name,
    openUrl:  cleanUrl,
  });

  sendMail({ to: normalizedEmail, subject, html });

  return NextResponse.json({ success: true });
}
