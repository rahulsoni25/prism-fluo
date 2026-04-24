/**
 * lib/cache.ts
 * In-memory TTL cache for heavy dashboard queries.
 * Drop-in replaceable with Redis later — same get/set/del API.
 *
 * Usage:
 *   const hit = cache.get<MyType>('dashboard:overview');
 *   if (hit) return hit;
 *   const data = await expensiveQuery();
 *   cache.set('dashboard:overview', data, 90); // 90 second TTL
 */

import { config } from './config';
import { logger } from './logger';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    logger.debug('cache:hit', { key });
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number = config.CACHE_TTL_SECONDS): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    logger.debug('cache:set', { key, ttlSeconds });
  }

  del(key: string): void {
    this.store.delete(key);
    logger.debug('cache:del', { key });
  }

  /** Invalidate all keys that start with a given prefix */
  delPrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
    logger.debug('cache:delPrefix', { prefix });
  }

  size(): number {
    return this.store.size;
  }
}

// Singleton — shared across all API handlers in the same Node process
export const cache = new MemoryCache();
