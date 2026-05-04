import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom:    vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}));
vi.mock('@/lib/auth/api', () => ({
  requireAuth: vi.fn().mockImplementation(async () => {
    const { data: { user } } = await mockGetUser();
    if (!user) {
      const { NextResponse } = await import('next/server');
      return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    return {
      ok: true,
      supabase: { auth: { getUser: mockGetUser }, from: mockFrom },
      userId: user.id,
      role: 'admin',
    };
  }),
}));

import { GET } from '@/app/api/ai/ws-config/route';

const MOCK_USER = { id: 'user-123' };

function makeRequest(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/ai/ws-config${qs}`);
}

function chainSession(result: unknown): unknown {
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (prop === 'then') return (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled);
      return () => proxy;
    },
  });
  return proxy;
}

describe('GET /api/ai/ws-config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_SERVICE_API_KEY = 'test-key-123';
    process.env.NEXT_PUBLIC_AI_SERVICE_WS_URL = 'wss://test-ai.example';
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest('?session_id=s1'));
    expect(res.status).toBe(401);
  });

  it('rejects missing session_id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(400);
  });

  it('returns 404 when session does not exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chainSession({ data: null, error: null }));
    const res = await GET(makeRequest('?session_id=missing'));
    expect(res.status).toBe(404);
  });

  it('returns ws_url + api_key on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chainSession({ data: { id: 's1', status: 'active' }, error: null }));
    const res = await GET(makeRequest('?session_id=s1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ws_url).toBe('wss://test-ai.example');
    expect(body.api_key).toBe('test-key-123');
    expect(body.protocol_version).toBe('1.0');
  });
});
