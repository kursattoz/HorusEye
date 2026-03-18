import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Supabase server before importing logger
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

// Mock Sentry
vi.mock('@sentry/nextjs', () => ({
  captureEvent: vi.fn(),
}));

import { log, logDebug, logInfo, logWarn, logError, logCritical } from '@/lib/logger';

describe('log', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_ENV = 'local';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs to console in local env', async () => {
    await log({ event_type: 'auth.login', severity: 'info', action: 'test' });
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('does not throw on any severity', async () => {
    await expect(log({ event_type: 'auth.failed', severity: 'error', action: 'err' })).resolves.not.toThrow();
    await expect(log({ event_type: 'auth.login', severity: 'critical', action: 'crit' })).resolves.not.toThrow();
    await expect(log({ event_type: 'auth.login', severity: 'warn', action: 'warn' })).resolves.not.toThrow();
    await expect(log({ event_type: 'auth.login', severity: 'debug', action: 'dbg' })).resolves.not.toThrow();
  });

  it('accepts optional metadata', async () => {
    await expect(log({
      event_type: 'auth.login',
      severity: 'info',
      action: 'with-meta',
      metadata: { key: 'value' },
      user_id: 'user-123',
      session_id: 'sess-abc',
    })).resolves.not.toThrow();
  });
});

describe('severity helpers', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_ENV = 'local';
  });

  afterEach(() => vi.restoreAllMocks());

  it('logDebug calls log with debug severity', async () => {
    const spy = vi.spyOn(await import('@/lib/logger'), 'log');
    await logDebug({ event_type: 'auth.login', action: 'debug action' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'debug' }));
  });

  it('logInfo calls log with info severity', async () => {
    const spy = vi.spyOn(await import('@/lib/logger'), 'log');
    await logInfo({ event_type: 'auth.login', action: 'info action' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'info' }));
  });

  it('logWarn calls log with warn severity', async () => {
    const spy = vi.spyOn(await import('@/lib/logger'), 'log');
    await logWarn({ event_type: 'auth.failed', action: 'warn action' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
  });

  it('logError calls log with error severity', async () => {
    const spy = vi.spyOn(await import('@/lib/logger'), 'log');
    await logError({ event_type: 'auth.failed', action: 'error action' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
  });

  it('logCritical calls log with critical severity', async () => {
    const spy = vi.spyOn(await import('@/lib/logger'), 'log');
    await logCritical({ event_type: 'auth.failed', action: 'critical action' });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical' }));
  });
});
