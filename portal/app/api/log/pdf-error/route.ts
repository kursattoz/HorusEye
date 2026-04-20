import { type NextRequest, NextResponse } from 'next/server';
import { logError } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const fileUrl   = typeof body.fileUrl   === 'string' ? body.fileUrl   : 'unknown';
  const fileName  = typeof body.fileName  === 'string' ? body.fileName  : 'unknown';
  const errorMsg  = typeof body.errorMsg  === 'string' ? body.errorMsg  : 'unknown';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : undefined;

  logError({
    event_type:    'file.view',
    resource_type: 'file',
    action:        `PDF render failed: ${fileName}`,
    session_id:    sessionId,
    metadata:      { fileUrl, fileName, errorMsg },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
