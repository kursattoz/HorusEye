/**
 * Integration tests: Files API (/api/files, /api/files/upload, /api/files/[id])
 * Requires a running Next.js dev server (localhost:3000) and local Supabase.
 *
 * Test users (from supabase seed):
 *   admin@horuseye.com      / Test1234!
 *   supervisor@horuseye.com / Test1234!
 */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

const ADMIN_EMAIL    = process.env.TEST_ADMIN_EMAIL    ?? 'admin@horuseye.com';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'Test1234!';
const SUP_EMAIL      = process.env.TEST_SUP_EMAIL      ?? 'supervisor@horuseye.com';
const SUP_PASSWORD   = process.env.TEST_SUP_PASSWORD   ?? 'Test1234!';

/** Login and return the Set-Cookie string to pass on subsequent requests. */
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

beforeAll(async () => {
  [adminCookie, supervisorCookie] = await Promise.all([
    getAuthCookies(ADMIN_EMAIL, ADMIN_PASSWORD),
    getAuthCookies(SUP_EMAIL, SUP_PASSWORD),
  ]);
});

// ── GET /api/files ─────────────────────────────────────────────────────────

describe('GET /api/files', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('GET', '/api/files');
    expect(status).toBe(401);
  });

  it('returns 403 when authenticated as supervisor', async () => {
    if (!supervisorCookie) return; // skip if seed not available
    const { status } = await api('GET', '/api/files', supervisorCookie);
    expect(status).toBe(403);
  });

  it('returns 200 with files array when authenticated as admin', async () => {
    if (!adminCookie) return; // skip if seed not available
    const { status, body } = await api('GET', '/api/files', adminCookie);
    expect(status).toBe(200);
    expect(body).toHaveProperty('files');
    expect(Array.isArray(body.files)).toBe(true);
  });
});

// ── POST /api/files/upload ─────────────────────────────────────────────────

describe('POST /api/files/upload', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await fetch(`${BASE_URL}/api/files/upload`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 403 when authenticated as supervisor', async () => {
    if (!supervisorCookie) return;
    const form = new FormData();
    form.append('display_name', 'test');
    const res = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: { Cookie: supervisorCookie },
      body: form,
    });
    expect(res.status).toBe(403);
  });

  it('returns 400 when no file is provided (admin)', async () => {
    if (!adminCookie) return;
    const form = new FormData();
    form.append('display_name', 'test');
    const res = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: form,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when file type is unsupported (admin)', async () => {
    if (!adminCookie) return;
    const form = new FormData();
    form.append('file', new Blob(['test'], { type: 'application/x-msdownload' }), 'test.exe');
    const res = await fetch(`${BASE_URL}/api/files/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
      body: form,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unsupported/i);
  });
});

// ── GET /api/files/[id] ────────────────────────────────────────────────────

describe('GET /api/files/[id]', () => {
  it('returns 403 when not authenticated', async () => {
    const { status } = await api('GET', '/api/files/00000000-0000-0000-0000-000000000000');
    expect(status).toBe(403);
  });

  it('returns 404 for non-existent file (admin)', async () => {
    if (!adminCookie) return;
    const { status } = await api('GET', '/api/files/00000000-0000-0000-0000-000000000000', adminCookie);
    expect(status).toBe(404);
  });
});

// ── PUT /api/files/[id] ────────────────────────────────────────────────────

describe('PUT /api/files/[id]', () => {
  it('returns 403 when not authenticated', async () => {
    const { status } = await api('PUT', '/api/files/00000000-0000-0000-0000-000000000000', null, { display_name: 'x' });
    expect(status).toBe(403);
  });

  it('returns 403 when authenticated as supervisor', async () => {
    if (!supervisorCookie) return;
    const { status } = await api('PUT', '/api/files/00000000-0000-0000-0000-000000000000', supervisorCookie, { display_name: 'x' });
    expect(status).toBe(403);
  });
});

// ── DELETE /api/files/[id] ─────────────────────────────────────────────────

describe('DELETE /api/files/[id]', () => {
  it('returns 403 when not authenticated', async () => {
    const { status } = await api('DELETE', '/api/files/00000000-0000-0000-0000-000000000000');
    expect(status).toBe(403);
  });

  it('returns 403 when authenticated as supervisor', async () => {
    if (!supervisorCookie) return;
    const { status } = await api('DELETE', '/api/files/00000000-0000-0000-0000-000000000000', supervisorCookie);
    expect(status).toBe(403);
  });
});
