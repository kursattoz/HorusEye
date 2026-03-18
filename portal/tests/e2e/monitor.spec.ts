import { test, expect } from '@playwright/test';

test.describe('Health & monitor endpoints', () => {
  test('GET /api/health returns JSON with status field', async ({ request }) => {
    const res  = await request.get('/api/health');
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(['healthy', 'degraded']).toContain(body.status);
    expect(Array.isArray(body.services)).toBe(true);
    expect(typeof body.checked_at).toBe('string');
  });

  test('health response includes supabase service entry', async ({ request }) => {
    const res  = await request.get('/api/health');
    const body = await res.json();
    const sb   = body.services.find((s: { service: string }) => s.service === 'supabase');
    expect(sb).toBeDefined();
    expect(['healthy', 'degraded', 'down']).toContain(sb.status);
    expect(typeof sb.latency_ms).toBe('number');
  });

  test('/monitor page redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/monitor');
    await expect(page).toHaveURL(/\/login/);
  });
});
