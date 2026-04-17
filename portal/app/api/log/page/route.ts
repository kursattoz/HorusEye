import { type NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const pathname   = typeof body.pathname   === 'string' ? body.pathname   : '/';
  const userId     = typeof body.userId     === 'string' ? body.userId     : undefined;
  const sessionId  = typeof body.sessionId  === 'string' ? body.sessionId  : undefined;
  const userAgent  = typeof body.userAgent  === 'string' ? body.userAgent  : undefined;

  // Fire-and-forget — do not await, never block the client
  log({
    event_type:    'page.visit',
    severity:      'info',
    user_id:       userId,
    session_id:    sessionId,
    resource_type: 'page',
    action:        `Page visited: ${pathname}`,
    metadata:      { pathname, user_agent: userAgent },
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
