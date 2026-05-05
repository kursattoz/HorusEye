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

import { GET } from '@/app/api/ai-models/metrics/route';

const MOCK_USER = { id: 'user-1' };

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

describe('GET /api/ai-models/metrics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects unauthenticated calls', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(new NextRequest('http://localhost/api/ai-models/metrics'));
    expect(res.status).toBe(401);
  });

  it('aggregates incidents into TP/FP/precision per type', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chain({
      data: [
        { incident_type: 'phone_detected',  proctor_decision: 'violation' },
        { incident_type: 'phone_detected',  proctor_decision: 'violation' },
        { incident_type: 'phone_detected',  proctor_decision: 'clean' },
        { incident_type: 'phone_detected',  proctor_decision: null },
        { incident_type: 'gaze_diversion',  proctor_decision: 'suspicious' },
        { incident_type: 'gaze_diversion',  proctor_decision: 'clean' },
        { incident_type: 'gaze_diversion',  proctor_decision: 'clean' },
      ],
      error: null,
    }));

    const res = await GET(new NextRequest('http://localhost/api/ai-models/metrics'));
    expect(res.status).toBe(200);
    const body = await res.json();

    const phone = body.metrics.find((m: { incident_type: string }) => m.incident_type === 'phone_detected');
    expect(phone).toEqual({
      incident_type:  'phone_detected',
      total:          4,
      decided:        3,
      true_positive:  2,
      false_positive: 1,
      precision:      0.667,
    });

    const gaze = body.metrics.find((m: { incident_type: string }) => m.incident_type === 'gaze_diversion');
    expect(gaze).toEqual({
      incident_type:  'gaze_diversion',
      total:          3,
      decided:        3,
      true_positive:  1,
      false_positive: 2,
      precision:      0.333,
    });
  });

  it('returns precision: null when no decisions yet', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chain({
      data: [
        { incident_type: 'empty_seat', proctor_decision: null },
        { incident_type: 'empty_seat', proctor_decision: null },
      ],
      error: null,
    }));

    const res = await GET(new NextRequest('http://localhost/api/ai-models/metrics'));
    const body = await res.json();
    const seat = body.metrics.find((m: { incident_type: string }) => m.incident_type === 'empty_seat');
    expect(seat.total).toBe(2);
    expect(seat.decided).toBe(0);
    expect(seat.precision).toBeNull();
  });

  it('handles empty incident set', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chain({ data: [], error: null }));
    const res = await GET(new NextRequest('http://localhost/api/ai-models/metrics'));
    const body = await res.json();
    expect(body.metrics).toEqual([]);
  });

  it('sorts metrics by total desc', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(chain({
      data: [
        { incident_type: 'gaze_diversion', proctor_decision: null },
        { incident_type: 'phone_detected', proctor_decision: null },
        { incident_type: 'phone_detected', proctor_decision: null },
        { incident_type: 'phone_detected', proctor_decision: null },
      ],
      error: null,
    }));

    const res = await GET(new NextRequest('http://localhost/api/ai-models/metrics'));
    const body = await res.json();
    expect(body.metrics[0].incident_type).toBe('phone_detected');
    expect(body.metrics[1].incident_type).toBe('gaze_diversion');
  });
});
