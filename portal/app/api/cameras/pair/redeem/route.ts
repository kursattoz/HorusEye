// PRD-019 §4.1 — GET /api/cameras/pair/redeem?token=...
// Public route — token-only auth. Used by phone (after QR scan) to fetch the
// AI publish endpoint URL, the api_key it must send in the publish handshake,
// and the camera_id it owns. The token is single-issue / time-bound (5 min).
import { NextResponse, type NextRequest } from 'next/server';
import { verifyPairToken } from '@/lib/auth/pair-token';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'token query param required' }, { status: 400 });
  }

  const result = verifyPairToken(token);
  if (!result.ok) {
    const status = result.reason === 'expired' ? 410 : 401;
    return NextResponse.json({ error: `pair token ${result.reason}` }, { status });
  }

  const wsBase = process.env.NEXT_PUBLIC_AI_SERVICE_WS_URL ?? process.env.AI_SERVICE_WS_URL ?? '';
  const apiKey = process.env.AI_SERVICE_API_KEY ?? '';

  const { camera_id, session_id, owner_user_id } = result.payload;

  // Build the publish URL only if we know the session — telephone publishes a
  // session-bound stream; without it the phone can still preview but the AI
  // pipeline won't ingest. Surface the situation to the client clearly.
  const ws_publish_url = session_id && wsBase
    ? `${wsBase.replace(/\/+$/, '')}/ws/sessions/${session_id}/publish`
    : null;

  return NextResponse.json({
    camera_id,
    session_id,
    owner_user_id,
    ws_publish_url,
    api_key: apiKey,
    protocol_version: '1.1',
  });
}
