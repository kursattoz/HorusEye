// PRD-019 §4.1 — pair-token JWT helper round-trip + tamper / expiry checks.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signPairToken, verifyPairToken } from '@/lib/auth/pair-token';

describe('pair-token JWT', () => {
  const originalSecret = process.env.PAIR_TOKEN_SECRET;

  beforeAll(() => {
    process.env.PAIR_TOKEN_SECRET = 'test-secret-1234567890-abcdefghij';
  });
  afterAll(() => {
    process.env.PAIR_TOKEN_SECRET = originalSecret;
  });

  it('signs and verifies a valid token', () => {
    const token = signPairToken({
      camera_id: 'cam-1',
      session_id: 'ses-1',
      owner_user_id: 'user-1',
    });
    const result = verifyPairToken(token);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.camera_id).toBe('cam-1');
      expect(result.payload.session_id).toBe('ses-1');
      expect(result.payload.owner_user_id).toBe('user-1');
      expect(result.payload.iss).toBe('horuseye-pair');
    }
  });

  it('rejects a tampered payload', () => {
    const token = signPairToken({
      camera_id: 'cam-1',
      session_id: null,
      owner_user_id: 'user-1',
    });
    const parts = token.split('.');
    const fakePayload = Buffer.from(JSON.stringify({
      camera_id: 'cam-evil', session_id: null, owner_user_id: 'attacker',
      iss: 'horuseye-pair', exp: Math.floor(Date.now() / 1000) + 300, iat: 0,
    })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const tampered = `${parts[0]}.${fakePayload}.${parts[2]}`;
    const result = verifyPairToken(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad_signature');
  });

  it('rejects an expired token', () => {
    const token = signPairToken({
      camera_id: 'cam-1',
      session_id: null,
      owner_user_id: 'user-1',
      ttl_seconds: -1,
    });
    const result = verifyPairToken(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('rejects malformed input', () => {
    expect(verifyPairToken('not-a-jwt').ok).toBe(false);
    expect(verifyPairToken('a.b').ok).toBe(false);
    expect(verifyPairToken('a.b.c').ok).toBe(false);  // 3 parts but invalid sig
  });
});
