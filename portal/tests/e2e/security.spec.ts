// BL-51 — Security smoke tests: auth gating, IDOR, dangerous methods.
// Runs at the API surface; relies on the dev server being up. No
// authenticated session is established, so every protected resource MUST
// return 401/403 and never 200 + data.

import { test, expect } from '@playwright/test';

test.describe('Auth gating — every protected route returns 401', () => {
  const PROTECTED_GET = [
    '/api/exams',
    '/api/exams/00000000-0000-0000-0000-000000000000',
    '/api/exam-rooms',
    '/api/exam-rooms/00000000-0000-0000-0000-000000000000',
    '/api/exam-sessions',
    '/api/exam-sessions/00000000-0000-0000-0000-000000000000',
    '/api/cameras',
    '/api/students',
    '/api/students/00000000-0000-0000-0000-000000000000',
    '/api/incidents',
    '/api/incidents/00000000-0000-0000-0000-000000000000',
    '/api/ai/ws-config?session_id=00000000-0000-0000-0000-000000000000',
    '/api/sprints',
    '/api/sprints/00000000-0000-0000-0000-000000000000',
    '/api/sprints/analytics',
    '/api/backlog',
  ];

  for (const url of PROTECTED_GET) {
    test(`GET ${url} → 401`, async ({ request }) => {
      const res = await request.get(url);
      expect(res.status()).toBe(401);
    });
  }
});

test.describe('Auth gating — POST without session is rejected', () => {
  test('POST /api/students rejects unauth', async ({ request }) => {
    const res = await request.post('/api/students', {
      data: { student_id: '99999999', full_name: 'X' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/exams rejects unauth', async ({ request }) => {
    const res = await request.post('/api/exams', {
      data: { name: 'X', scheduled_date: '2026-06-15', scheduled_start: '14:00', scheduled_end: '16:00' },
    });
    expect(res.status()).toBe(401);
  });

  test('POST /api/incidents rejects unauth', async ({ request }) => {
    const res = await request.post('/api/incidents', {
      data: { session_id: 'x', incident_type: 'phone_detected', severity: 'high', confidence: 0.9 },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('IDOR — evidence path verification', () => {
  test('GET /api/incidents/[id]/evidence with arbitrary path → 401 (anon) or 404 (auth)', async ({ request }) => {
    // Without auth, we expect 401. The IDOR check protects authenticated
    // users from reading evidence not on the incident's path list — that
    // half is exercised by the unit suite for /api/incidents/[id]/evidence.
    const res = await request.get(
      '/api/incidents/00000000-0000-0000-0000-000000000000/evidence?path=other-session/other-incident/file.jpg',
    );
    expect([401, 404]).toContain(res.status());
  });
});

test.describe('Public health endpoint stays public', () => {
  test('GET /api/health returns 200 without auth', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status');
  });
});

test.describe('XSS surface — login page does not reflect URL params unsafely', () => {
  test('login page does not render arbitrary <script> in URL', async ({ page }) => {
    await page.goto('/login?error=%3Cscript%3Ealert(1)%3C/script%3E');
    // Page content must not contain executable script from the URL
    const html = await page.content();
    // Either the param is escaped or simply ignored — both are fine
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
  });
});
