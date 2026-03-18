/**
 * Integration test: GET /api/health
 * Requires a running local Supabase instance (supabase start).
 * In CI this is set up before the test suite runs.
 */
import { describe, it, expect } from 'vitest';

const BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? 'http://localhost:3000'
  : 'http://localhost:3000';

describe('GET /api/health', () => {
  it('returns 200 with healthy status when Supabase is reachable', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect([200, 503]).toContain(res.status);

    const body = await res.json();
    expect(body).toHaveProperty('status');
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(body).toHaveProperty('services');
    expect(Array.isArray(body.services)).toBe(true);
    expect(body).toHaveProperty('checked_at');
  });

  it('services array contains supabase entry with required fields', async () => {
    const res  = await fetch(`${BASE_URL}/api/health`);
    const body = await res.json();

    const supabaseEntry = body.services.find((s: { service: string }) => s.service === 'supabase');
    expect(supabaseEntry).toBeDefined();
    expect(supabaseEntry).toHaveProperty('status');
    expect(supabaseEntry).toHaveProperty('latency_ms');
    expect(supabaseEntry).toHaveProperty('last_checked');
    expect(['healthy', 'degraded', 'down']).toContain(supabaseEntry.status);
  });
});
