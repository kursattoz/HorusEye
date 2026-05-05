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

// BL-189 — capture the full builder call chain so filter tests can assert
// which methods (eq, gte, lte, range, …) were invoked with which args.
function recordingChain(result: unknown): { proxy: unknown; calls: Array<[string, unknown[]]> } {
  const calls: Array<[string, unknown[]]> = [];
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (prop === 'then') return (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled);
      return (...args: unknown[]) => {
        calls.push([String(prop), args]);
        return proxy;
      };
    },
  });
  return { proxy, calls };
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
      data:  [{ id: 'inc-1', incident_type: 'phone_detected', severity: 'high' }],
      error: null,
      count: 1,
    }));
    const res = await GET(new NextRequest('http://localhost/api/incidents'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.incidents).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(20);
  });

  it('applies session_id, severity, incident_type, and date filters', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const { proxy, calls } = recordingChain({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(proxy);

    const url = 'http://localhost/api/incidents?session_id=s1&severity=high&incident_type=phone_detected&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z';
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(200);

    const eqCalls  = calls.filter(([m]) => m === 'eq');
    const gteCalls = calls.filter(([m]) => m === 'gte');
    const lteCalls = calls.filter(([m]) => m === 'lte');
    expect(eqCalls).toContainEqual(['eq', ['session_id',    's1']]);
    expect(eqCalls).toContainEqual(['eq', ['severity',      'high']]);
    expect(eqCalls).toContainEqual(['eq', ['incident_type', 'phone_detected']]);
    expect(gteCalls[0]?.[1][0]).toBe('occurred_at');
    expect(lteCalls[0]?.[1][0]).toBe('occurred_at');
  });

  it('rejects out-of-range incident_type silently (no eq call)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const { proxy, calls } = recordingChain({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(proxy);

    await GET(new NextRequest('http://localhost/api/incidents?incident_type=hacking'));
    const eqCalls = calls.filter(([m]) => m === 'eq');
    // No eq for incident_type since the value isn't whitelisted
    expect(eqCalls.find(([, args]) => args[0] === 'incident_type')).toBeUndefined();
  });

  it('paginates via range() with computed offsets', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const { proxy, calls } = recordingChain({ data: [], error: null, count: 250 });
    mockFrom.mockReturnValue(proxy);

    const res = await GET(new NextRequest('http://localhost/api/incidents?page=3&limit=50'));
    const body = await res.json();
    expect(body.page).toBe(3);
    expect(body.limit).toBe(50);
    expect(body.total).toBe(250);

    const rangeCalls = calls.filter(([m]) => m === 'range');
    expect(rangeCalls[0]?.[1]).toEqual([100, 149]);  // (3-1)*50 to 3*50-1
  });

  it('caps limit at 100', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const { proxy, calls } = recordingChain({ data: [], error: null, count: 0 });
    mockFrom.mockReturnValue(proxy);

    const res = await GET(new NextRequest('http://localhost/api/incidents?limit=500'));
    const body = await res.json();
    expect(body.limit).toBe(100);
    const rangeCalls = calls.filter(([m]) => m === 'range');
    expect(rangeCalls[0]?.[1]).toEqual([0, 99]);
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
