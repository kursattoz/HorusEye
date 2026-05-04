// PRD-019 — Camera pairing & multi-camera session binding (Sprint 6).
// API-level auth gate + public /cam-pair page behaviour. Authenticated
// happy paths (pair-token issuance, session-camera attach, fixed-room
// 409, ownership 403) require seeded users — run those in the integration
// suite (`npm run test:integration`).

import { test, expect } from '@playwright/test';

test.describe('Camera pairing — public surface', () => {
  test('/cam-pair without token shows the missing-token page', async ({ page }) => {
    await page.goto('/cam-pair');
    await expect(page.getByText(/eksik token/i)).toBeVisible();
    await expect(page).toHaveURL(/\/cam-pair/);
  });

  test('/cam-pair with bogus token shows invalid-token page', async ({ page }) => {
    await page.goto('/cam-pair?token=not-a-real-jwt');
    await expect(page.getByText(/geçersiz token|token süresi/i)).toBeVisible();
  });
});

test.describe('Camera pairing — API auth gate', () => {
  test('POST /api/cameras/pair-token requires auth', async ({ request }) => {
    const res = await request.post('/api/cameras/pair-token', {
      data: { label: 'test phone' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /api/cameras/pair/redeem?token=missing returns 400', async ({ request }) => {
    const res = await request.get('/api/cameras/pair/redeem');
    expect(res.status()).toBe(400);
  });

  test('GET /api/cameras/pair/redeem?token=bogus returns 401', async ({ request }) => {
    const res = await request.get('/api/cameras/pair/redeem?token=not-a-jwt');
    expect(res.status()).toBe(401);
  });

  test('GET /api/exam-sessions/:id/cameras requires auth', async ({ request }) => {
    const res = await request.get('/api/exam-sessions/00000000-0000-0000-0000-000000000000/cameras');
    expect(res.status()).toBe(401);
  });

  test('POST /api/exam-sessions/:id/cameras requires auth', async ({ request }) => {
    const res = await request.post('/api/exam-sessions/00000000-0000-0000-0000-000000000000/cameras', {
      data: { camera_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/cameras/:id/health-event without auth and without bearer returns 401', async ({ request }) => {
    const res = await request.post('/api/cameras/00000000-0000-0000-0000-000000000000/health-event', {
      data: { event_type: 'connected' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/cameras/:id/health-event with malformed Bearer falls back to Supabase auth → 401', async ({ request }) => {
    const res = await request.post('/api/cameras/00000000-0000-0000-0000-000000000000/health-event', {
      data: { event_type: 'connected' },
      headers: { 'Authorization': 'Bearer garbage.token.value' },
    });
    expect(res.status()).toBe(401);
  });
});
