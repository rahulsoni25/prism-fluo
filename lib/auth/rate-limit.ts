/**
 * lib/auth/rate-limit.ts
 * Lightweight in-memory token-bucket per (key, window). Drop-in replaceable
 * with Redis when you want shared state across edge workers.
 *
 * Usage in a route handler:
 *   import { checkRateLimit, clientIp } from '@/lib/auth/rate-limit';
 *   const ip = clientIp(req);
 *   const rl = checkRateLimit(`login:${ip}`, { max: 5, windowMs: 5 * 60_000 });
 *   if (!rl.ok) return NextResponse.json({ error: rl.message }, { status: 429 });
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Best-effort GC so the map doesn't grow forever on a long-running serverless
// instance. Runs on every check; trivial CPU.
function gc(now: number) {
  if (store.size < 1000) return;
  for (const [k, v] of store) if (v.resetAt < now) store.delete(k);
}

export function checkRateLimit(
  key: string,
  opts: { max: number; windowMs: number },
): { ok: true } | { ok: false; retryAfterSec: number; message: string } {
  const now = Date.now();
  gc(now);
  let b = store.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + opts.windowMs };
    store.set(key, b);
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

/** Build a 429 response with Retry-After header (used by route handlers). */
export function rateLimitResponse(retryAfterSec: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After':  String(retryAfterSec),
    },
  });
}
