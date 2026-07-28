/**
 * lib/db/client.ts
 * Postgres connection pool — Railway-ready with SSL + sensible limits.
 *
 * Railway Postgres requires SSL in production.
 * Pool is capped at 10 to stay well under Railway's 25-connection limit.
 *
 * The pool is created lazily (on first use) so that importing this module
 * during `next build` does NOT attempt to connect to Postgres (DATABASE_URL
 * may not be set in the build environment on Railway NIXPACKS builds).
 */

import { Pool, PoolClient } from 'pg';
import { config } from '@/lib/config';

let _pool: Pool | null = null;

/** Returns the shared pool (creates it lazily).  Exported so callers that
 *  want real error propagation (instead of the silent fallback in db.query)
 *  can call pool.query() directly.
 */
export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: config.DATABASE_URL, // lazy getter — safe to call here
      max: 10,                   // max simultaneous connections
      idleTimeoutMillis: 30_000, // release idle connections after 30s
      connectionTimeoutMillis: 5_000, // fail fast if pool is exhausted
      ssl: (config.isProd || config.DATABASE_URL.includes('supabase') || config.DATABASE_URL.includes('railway.app'))
        ? { rejectUnauthorized: false }
        : false,
    });

    // Log pool errors so they appear in Railway logs (not swallowed silently)
    _pool.on('error', (err) => {
      console.error(JSON.stringify({ level: 'error', msg: 'pg:pool_error', error: err.message }));
    });
  }
  return _pool;
}

export const db = {
  /** Run a single parameterised query */
  query: async (text: string, params?: unknown[]) => {
    // Retry loop: transient DB blips (Supabase Free wake-from-pause takes
    // ~30–90s, connection refused for the first few attempts). Retry up to
    // 3 times with escalating backoff before giving up and returning the
    // empty-result fallback. Most Supabase auto-pause recoveries succeed
    // on retry #2 or #3, so the caller never notices.
    const MAX_ATTEMPTS = 3;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await getPool().query(text, params);
      } catch (err: any) {
        lastErr = err;
        // Only retry on connection/pool errors, not on real query errors
        // (syntax error, permission denied, etc. — those won't get better).
        const msg = String(err?.message ?? '').toLowerCase();
        const isTransient =
          msg.includes('econnrefused') ||
          msg.includes('etimedout') ||
          msg.includes('connection terminated') ||
          msg.includes('server closed the connection') ||
          msg.includes('tenant or user not found') ||
          msg.includes('too many clients');
        if (!isTransient || attempt === MAX_ATTEMPTS) break;
        // Backoff: 500ms, 1500ms
        await new Promise(r => setTimeout(r, 500 * attempt * (1 + attempt)));
        // Force pool re-init on last attempt so a stale pool gets replaced
        if (attempt === MAX_ATTEMPTS - 1) _pool = null;
      }
    }

    console.error('❌ Database query failed after retries:', lastErr?.message);
    if (config.isProd) {
      console.warn('⚠️ PROD_DB_FALLBACK: Database is unreachable. Serving empty/mock data to maintain service availability. Front-end DbStatusBanner will alert the user.');
    }
    // Fallback: return empty result instead of crashing
    return { rows: [], rowCount: 0, fields: [], command: 'SELECT', oid: 0 };
  },

  /** Run multiple queries inside a single transaction */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    try {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err: any) {
      console.error('❌ Database transaction failed:', err.message);
      if (config.isProd) {
        console.warn('⚠️ PROD_DB_FALLBACK: Database is unreachable. Serving mock/cached data to maintain service availability.');
      }
      
      // Fallback: return null or mock result
      return null as any;
    }
  },
};
