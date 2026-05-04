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
vi.mock('@/lib/logger', () => ({ log: vi.fn().mockResolvedValue(undefined) }));
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

import { GET, POST } from '@/app/api/incidents/route';

const MOCK_USER = { id: 'user-123' };
const VALID_BODY = {
  session_id:    'session-1',
  incident_type: 'phone_detected',
  severity:      'high',
  confidence:    0.85,
};

function chain(result: unknown): unknown {
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (prop === 'then') return (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled);
      return () => proxy;
    },
  });
  return proxy;
}

describe('GET /api/incidents', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new NextRequest('http://localhost/api/incidents'));
    expect(res.status).toBe(401);
  });

  it('returns incident list with default ordering', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chain({
      data: [{ id: 'inc-1', incident_type: 'phone_detected', severity: 'high' }],
      error: null,
    }));
    const res = await GET(new NextRequest('http://localhost/api/incidents'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.incidents).toHaveLength(1);
  });
});

describe('POST /api/incidents', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/incidents', {
      method:  'POST',
      body:    JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('rejects missing session_id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({ ...VALID_BODY, session_id: '' }));
    expect(res.status).toBe(400);
  });

  it('rejects bad incident_type', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({ ...VALID_BODY, incident_type: 'fake_thing' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/incident_type/);
  });

  it('rejects bad severity', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({ ...VALID_BODY, severity: 'mild' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/severity/);
  });

  it('rejects confidence outside 0-1', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({ ...VALID_BODY, confidence: 2 }));
    expect(res.status).toBe(400);
  });

  it('creates incident on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chain(
      { data: { id: 'inc-new', ...VALID_BODY, occurred_at: '2026-05-04T12:00:00Z' }, error: null },
    ));
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect((await res.json()).incident.incident_type).toBe('phone_detected');
  });
});
