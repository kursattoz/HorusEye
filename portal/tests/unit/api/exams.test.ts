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

import { GET, POST } from '@/app/api/exams/route';

function makeChain(result: unknown): unknown {
  const proxy: unknown = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (prop === 'then') return (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled);
      return () => proxy;
    },
  });
  return proxy;
}

const MOCK_USER = { id: 'user-123' };

describe('GET /api/exams', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new NextRequest('http://localhost/api/exams'));
    expect(res.status).toBe(401);
  });

  it('returns exam list', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain({
      data: [{ id: 'e1', name: 'Final', status: 'scheduled' }],
      error: null,
    }));
    const res = await GET(new NextRequest('http://localhost/api/exams'));
    expect(res.status).toBe(200);
    expect((await res.json()).exams).toHaveLength(1);
  });
});

describe('POST /api/exams validation', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/exams', {
      method:  'POST',
      body:    JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('rejects missing name', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({
      name: '',
      scheduled_date: '2026-06-15',
      scheduled_start: '14:00',
      scheduled_end: '16:00',
    }));
    expect(res.status).toBe(400);
  });

  it('rejects bad date format', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({
      name: 'Final', scheduled_date: '15-06-2026', scheduled_start: '14:00', scheduled_end: '16:00',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/scheduled_date/);
  });

  it('rejects bad time format', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({
      name: 'Final', scheduled_date: '2026-06-15', scheduled_start: '2pm', scheduled_end: '16:00',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/scheduled_start/);
  });

  it('rejects out-of-range duration', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({
      name: 'Final', scheduled_date: '2026-06-15',
      scheduled_start: '14:00', scheduled_end: '16:00', duration_minutes: 1000,
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/duration/);
  });

  it('creates exam on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain(
      { data: { id: 'new-exam', name: 'Final', scheduled_date: '2026-06-15', status: 'scheduled' }, error: null },
      'single',
    ));
    const res = await POST(makeRequest({
      name: 'Final', scheduled_date: '2026-06-15',
      scheduled_start: '14:00', scheduled_end: '16:00', duration_minutes: 120,
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).exam.name).toBe('Final');
  });
});
