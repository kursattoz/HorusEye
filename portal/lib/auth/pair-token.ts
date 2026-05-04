// Camera pair JWT — PRD-019 §4.1.
// HS256, 5-minute TTL, signed with PAIR_TOKEN_SECRET (server-only).

import crypto from 'node:crypto';

const ISS = 'horuseye-pair';
const ALG = 'HS256';
const DEFAULT_TTL_SECONDS = 5 * 60;

export interface PairTokenPayload {
  camera_id: string;
  session_id: string | null;
  owner_user_id: string;
  iss: typeof ISS;
  exp: number;          // unix seconds
  iat: number;
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

function getSecret(): string {
  const secret = process.env.PAIR_TOKEN_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('PAIR_TOKEN_SECRET not configured (min 16 chars)');
  }
  return secret;
}

export function signPairToken(args: {
  camera_id: string;
  session_id: string | null;
  owner_user_id: string;
  ttl_seconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: PairTokenPayload = {
    camera_id: args.camera_id,
    session_id: args.session_id,
    owner_user_id: args.owner_user_id,
    iss: ISS,
    iat: now,
    exp: now + (args.ttl_seconds ?? DEFAULT_TTL_SECONDS),
  };
  const headerB64 = b64urlEncode(Buffer.from(JSON.stringify({ alg: ALG, typ: 'JWT' })));
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest();
  return `${data}.${b64urlEncode(sig)}`;
}

export type PairTokenVerifyResult =
  | { ok: true; payload: PairTokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'wrong_issuer' };

export function verifyPairToken(token: string): PairTokenVerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const givenSig = b64urlDecode(sigB64);
  if (
    expectedSig.length !== givenSig.length ||
    !crypto.timingSafeEqual(expectedSig, givenSig)
  ) {
    return { ok: false, reason: 'bad_signature' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString('utf-8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('camera_id' in parsed) ||
    !('owner_user_id' in parsed) ||
    !('iss' in parsed) ||
    !('exp' in parsed)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  const p = parsed as PairTokenPayload;
  if (p.iss !== ISS) return { ok: false, reason: 'wrong_issuer' };
  if (p.exp <= Math.floor(Date.now() / 1000)) return { ok: false, reason: 'expired' };
  return { ok: true, payload: p };
}
