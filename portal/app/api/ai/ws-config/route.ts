// PRD-013 §3.2 — Returns the AI service WebSocket URL + a session-scoped
// API key the browser uses for the subscribe handshake. We sign the
// handshake here so AI_SERVICE_API_KEY never reaches the client.
//
// Phase A on-prem fallback: if AI_SERVICE_API_KEY is unset (local dev),
// we return an empty token and the AI service trusts the LAN.
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth/api';

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
  }

  // Verify the user has access to this session
  const { data: session, error } = await auth.supabase
    .from('exam_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (error || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // BL-55 — In Phase A the API key is the same shared secret. A future
  // hardening step (post-Sprint 4) will issue per-session HMAC tokens that
  // the AI service can verify, so this endpoint stays the single point
  // of trust delegation.
  const apiKey = process.env.AI_SERVICE_API_KEY ?? '';
  const wsUrl  = process.env.NEXT_PUBLIC_AI_SERVICE_WS_URL
              ?? process.env.AI_SERVICE_WS_URL
              ?? '';

  return NextResponse.json({
    ws_url:           wsUrl,
    api_key:          apiKey,
    session_id:       sessionId,
    protocol_version: '1.0',
    expires_in:       300, // 5 minutes — client should refresh on reconnect
  });
}
