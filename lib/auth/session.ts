/**
 * lib/auth/session.ts
 * Lightweight session-cookie mechanism — no external auth library required.
 *
 * The cookie is a self-contained signed token (similar in shape to a JWT
 * but stripped to the minimum):
 *
 *   <base64url(payload)>.<base64url(hmacSha256(payload))>
 *
 * Payload is JSON: { userId, email, name?, image?, provider, exp (unix sec) }.
 *
 * Why not Auth.js v5?
 *   - Auth.js requires installing next-auth@beta + @auth/pg-adapter, plus a
 *     verification_tokens table we don't yet have. We can drop it in later
 *     without changing this file's signing format — the cookie name and
 *     payload shape are intentionally compatible (sub-fields chosen to
 *     mirror the Auth.js session shape).
 *   - For the demo / single-OAuth-provider phase, this avoids a dependency
 *     burden and a runtime adapter we'd have to debug.
 *
 * AUTH_SECRET env var must be set in production. Falls back to a clearly
 * insecure dev default if missing — production code paths should have
 * already been gated behind a config check before they reach here.
 */

const COOKIE_NAME = 'prism_session';
const ENCODER     = new TextEncoder();
const DECODER     = new TextDecoder();
const ONE_DAY     = 24 * 60 * 60;
const SESSION_TTL = 7 * ONE_DAY; // 7 days

export interface SessionPayload {
  userId:   string;
  email:    string;
  name?:    string | null;
  image?:   string | null;
  provider: 'demo' | 'google' | 'linkedin';
  exp:      number; // unix seconds
}

function getSecret(): Uint8Array {
  const s = process.env.AUTH_SECRET || 'dev-only-insecure-secret-set-AUTH_SECRET-in-production';
  return ENCODER.encode(s);
}

function b64urlEncode(bytes: Uint8Array | ArrayBuffer): string {
  const bin = String.fromCharCode(...new Uint8Array(bytes as ArrayBuffer));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(payloadB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', getSecret(), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(payloadB64));
  return b64urlEncode(sig);
}

export async function signSession(payload: Omit<SessionPayload, 'exp'>, ttlSeconds = SESSION_TTL): Promise<string> {
  const full: SessionPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const json   = JSON.stringify(full);
  const payB64 = b64urlEncode(ENCODER.encode(json));
  const sig    = await hmac(payB64);
  return `${payB64}.${sig}`;
}

export async function verifySession(token: string | null | undefined): Promise<SessionPayload | null> {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payB64 = token.slice(0, dot);
  const sig    = token.slice(dot + 1);

  const expectedSig = await hmac(payB64);
  // Constant-time compare to resist timing attacks
  if (expectedSig.length !== sig.length) return null;
  let mismatch = 0;
  for (let i = 0; i < expectedSig.length; i++) mismatch |= expectedSig.charCodeAt(i) ^ sig.charCodeAt(i);
  if (mismatch) return null;

  try {
    const payload = JSON.parse(DECODER.decode(b64urlDecode(payB64))) as SessionPayload;
    if (!payload.userId || !payload.email) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path:     '/',
  // `secure` flips on automatically in production (Railway terminates TLS).
  secure:   process.env.NODE_ENV === 'production',
  maxAge:   SESSION_TTL,
};
