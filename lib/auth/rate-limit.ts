/**
 * lib/auth/rate-limit.ts
 *
 * Token-bucket rate limiter with two storage tiers:
 *   • In-memory Map — fast, but resets on every deploy / cold start
 *   • Upstash Redis (REST) — persists across deploys, shared across instances
 *
 * The route handler API is unchanged from before; pass a key + budget,
 * receive an {ok, retryAfterSec} verdict. When Redis env vars are present,
 * we MUST await the Redis check (otherwise an attacker bursting against
 * many cold starts could bypass it). When they aren't, falls back to the
 * synchronous memory bucket.
 *
 * Usage:
 *   const rl = await checkRateLimit(`login:${ip}`, { max: 5, windowMs: 5 * 60_000 });
 *   if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, rl.message);
 *
 * The function is async; callers should await it. (Existing in-memory-only
 * callers from before the migration will see the sync signature still work
 * because the function returns a Promise that resolves to the same shape.)
 */

import { Redis } from '@upstash/redis';

interface Bucket {
  count: number;
  resetAt: number;
}

const memStore = new Map<string, Bucket>();

let _redis: Redis | null | undefined = undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) { _redis = null; return null; }
  try { _redis = new Redis({ url, token: tok }); return _redis; }
  catch { _redis = null; return null; }
}

function gc(now: number) {
  if (memStore.size < 1000) return;
  for (const [k, v] of memStore) if (v.resetAt < now) memStore.delete(k);
}

export type RateLimitVerdict =
  | { ok: true }
  | { ok: false; retryAfterSec: number; message: string };

/**
 * Async check. When Redis is wired, uses INCR + EXPIRE for an accurate
 * shared counter. Otherwise falls back to the in-memory Map (current
 * behaviour). The two paths are mutually exclusive — if Redis is up but
 * a single op fails, we degrade to memory for that call.
 */
export async function checkRateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): Promise<RateLimitVerdict> {
  const now = Date.now();
  const r = redis();

  // ── L2 path: Redis INCR + EXPIRE on first increment ──────────
  if (r) {
    try {
      const rkey = `rl:${key}`;
      const count = await r.incr(rkey);
      if (count === 1) {
        // First hit in this window — set the expiry. PEXPIRE for ms precision.
        await r.pexpire(rkey, opts.windowMs);
      }
      if (count > opts.max) {
        const ttlMs = await r.pttl(rkey);
        const retryAfterSec = ttlMs > 0 ? Math.max(1, Math.ceil(ttlMs / 1000)) : 60;
        return {
          ok: false,
          retryAfterSec,
          message: `Too many attempts. Try again in ${retryAfterSec}s.`,
        };
      }
      return { ok: true };
    } catch {
      // Fall through to in-memory if Redis op fails — graceful degrade
    }
  }

  // ── L1 path: in-memory Map ────────────────────────────────────
  gc(now);
  let b = memStore.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + opts.windowMs };
    memStore.set(key, b);
  }
  b.count++;
  if (b.count > opts.max) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - now) / 1000));
    return {
      ok: false,
      retryAfterSec,
      message: `Too many attempts. Try again in ${retryAfterSec}s.`,
    };
  }
  return { ok: true };
}

/** Extract client IP from common proxy headers — Vercel sets x-forwarded-for. */
export function clientIp(req: { headers: { get: (k: string) => string | null } }): string {
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0]?.trim();
  if (first) return first;
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return 'unknown';
}

/** Build a 429 response with Retry-After header. */
export function rateLimitResponse(retryAfterSec: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After':  String(retryAfterSec),
    },
  });
}
