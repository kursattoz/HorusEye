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

let MOCK_ROLE: 'admin' | 'supervisor' | 'assistant' | null = 'admin';

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
      role: MOCK_ROLE,
    };
  }),
}));

import { GET, PUT } from '@/app/api/settings/ai-thresholds/route';

const MOCK_USER = { id: 'admin-1' };

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

describe('GET /api/settings/ai-thresholds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MOCK_ROLE = 'admin';
  });

  it('rejects unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new NextRequest('http://localhost/api/settings/ai-thresholds'));
    expect(res.status).toBe(401);
  });

  it('returns thresholds list', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chain({
      data: [
        { key: 'phone_in_hand.sustained_seconds', value: 3.0, updated_at: 't', updated_by: null },
      ],
      error: null,
    }));
    const res = await GET(new NextRequest('http://localhost/api/settings/ai-thresholds'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.thresholds).toHaveLength(1);
  });
});

function makePut(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/settings/ai-thresholds', {
    method:  'PUT',
    body:    JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('PUT /api/settings/ai-thresholds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MOCK_ROLE = 'admin';
  });

  it('rejects non-admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    MOCK_ROLE = 'supervisor';
    const res = await PUT(makePut({ key: 'phone_in_hand.sustained_seconds', value: 3.0 }));
    expect(res.status).toBe(403);
  });

  it('rejects malformed key', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await PUT(makePut({ key: 'invalidkey', value: 1.0 }));
    expect(res.status).toBe(400);
  });

  it('rejects non-numeric value', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await PUT(makePut({ key: 'phone_in_hand.cooldown_seconds', value: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('upserts a threshold on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chain({
      data: { key: 'phone_in_hand.sustained_seconds', value: 4.0, updated_at: 'now', updated_by: 'admin-1' },
      error: null,
    }));
    const res = await PUT(makePut({ key: 'phone_in_hand.sustained_seconds', value: 4.0 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.threshold.value).toBe(4.0);
  });
});
