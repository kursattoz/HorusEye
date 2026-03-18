/**
 * Integration test: audit_logs table structure and service_role write access
 * Requires local Supabase (SUPABASE_SERVICE_ROLE_KEY env var).
 */
import { describe, it, expect } from 'vitest';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? 'http://localhost:54321';
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const serviceClient = SVC ? createSupabaseClient(URL, SVC) : null;

describe('audit_logs (service_role)', () => {
  it('accepts all valid severity values', async () => {
    if (!serviceClient) return;

    const severities = ['debug', 'info', 'warn', 'error', 'critical'] as const;
    for (const severity of severities) {
      const { error } = await serviceClient.from('audit_logs').insert({
        event_type: 'auth.login',
        severity,
        action:     `Test insert — severity: ${severity}`,
      });
      expect(error).toBeNull();
    }
  });

  it('rejects invalid severity', async () => {
    if (!serviceClient) return;

    const { error } = await serviceClient.from('audit_logs').insert({
      event_type: 'auth.login',
      severity:   'invalid',
      action:     'should fail constraint',
    });
    expect(error).not.toBeNull();
  });

  it('stores metadata as jsonb', async () => {
    if (!serviceClient) return;

    const metadata = { test: true, value: 42, nested: { key: 'val' } };
    const { error, data } = await serviceClient
      .from('audit_logs')
      .insert({ event_type: 'auth.login', severity: 'info', action: 'jsonb test', metadata })
      .select('metadata')
      .single();

    expect(error).toBeNull();
    expect(data?.metadata).toMatchObject(metadata);
  });
});

describe('error_logs (service_role)', () => {
  it('accepts error and critical severity', async () => {
    if (!serviceClient) return;

    for (const severity of ['error', 'critical'] as const) {
      const { error } = await serviceClient.from('error_logs').insert({
        severity,
        error_message: `Test error — severity: ${severity}`,
      });
      expect(error).toBeNull();
    }
  });

  it('rejects non-error severity', async () => {
    if (!serviceClient) return;

    const { error } = await serviceClient.from('error_logs').insert({
      severity:      'info',
      error_message: 'should fail constraint',
    });
    expect(error).not.toBeNull();
  });
});
