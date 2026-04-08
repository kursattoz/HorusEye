import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ─────────────────────────────────────────────────────────────────────

type MockFn = ReturnType<typeof vi.fn>;
type MockChain = {
  select: MockFn; insert: MockFn; order: MockFn; eq: MockFn;
  is: MockFn; limit: MockFn; maybeSingle: MockFn; single: MockFn;
};

const { mockGetUser, mockSupabase } = vi.hoisted(() => {
  const mockGetUser = vi.fn();

  const chain = {} as MockChain;
  const self = () => chain;
  chain.select      = vi.fn(self);
  chain.insert      = vi.fn(self);
  chain.order       = vi.fn(self);
  chain.eq          = vi.fn(self);
  chain.is          = vi.fn(self);
  chain.limit       = vi.fn(self);
  chain.maybeSingle = vi.fn();
  chain.single      = vi.fn();

  const mockSupabase = {
    auth: { getUser: mockGetUser },
    from: vi.fn(() => chain),
    _chain: chain,
  };

  return { mockGetUser, mockSupabase };
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}));

vi.mock('@/lib/logger', () => ({ log: vi.fn() }));

import { GET, POST } from '@/app/api/backlog/route';

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  });
}

const MOCK_USER = { id: 'user-123' };
const chain: MockChain = mockSupabase._chain;

// ── GET /api/backlog ──────────────────────────────────────────────────────────

describe('GET /api/backlog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire chain methods to return self after clearAllMocks
    const self = () => chain;
    chain.select.mockImplementation(self);
    chain.order.mockImplementation(self);
    chain.eq.mockImplementation(self);
    chain.is.mockImplementation(self);
    chain.limit.mockImplementation(self);
    mockSupabase.from.mockReturnValue(chain);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await GET(makeRequest('GET', 'http://localhost/api/backlog'));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Unauthorized' });
  });

  it('returns items for authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const items = [{ id: 'bi-1', title: 'Task' }];
    // Second order() call is the terminal one — return a resolved promise
    let orderCount = 0;
    chain.order.mockImplementation(() => {
      return ++orderCount >= 2 ? Promise.resolve({ data: items, error: null }) : chain;
    });

    const res = await GET(makeRequest('GET', 'http://localhost/api/backlog'));
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
  });

  it('applies sprint_id filter and resolves', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    // With sprint_id filter: .select().order().order().eq('sprint_id', ...) → resolves
    chain.order.mockReturnValue(chain);
    chain.eq.mockResolvedValue({ data: [], error: null });

    await GET(makeRequest('GET', 'http://localhost/api/backlog?sprint_id=sprint-1'));
    expect(chain.eq).toHaveBeenCalledWith('sprint_id', 'sprint-1');
  });

  it('applies status filter', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    chain.order.mockReturnValue(chain);
    chain.eq.mockResolvedValue({ data: [], error: null });

    await GET(makeRequest('GET', 'http://localhost/api/backlog?status=done'));
    expect(chain.eq).toHaveBeenCalledWith('status', 'done');
  });

  it('applies unassigned filter', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    chain.order.mockReturnValue(chain);
    chain.is.mockResolvedValue({ data: [], error: null });

    await GET(makeRequest('GET', 'http://localhost/api/backlog?unassigned=true'));
    expect(chain.is).toHaveBeenCalledWith('sprint_id', null);
  });

  it('returns 500 on DB error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    let orderCount = 0;
    chain.order.mockImplementation(() => {
      return ++orderCount >= 2 ? Promise.resolve({ data: null, error: { message: 'timeout' } }) : chain;
    });

    const res = await GET(makeRequest('GET', 'http://localhost/api/backlog'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('timeout');
  });
});

// ── POST /api/backlog ─────────────────────────────────────────────────────────

describe('POST /api/backlog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const self = () => chain;
    chain.select.mockImplementation(self);
    chain.insert.mockImplementation(self);
    chain.eq.mockImplementation(self);
    chain.limit.mockImplementation(self);
    mockSupabase.from.mockReturnValue(chain);
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const res = await POST(makeRequest('POST', 'http://localhost/api/backlog', { title: 'T' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when title is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });

    const res = await POST(makeRequest('POST', 'http://localhost/api/backlog', {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Title');
  });

  it('creates item without dev_role and returns 201', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    const created = { id: 'bi-new', title: 'New task' };
    chain.single.mockResolvedValue({ data: created, error: null });

    const res = await POST(makeRequest('POST', 'http://localhost/api/backlog', { title: 'New task' }));
    expect(res.status).toBe(201);
    expect((await res.json()).item.id).toBe('bi-new');
  });

  it('auto-assigns to user matching dev_role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });

    const created = { id: 'bi-new', title: 'FE task', assigned_to: 'user-hilal' };
    let fromCallCount = 0;
    mockSupabase.from.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // Role lookup — maybeSingle resolves with user
        chain.maybeSingle.mockResolvedValueOnce({ data: { id: 'user-hilal' } });
        return chain;
      }
      // Insert
      chain.single.mockResolvedValueOnce({ data: created, error: null });
      return chain;
    });

    const res = await POST(makeRequest('POST', 'http://localhost/api/backlog', {
      title: 'FE task',
      dev_role: 'portal_frontend',
    }));
    expect(res.status).toBe(201);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ assigned_to: 'user-hilal' })
    );
  });

  it('returns 500 on DB insert error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } });
    chain.single.mockResolvedValue({ data: null, error: { message: 'constraint violation' } });

    const res = await POST(makeRequest('POST', 'http://localhost/api/backlog', { title: 'X' }));
    expect(res.status).toBe(500);
  });
});
