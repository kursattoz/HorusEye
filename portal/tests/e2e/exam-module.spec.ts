// BL-50 — E2E user journeys for the Exam module (PRD-013).
// All routes are protected → these tests run as anon and assert the auth
// gate redirects + the public-facing shape of the protected pages.
// Authenticated journeys (create exam, import students, open live monitor)
// run via the integration suite where credentials are seeded.

import { test, expect } from '@playwright/test';

test.describe('Exam module — auth gate', () => {
  test('/exams redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/exams');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/exams/new redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/exams/new');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/students redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/students');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/exam-rooms redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/exam-rooms');
    await expect(page).toHaveURL(/\/login/);
  });

  test('/exams/some-id/live redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/exams/00000000-0000-0000-0000-000000000000/live');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Exam module — API auth', () => {
  test('GET /api/exams returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/exams');
    expect(res.status()).toBe(401);
  });

  test('GET /api/students returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/students');
    expect(res.status()).toBe(401);
  });

  test('GET /api/exam-rooms returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/exam-rooms');
    expect(res.status()).toBe(401);
  });

  test('GET /api/incidents returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/incidents');
    expect(res.status()).toBe(401);
  });

  test('GET /api/ai/ws-config requires session_id and auth', async ({ request }) => {
    const res = await request.get('/api/ai/ws-config?session_id=abc');
    expect(res.status()).toBe(401);
  });

  test('POST /api/students rejects unauthenticated insert', async ({ request }) => {
    const res = await request.post('/api/students', {
      data: { student_id: '20210099', full_name: 'Test' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/exams rejects unauthenticated insert', async ({ request }) => {
    const res = await request.post('/api/exams', {
      data: {
        name: 'X', scheduled_date: '2026-06-15',
        scheduled_start: '14:00', scheduled_end: '16:00',
      },
    });
    expect(res.status()).toBe(401);
  });
});
