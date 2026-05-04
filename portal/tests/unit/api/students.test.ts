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

import { GET, POST } from '@/app/api/students/route';

// Build a chain that's both fluent (every method returns the chain) and
// awaitable (has .then() resolving with `result`). Mirrors PostgrestBuilder.
function makeChain(result: unknown) {
  const target: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(target, {
    get(_t, prop) {
      if (prop === 'then') return (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(result).then(onFulfilled);
      // Any other property → chainable function returning the same proxy
      return () => proxy;
    },
  });
  return proxy as Record<string, ReturnType<typeof vi.fn>>;
}

const MOCK_USER = { id: 'user-123' };

describe('GET /api/students', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new NextRequest('http://localhost/api/students');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('returns active students by default', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain({
      data: [{ id: 's1', student_id: '20210001', full_name: 'Ayşe', is_active: true }],
      error: null,
    }));
    const req = new NextRequest('http://localhost/api/students');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.students).toHaveLength(1);
    expect(body.students[0].student_id).toBe('20210001');
  });

  it('returns 500 on DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB boom' } }));
    const req = new NextRequest('http://localhost/api/students');
    const res = await GET(req);
    expect(res.status).toBe(500);
  });
});

describe('POST /api/students', () => {
  beforeEach(() => vi.clearAllMocks());

  function makeRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/students', {
      method:  'POST',
      body:    JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('rejects invalid student_id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({ student_id: '', full_name: 'X' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/student_id/);
  });

  it('rejects missing full_name', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({ student_id: '20210001', full_name: '' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/full_name/);
  });

  it('rejects invalid email', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const res = await POST(makeRequest({
      student_id: '20210001', full_name: 'Ayşe', email: 'not-an-email',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
  });

  it('returns 409 on duplicate student_id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain(
      { data: null, error: { code: '23505', message: 'duplicate' } },
      'single',
    ));
    const res = await POST(makeRequest({
      student_id: '20210001', full_name: 'Ayşe',
    }));
    expect(res.status).toBe(409);
  });

  it('creates and returns 201 on happy path', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain(
      { data: { id: 'new-uuid', student_id: '20210001', full_name: 'Ayşe', email: null, department: null, is_active: true, created_at: '', updated_at: '' }, error: null },
      'single',
    ));
    const res = await POST(makeRequest({
      student_id: '20210001', full_name: 'Ayşe',
    }));
    expect(res.status).toBe(201);
    expect((await res.json()).student.student_id).toBe('20210001');
  });
});
