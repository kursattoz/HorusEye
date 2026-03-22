import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/logger';

/* ── IP-based rate limiting (in-memory) ── */

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
  count: number;
  firstAttempt: number;
  lockedUntil: number | null;
}

const attempts = new Map<string, AttemptRecord>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0];
    if (first) return first.trim();
  }
  return request.headers.get('x-real-ip') ?? 'unknown';
}

function getRateLimitStatus(ip: string): { blocked: boolean; record: AttemptRecord | undefined } {
  const record = attempts.get(ip);
  if (!record) return { blocked: false, record: undefined };

  const now = Date.now();

  // Currently locked out
  if (record.lockedUntil && record.lockedUntil > now) {
    return { blocked: true, record };
  }

  // Lock expired — clear the record
  if (record.lockedUntil && record.lockedUntil <= now) {
    attempts.delete(ip);
    return { blocked: false, record: undefined };
  }

  // Window expired without lockout — reset
  if (now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    attempts.delete(ip);
    return { blocked: false, record: undefined };
  }

  return { blocked: false, record };
}

function recordFailedAttempt(ip: string): void {
  const now = Date.now();
  const existing = attempts.get(ip);

  if (!existing || now - existing.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAttempt: now, lockedUntil: null });
    return;
  }

  existing.count += 1;

  if (existing.count >= MAX_FAILED_ATTEMPTS) {
    existing.lockedUntil = now + LOCKOUT_DURATION_MS;
  }
}

function clearAttempts(ip: string): void {
  attempts.delete(ip);
}

/* ── Route handler ── */

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Check rate limit before processing
  const { blocked } = getRateLimitStatus(ip);
  if (blocked) {
    await log({
      event_type: 'auth.failed',
      severity: 'warn',
      action: `Login rate limited for IP: ${ip}`,
      metadata: { ip },
    });
    return NextResponse.json(
      { error: 'Too many failed login attempts. Please try again in 15 minutes.' },
      { status: 429 },
    );
  }

  const { email, password } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    recordFailedAttempt(ip);
    await log({ event_type: 'auth.failed', severity: 'warn', action: `Login failed: ${email}`, metadata: { email, ip } });
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  // Successful login — clear any tracked attempts for this IP
  clearAttempts(ip);

  await log({ event_type: 'auth.login', severity: 'info', user_id: data.user.id, action: `Login: ${email}` });
  return NextResponse.json({ user: data.user });
}
