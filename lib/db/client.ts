/**
 * lib/db/client.ts
 * Postgres connection pool — Railway-ready with SSL + sensible limits.
 *
 * Railway Postgres requires SSL in production.
 * Pool is capped at 10 to stay well under Railway's 25-connection limit.
 */

import { Pool } from 'pg';
import { config } from '@/lib/config';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,                   // max simultaneous connections
  idleTimeoutMillis: 30_000, // release idle connections after 30s
  connectionTimeoutMillis: 5_000, // fail fast if pool is exhausted
  ssl: config.isProd ? { rejectUnauthorized: false } : false,
});

// Log pool errors so they appear in Railway logs (not swallowed silently)
pool.on('error', (err) => {
  console.error(JSON.stringify({ level: 'error', msg: 'pg:pool_error', error: err.message }));
});

export const db = {
  /** Run a single parameterised query */
  query: (text: string, params?: unknown[]) => pool.query(text, params),

  /** Run multiple queries inside a single transaction */
  async transaction<T>(fn: (client: Awaited<ReturnType<typeof pool.connect>>) => Promise<T>): Promise<T> {
    const client = await pool.connect();
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
