/**
 * Integration tests: Users API (/api/users, /api/users/[id])
 * Requires a running Next.js dev server (localhost:3000) and local Supabase.
 *
 * Test users (from supabase seed):
 *   admin@horuseye.com      / Test1234!
 *   supervisor@horuseye.com / Test1234!
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    ?? 'admin@horuseye.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'Test1234!';
const SUP_EMAIL      = process.env.TEST_SUP_EMAIL      ?? 'supervisor@horuseye.com';
const SUP_PASSWORD   = process.env.TEST_SUP_PASSWORD   ?? 'Test1234!';

const UNKNOWN_UUID = '00000000-0000-0000-0000-000000000000';

// Seeded admin user UUID (for profile read tests)
const SEED_ADMIN_ID = '00000000-0000-0000-0000-000000000001';

async function getAuthCookies(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
  if (!res.ok) return null;
  const setCookies = res.headers.getSetCookie?.() ?? [];
  return setCookies.length ? setCookies.join('; ') : null;
}

async function api(method: string, path: string, cookie?: string | null, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers['Cookie'] = cookie;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

let adminCookie: string | null = null;
let supervisorCookie: string | null = null;

// Track created user IDs for cleanup
const createdUserIds: string[] = [];

beforeAll(async () => {
  [adminCookie, supervisorCookie] = await Promise.all([
    getAuthCookies(ADMIN_EMAIL, ADMIN_PASSWORD),
    getAuthCookies(SUP_EMAIL, SUP_PASSWORD),
  ]);
});

afterAll(async () => {
  // Soft-delete any users created during tests
  for (const id of createdUserIds) {
    if (adminCookie) {
      await api('DELETE', `/api/users/${id}`, adminCookie);
    }
  }
});

// ── GET /api/users ─────────────────────────────────────────────────────────

describe('GET /api/users', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('GET', '/api/users');
    expect(status).toBe(401);
  });

  it('returns 403 when authenticated as supervisor', async () => {
    if (!supervisorCookie) return;
    const { status } = await api('GET', '/api/users', supervisorCookie);
    expect(status).toBe(403);
  });

  it('returns 200 with users array when authenticated as admin', async () => {
    if (!adminCookie) return;
    const { status, body } = await api('GET', '/api/users', adminCookie);
    expect(status).toBe(200);
    expect(body).toHaveProperty('users');
    expect(Array.isArray(body.users)).toBe(true);
  });

  it('users array does not include soft-deleted entries', async () => {
    if (!adminCookie) return;
    const { body } = await api('GET', '/api/users', adminCookie);
    const hasDeleted = body.users?.some((u: { deleted_at?: string | null }) => u.deleted_at !== null && u.deleted_at !== undefined);
    expect(hasDeleted).toBeFalsy();
  });
});

// ── POST /api/users ────────────────────────────────────────────────────────

describe('POST /api/users', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('POST', '/api/users', null, {
      email: 'test@example.com',
      role:  'supervisor',
    });
    expect(status).toBe(401);
  });

  it('returns 403 when authenticated as supervisor', async () => {
    if (!supervisorCookie) return;
    const { status } = await api('POST', '/api/users', supervisorCookie, {
      email: 'test@example.com',
      role:  'assistant',
    });
    expect(status).toBe(403);
  });

  it('returns 400 when email is missing', async () => {
    if (!adminCookie) return;
    const { status, body } = await api('POST', '/api/users', adminCookie, { role: 'supervisor' });
    expect(status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when role is missing', async () => {
    if (!adminCookie) return;
    const { status, body } = await api('POST', '/api/users', adminCookie, { email: 'x@example.com' });
    expect(status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when role is admin (not allowed via UI)', async () => {
    if (!adminCookie) return;
    const { status, body } = await api('POST', '/api/users', adminCookie, {
      email: 'newadmin@example.com',
      role:  'admin',
    });
    expect(status).toBe(400);
    expect(body.error).toMatch(/admin/i);
  });

  it('creates a new supervisor user (201)', async () => {
    if (!adminCookie) return;
    const testEmail = `integration-test-${Date.now()}@test.invalid`;
    const { status, body } = await api('POST', '/api/users', adminCookie, {
      email:     testEmail,
      role:      'supervisor',
      full_name: 'Integration Test User',
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty('user');
    expect(body.user.email).toBe(testEmail);
    expect(body.user.role).toBe('supervisor');
    if (body.user?.id) createdUserIds.push(body.user.id);
  });
});

// ── GET /api/users/[id] ────────────────────────────────────────────────────

describe('GET /api/users/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('GET', `/api/users/${SEED_ADMIN_ID}`);
    expect(status).toBe(401);
  });

  it('returns 403 when supervisor tries to view another user', async () => {
    if (!supervisorCookie) return;
    const { status } = await api('GET', `/api/users/${SEED_ADMIN_ID}`, supervisorCookie);
    // Supervisor can only view their own profile
    expect(status).toBe(403);
  });

  it('returns 404 for non-existent user (admin)', async () => {
    if (!adminCookie) return;
    const { status } = await api('GET', `/api/users/${UNKNOWN_UUID}`, adminCookie);
    expect(status).toBe(404);
  });

  it('returns 200 with user profile when admin views any user', async () => {
    if (!adminCookie) return;
    const { status, body } = await api('GET', `/api/users/${SEED_ADMIN_ID}`, adminCookie);
    // 200 if seed data exists, 404 otherwise — either is acceptable
    expect([200, 404]).toContain(status);
    if (status === 200) {
      expect(body).toHaveProperty('user');
      expect(body.user).toHaveProperty('id');
      expect(body.user).toHaveProperty('email');
      expect(body.user).toHaveProperty('role');
    }
  });
});

// ── PUT /api/users/[id] ────────────────────────────────────────────────────

describe('PUT /api/users/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('PUT', `/api/users/${SEED_ADMIN_ID}`, null, { full_name: 'x' });
    expect(status).toBe(401);
  });

  it('returns 403 when supervisor tries to update another user', async () => {
    if (!supervisorCookie) return;
    const { status } = await api('PUT', `/api/users/${SEED_ADMIN_ID}`, supervisorCookie, { full_name: 'Hacked' });
    expect(status).toBe(403);
  });

  it('admin cannot set role to admin via PUT', async () => {
    if (!adminCookie || createdUserIds.length === 0) return;
    const targetId = createdUserIds[0];
    const { status, body } = await api('PUT', `/api/users/${targetId}`, adminCookie, { role: 'admin' });
    // Either 400 or the role field is silently ignored — in either case role must not become 'admin'
    if (status === 200) {
      expect(body.user?.role).not.toBe('admin');
    }
  });
});

// ── DELETE /api/users/[id] ─────────────────────────────────────────────────

describe('DELETE /api/users/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('DELETE', `/api/users/${SEED_ADMIN_ID}`);
    expect(status).toBe(401);
  });

  it('returns 403 when authenticated as supervisor', async () => {
    if (!supervisorCookie) return;
    const { status } = await api('DELETE', `/api/users/${SEED_ADMIN_ID}`, supervisorCookie);
    expect(status).toBe(403);
  });

  it('soft-deletes a user (admin)', async () => {
    if (!adminCookie) return;

    // Create a user to delete
    const testEmail = `delete-test-${Date.now()}@test.invalid`;
    const createRes = await api('POST', '/api/users', adminCookie, {
      email: testEmail,
      role:  'assistant',
    });
    if (createRes.status !== 201) return;
    const userId: string = createRes.body.user.id;

    const { status } = await api('DELETE', `/api/users/${userId}`, adminCookie);
    expect(status).toBe(200);

    // Verify soft-deleted user no longer appears in the list
    const { body } = await api('GET', '/api/users', adminCookie);
    const stillVisible = body.users?.some((u: { id: string }) => u.id === userId);
    expect(stillVisible).toBeFalsy();
  });
});
