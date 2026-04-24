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

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: config.DATABASE_URL, // lazy getter — safe to call here
      max: 10,                   // max simultaneous connections
      idleTimeoutMillis: 30_000, // release idle connections after 30s
      connectionTimeoutMillis: 5_000, // fail fast if pool is exhausted
      ssl: config.isProd ? { rejectUnauthorized: false } : false,
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
  query: (text: string, params?: unknown[]) => getPool().query(text, params),

  /** Run multiple queries inside a single transaction */
  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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
  },
};
