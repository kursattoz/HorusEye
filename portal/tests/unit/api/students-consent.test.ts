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

import { POST } from '@/app/api/students/[id]/consent/route';

const MOCK_USER = { id: 'admin-1' };

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

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/students/abc/consent', {
    method:  'POST',
    body:    JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const params = Promise.resolve({ id: 'student-1' });

describe('POST /api/students/[id]/consent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ consent: true }), { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 when student not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const { proxy } = recordingChain({ data: null, error: null });
    mockFrom.mockReturnValue(proxy);
    const res = await POST(makeReq({ consent: true }), { params });
    expect(res.status).toBe(404);
  });

  it('grants consent — stamps face_consent_at', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const { proxy, calls } = recordingChain({
      data: { id: 'student-1', student_id: 'S1', full_name: 'Ali', face_consent_at: '2026-05-05T12:00:00Z' },
      error: null,
    });
    mockFrom.mockReturnValue(proxy);

    const res = await POST(makeReq({ consent: true, notice_version: 'v1' }), { params });
    expect(res.status).toBe(200);

    const updateCall = calls.find(([m]) => m === 'update');
    const updates = updateCall?.[1][0] as { face_consent_at: string | null };
    expect(updates.face_consent_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('revokes consent — wipes embedding fields', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const { proxy, calls } = recordingChain({
      data: { id: 'student-1', student_id: 'S1', full_name: 'Ali', face_consent_at: null },
      error: null,
    });
    mockFrom.mockReturnValue(proxy);

    const res = await POST(makeReq({ consent: false }), { params });
    expect(res.status).toBe(200);

    const updateCall = calls.find(([m]) => m === 'update');
    const updates = updateCall?.[1][0] as Record<string, unknown>;
    expect(updates.face_consent_at).toBeNull();
    expect(updates.face_embedding).toBeNull();
    expect(updates.face_embedding_updated_at).toBeNull();
  });
});
