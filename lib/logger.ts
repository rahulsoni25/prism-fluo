/**
 * lib/logger.ts
 * Lightweight structured logger — safe for Railway logs.
 * Each log line is one JSON object so Railway can filter/search it.
 */

import { config } from './config';

type Level = 'info' | 'warn' | 'error' | 'debug';

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (level === 'debug' && config.isProd) return; // suppress debug in prod
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info:  (msg: string, meta?: Record<string, unknown>) => emit('info',  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => emit('warn',  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),

  /**
   * Time a DB query and log the result.
   * Usage:  const rows = await logger.query('label', () => db.query(...))
   */
  async query<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      const result = await fn();
      const rows = Array.isArray((result as any)?.rows) ? (result as any).rows.length : '?';
      emit('debug', `db:query ${label}`, { ms: Date.now() - t0, rows });
      return result;
    } catch (err: any) {
      emit('error', `db:query ${label} FAILED`, { ms: Date.now() - t0, error: err.message });
      throw err;
    }
  },

  /**
   * Wrap an API handler to log method, path, status, and duration.
   * Usage (in route.ts):
   *   export const GET = withTiming('GET /api/briefs', async (req) => { ... })
   */
  withTiming(label: string, handler: (...args: any[]) => Promise<Response>) {
    return async (...args: any[]): Promise<Response> => {
      const t0 = Date.now();
      const reqId = Math.random().toString(36).slice(2, 8);
      try {
        const res = await handler(...args);
        emit('info', `api ${label}`, { reqId, ms: Date.now() - t0, status: res.status });
        return res;
      } catch (err: any) {
        emit('error', `api ${label} FAILED`, { reqId, ms: Date.now() - t0, error: err.message });
        throw err;
      }
    };
  },
};
