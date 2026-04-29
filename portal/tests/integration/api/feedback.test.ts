/**
 * Integration tests: Feedback API (/api/feedback, /api/feedback/[id], /api/feedback/[id]/resolve)
 * Requires a running Next.js dev server (localhost:3000) and local Supabase.
 *
 * Test users (from supabase seed):
 *   admin@horuseye.com      / Test1234!
 *   supervisor@horuseye.com / Test1234!
 *   assistant@horuseye.com  / Test1234!
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

const ADMIN_EMAIL      = process.env.TEST_ADMIN_EMAIL      ?? 'admin@horuseye.com';
const ADMIN_PASSWORD   = process.env.TEST_ADMIN_PASSWORD   ?? 'Test1234!';
const SUP_EMAIL        = process.env.TEST_SUP_EMAIL        ?? 'supervisor@horuseye.com';
const SUP_PASSWORD     = process.env.TEST_SUP_PASSWORD     ?? 'Test1234!';
const ASST_EMAIL       = process.env.TEST_ASST_EMAIL       ?? 'assistant@horuseye.com';
const ASST_PASSWORD    = process.env.TEST_ASST_PASSWORD    ?? 'Test1234!';

// Seeded test file UUID (from supabase/seed.sql)
const SEED_FILE_ID = '10000000-0000-0000-0000-000000000001';
const UNKNOWN_UUID = '00000000-0000-0000-0000-000000000000';

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
let assistantCookie: string | null = null;

// Track created feedback IDs for cleanup
const createdFeedbackIds: string[] = [];

beforeAll(async () => {
  [adminCookie, supervisorCookie, assistantCookie] = await Promise.all([
    getAuthCookies(ADMIN_EMAIL, ADMIN_PASSWORD),
    getAuthCookies(SUP_EMAIL, SUP_PASSWORD),
    getAuthCookies(ASST_EMAIL, ASST_PASSWORD),
  ]);
});

afterAll(async () => {
  // Soft-delete any feedback created during tests
  for (const id of createdFeedbackIds) {
    if (adminCookie) {
      await api('DELETE', `/api/feedback/${id}`, adminCookie);
    }
  }
});

// ── GET /api/feedback ──────────────────────────────────────────────────────

describe('GET /api/feedback', () => {
  it('returns 400 when file_id param is missing', async () => {
    const { status, body } = await api('GET', '/api/feedback');
    expect(status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 200 with empty array for unknown file_id (no auth required)', async () => {
    const { status, body } = await api('GET', `/api/feedback?file_id=${UNKNOWN_UUID}`);
    expect(status).toBe(200);
    expect(body).toHaveProperty('feedbacks');
    expect(Array.isArray(body.feedbacks)).toBe(true);
  });

  it('filters by resolved=false', async () => {
    const { status, body } = await api('GET', `/api/feedback?file_id=${UNKNOWN_UUID}&resolved=false`);
    expect(status).toBe(200);
    expect(Array.isArray(body.feedbacks)).toBe(true);
  });
});

// ── POST /api/feedback ─────────────────────────────────────────────────────

describe('POST /api/feedback', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('POST', '/api/feedback', null, {
      file_id: SEED_FILE_ID,
      content: 'Test feedback',
    });
    expect(status).toBe(401);
  });

  it('returns 403 when authenticated as assistant', async () => {
    if (!assistantCookie) return;
    const { status } = await api('POST', '/api/feedback', assistantCookie, {
      file_id: SEED_FILE_ID,
      content: 'Test feedback from assistant',
    });
    expect(status).toBe(403);
  });

  it('returns 400 when file_id is missing', async () => {
    if (!supervisorCookie) return;
    const { status, body } = await api('POST', '/api/feedback', supervisorCookie, {
      content: 'Missing file_id',
    });
    expect(status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('returns 400 when content is missing', async () => {
    if (!supervisorCookie) return;
    const { status, body } = await api('POST', '/api/feedback', supervisorCookie, {
      file_id: SEED_FILE_ID,
    });
    expect(status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('creates general feedback as supervisor (201)', async () => {
    if (!supervisorCookie) return;
    const { status, body } = await api('POST', '/api/feedback', supervisorCookie, {
      file_id:       SEED_FILE_ID,
      content:       'Integration test — general feedback',
      feedback_type: 'general',
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty('feedback');
    expect(body.feedback).toHaveProperty('id');
    expect(body.feedback.feedback_type).toBe('general');
    if (body.feedback?.id) createdFeedbackIds.push(body.feedback.id);
  });

  it('creates inline feedback with line_ref as supervisor (201)', async () => {
    if (!supervisorCookie) return;
    const { status, body } = await api('POST', '/api/feedback', supervisorCookie, {
      file_id:       SEED_FILE_ID,
      content:       'Integration test — inline feedback',
      feedback_type: 'inline',
      line_ref:      '2:15',
    });
    expect(status).toBe(201);
    expect(body.feedback.feedback_type).toBe('inline');
    expect(body.feedback.line_ref).toBe('2:15');
    if (body.feedback?.id) createdFeedbackIds.push(body.feedback.id);
  });

  it('creates feedback as admin (201)', async () => {
    if (!adminCookie) return;
    const { status, body } = await api('POST', '/api/feedback', adminCookie, {
      file_id: SEED_FILE_ID,
      content: 'Integration test — admin feedback',
    });
    expect(status).toBe(201);
    expect(body).toHaveProperty('feedback');
    if (body.feedback?.id) createdFeedbackIds.push(body.feedback.id);
  });
});

// ── GET /api/feedback/[id] ─────────────────────────────────────────────────

describe('GET /api/feedback/[id]', () => {
  it('returns 404 for non-existent feedback (no auth required)', async () => {
    const { status } = await api('GET', `/api/feedback/${UNKNOWN_UUID}`);
    expect(status).toBe(404);
  });
});

// ── PUT /api/feedback/[id] ─────────────────────────────────────────────────

describe('PUT /api/feedback/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('PUT', `/api/feedback/${UNKNOWN_UUID}`, null, { content: 'updated' });
    expect(status).toBe(401);
  });
});

// ── DELETE /api/feedback/[id] ──────────────────────────────────────────────

describe('DELETE /api/feedback/[id]', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('DELETE', `/api/feedback/${UNKNOWN_UUID}`);
    expect(status).toBe(401);
  });

  it('returns 403 when authenticated as supervisor', async () => {
    if (!supervisorCookie) return;
    const { status } = await api('DELETE', `/api/feedback/${UNKNOWN_UUID}`, supervisorCookie);
    expect(status).toBe(403);
  });
});

// ── POST /api/feedback/[id]/resolve ───────────────────────────────────────

describe('POST /api/feedback/[id]/resolve', () => {
  it('returns 401 when not authenticated', async () => {
    const { status } = await api('POST', `/api/feedback/${UNKNOWN_UUID}/resolve`);
    expect(status).toBe(401);
  });

  it('returns 403 when authenticated as supervisor', async () => {
    if (!supervisorCookie) return;
    const { status } = await api('POST', `/api/feedback/${UNKNOWN_UUID}/resolve`, supervisorCookie);
    expect(status).toBe(403);
  });

  it('resolve sets resolved=true on existing feedback (admin)', async () => {
    if (!adminCookie || !supervisorCookie) return;

    // Create a feedback to resolve
    const createRes = await api('POST', '/api/feedback', supervisorCookie, {
      file_id: SEED_FILE_ID,
      content: 'Integration test — to be resolved',
    });
    if (createRes.status !== 201) return;
    const feedbackId: string = createRes.body.feedback.id;
    createdFeedbackIds.push(feedbackId);

    const { status, body } = await api('POST', `/api/feedback/${feedbackId}/resolve`, adminCookie);
    expect(status).toBe(200);
    expect(body.feedback.resolved).toBe(true);
    expect(body.feedback.resolved_by).toBeTruthy();
  });
});
