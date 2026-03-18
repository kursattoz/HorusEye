/**
 * Integration test: RLS policies on user_profiles, audit_logs, error_logs
 * Requires a running local Supabase instance (supabase start + supabase db reset).
 *
 * Env vars injected by CI from `supabase status --output json`:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL      ?? 'http://localhost:54321';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key';
const SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY     ?? '';

// Unauthenticated client (anon key, no session)
const anonClient = createSupabaseClient(URL, ANON);

// Service-role client (bypasses RLS)
const serviceClient = SVC ? createSupabaseClient(URL, SVC) : null;

describe('RLS — user_profiles', () => {
  it('anonymous cannot read user_profiles', async () => {
    const { data, error } = await anonClient.from('user_profiles').select('id').limit(1);
    // Either returns empty array (RLS filtered) or an error — must not expose rows
    const hasRows = Array.isArray(data) && data.length > 0;
    expect(hasRows).toBe(false);
  });
});

describe('RLS — audit_logs', () => {
  it('anonymous cannot read audit_logs', async () => {
    const { data } = await anonClient.from('audit_logs').select('id').limit(1);
    const hasRows = Array.isArray(data) && data.length > 0;
    expect(hasRows).toBe(false);
  });

  it('service_role can insert into audit_logs', async () => {
    if (!serviceClient) return; // skip if no service role key in this env
    const { error } = await serviceClient.from('audit_logs').insert({
      event_type: 'auth.login',
      severity:   'info',
      action:     'RLS integration test insert',
    });
    expect(error).toBeNull();
  });
});

describe('RLS — error_logs', () => {
  it('anonymous cannot read error_logs', async () => {
    const { data } = await anonClient.from('error_logs').select('id').limit(1);
    const hasRows = Array.isArray(data) && data.length > 0;
    expect(hasRows).toBe(false);
  });
});
