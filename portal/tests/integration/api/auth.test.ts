/**
 * Integration test: Auth API routes (/api/auth/me, /api/auth/login, /api/auth/logout)
 * Requires a running local Supabase instance with seed data.
 */
import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3000';

describe('GET /api/auth/me', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/me`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty('error');
  });
});

describe('POST /api/auth/login', () => {
  it('rejects missing credentials with 400', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    });
    expect([400, 422]).toContain(res.status);
  });

  it('rejects invalid credentials with 401', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: 'nobody@example.com', password: 'wrongpassword' }),
    });
    expect([401, 400]).toContain(res.status);
  });
});

describe('POST /api/auth/logout', () => {
  it('succeeds even without an active session', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST' });
    // Logout is idempotent — should not error
    expect([200, 204, 302]).toContain(res.status);
  });
});
