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

import { GET, POST } from '@/app/api/sprints/route';

/** Build a Supabase query chain where the last chained call resolves with `result`. */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const resolve = () => Promise.resolve(result);
  chain.select  = vi.fn(self);
  chain.insert  = vi.fn(self);
  chain.order   = vi.fn(resolve); // final terminal for sprints GET
  chain.or      = vi.fn(resolve); // final terminal for overlap check
  chain.single  = vi.fn(resolve);
  chain.eq      = vi.fn(self);
  chain.is      = vi.fn(resolve);
  return chain;
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/sprints', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const MOCK_USER = { id: 'user-123' };

const MOCK_SPRINTS_RAW = [
  {
    id: 'sprint-1',
    name: 'Sprint 1',
    status: 'active',
    start_date: '2026-03-22',
    end_date: '2026-04-04',
    backlog_items: [
      { id: 'bi-1', status: 'done', estimated_hours: 3 },
      { id: 'bi-2', status: 'todo', estimated_hours: 5 },
    ],
  },
];

// ── GET /api/sprints ──────────────────────────────────────────────────────────

describe('GET /api/sprints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' });
  });

  it('returns sprints with computed item counts', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain({ data: MOCK_SPRINTS_RAW, error: null }));

    const res = await GET();
    expect(res.status).toBe(200);
    const { sprints } = await res.json();
    expect(sprints[0].item_count).toBe(2);
    expect(sprints[0].done_count).toBe(1);
    expect(sprints[0].estimated_hours).toBe(8);
    expect(sprints[0].backlog_items).toBeUndefined();
  });

  it('strips backlog_items from response', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain({ data: MOCK_SPRINTS_RAW, error: null }));

    const { sprints } = await (await GET()).json();
    expect(Object.keys(sprints[0])).not.toContain('backlog_items');
  });

  it('returns 500 on DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'DB error' } }));

    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'DB error' });
  });
});

// ── POST /api/sprints ─────────────────────────────────────────────────────────

describe('POST /api/sprints', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makePostRequest({ name: 'S', start_date: '2026-05-01', end_date: '2026-05-14' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });

    const res = await POST(makePostRequest({ start_date: '2026-05-01', end_date: '2026-05-14' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('required');
  });

  it('returns 400 when end_date is before start_date', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });

    const res = await POST(makePostRequest({ name: 'Bad Sprint', start_date: '2026-05-14', end_date: '2026-05-01' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('before start date');
  });

  it('returns 409 on date overlap', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    mockFrom.mockReturnValue(makeChain({ data: [{ name: 'Sprint 1' }], error: null }));

    const res = await POST(makePostRequest({ name: 'Overlap', start_date: '2026-03-25', end_date: '2026-04-10' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('overlap');
  });

  it('creates sprint and returns 201', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });

    const newSprint = { id: 'sprint-new', name: 'New Sprint', status: 'planning' };
    // First call = overlap check (no overlaps), second call = insert
    mockFrom
      .mockReturnValueOnce(makeChain({ data: [], error: null }))
      .mockReturnValueOnce(makeChain({ data: newSprint, error: null }));

    const res = await POST(makePostRequest({ name: 'New Sprint', start_date: '2026-05-01', end_date: '2026-05-14' }));
    expect(res.status).toBe(201);
    expect((await res.json()).sprint.name).toBe('New Sprint');
  });
});
