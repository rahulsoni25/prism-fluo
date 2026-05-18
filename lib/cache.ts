/**
 * lib/cache.ts
 *
 * Two-tier TTL cache:
 *   L1 — in-process Map (sub-ms reads, lost on cold start)
 *   L2 — Upstash Redis (REST, survives cold starts, shared across instances)
 *
 * The synchronous get/set API is preserved. When Redis is configured,
 * set() writes through to L2 in the background, and a miss in L1 kicks off
 * an L2 read that primes L1 for the *next* request in the same process.
 * Callers that need the L2 value on the FIRST call should use getAsync().
 *
 * Wire up Upstash KV on Vercel:
 *   Vercel → Storage → Create → Upstash KV → connect to project.
 *   That auto-injects UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 *   to Production, Preview, and Development.
 *
 * Without those env vars set, the cache silently falls back to L1-only
 * (current behaviour — nothing breaks).
 */

import { config } from './config';
import { logger } from './logger';
import { Redis } from '@upstash/redis';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ── L2 (Upstash Redis REST) — only instantiated when env vars are present
let _redis: Redis | null | undefined = undefined;
function redis(): Redis | null {
  if (_redis !== undefined) return _redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const tok = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !tok) {
    logger.debug('cache:l2_disabled', { reason: 'no_env_vars' });
    _redis = null;
    return null;
  }
  try {
    _redis = new Redis({ url, token: tok });
    logger.debug('cache:l2_enabled');
    return _redis;
  } catch (e) {
    logger.warn('cache:l2_init_failed', { error: (e as Error).message });
    _redis = null;
    return null;
  }
}

class TwoTierCache {
  private l1 = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.l1.get(key);
    if (entry && Date.now() <= entry.expiresAt) {
      logger.debug('cache:l1_hit', { key });
      return entry.value as T;
    }
    if (entry) this.l1.delete(key); // expired

    // Fire-and-forget L2 prime so the NEXT request hits L1
    const r = redis();
    if (r) {
      r.get<{ value: T; expiresAt: number }>(key)
        .then(v => {
          if (!v) return;
          if (typeof v === 'object' && 'value' in v && 'expiresAt' in v) {
            if (Date.now() <= v.expiresAt) {
              this.l1.set(key, v as CacheEntry<unknown>);
              logger.debug('cache:l2_prime', { key });
            }
          }
        })
        .catch(err => logger.debug('cache:l2_get_failed', { key, err: err.message }));
    }
    return null;
  }

  /** Async variant — awaits the L2 read on a miss. Use when first-request consistency matters. */
  async getAsync<T>(key: string): Promise<T | null> {
    const hit = this.get<T>(key);
    if (hit !== null) return hit;
    const r = redis();
    if (!r) return null;
    try {
      const v = await r.get<{ value: T; expiresAt: number }>(key);
      if (!v || typeof v !== 'object' || !('value' in v) || !('expiresAt' in v)) return null;
      if (Date.now() > v.expiresAt) return null;
      this.l1.set(key, v as CacheEntry<unknown>);
      logger.debug('cache:l2_hit', { key });
      return v.value;
    } catch (err) {
      logger.debug('cache:l2_get_failed', { key, err: (err as Error).message });
      return null;
    }
  }

  /** Like get(), but returns the cached value EVEN if TTL has expired. L1-only by design — used for stale-while-revalidate. */
  getStale<T>(key: string): T | null {
    const entry = this.l1.get(key);
    if (!entry) return null;
    logger.debug('cache:stale-hit', { key, expired: Date.now() > entry.expiresAt });
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number = config.CACHE_TTL_SECONDS): void {
    const entry = { value, expiresAt: Date.now() + ttlSeconds * 1000 };
    this.l1.set(key, entry);
    logger.debug('cache:l1_set', { key, ttlSeconds });
    // Write-through to L2 (fire-and-forget)
    const r = redis();
    if (r) {
      r.set(key, entry, { ex: ttlSeconds })
        .catch(err => logger.debug('cache:l2_set_failed', { key, err: err.message }));
    }
  }

  del(key: string): void {
    this.l1.delete(key);
    logger.debug('cache:del', { key });
    const r = redis();
    if (r) r.del(key).catch(err => logger.debug('cache:l2_del_failed', { key, err: err.message }));
  }

  /** Invalidate all L1 keys that start with a given prefix. L2 isn't scanned — too expensive on REST API. */
  delPrefix(prefix: string): void {
    for (const key of this.l1.keys()) {
      if (key.startsWith(prefix)) this.l1.delete(key);
    }
    logger.debug('cache:delPrefix', { prefix });
  }

  size(): number {
    return this.l1.size;
  }
}

// Singleton — shared across all API handlers in the same Node process
export const cache = new TwoTierCache();
