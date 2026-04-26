/**
 * /api/health — production health check.
 *
 * Returns 200 only when:
 *   - the Next.js server is responding
 *   - DATABASE_URL is set
 *   - a SELECT 1 round-trip to Postgres succeeds within 3s
 *
 * Returns 503 (with diagnostic JSON) on any failure.
 *
 * This is the endpoint Railway polls (railway.toml: healthcheckPath).
 * If it never returns 200, Railway marks the deployment FAILED instead
 * of the misleading "Completed" status — and restartPolicy retries.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, string> = {
    server: 'ok',
    dbUrl: process.env.DATABASE_URL ? 'set' : 'missing',
  };

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { status: 'unhealthy', checks, reason: 'DATABASE_URL not set' },
      { status: 503 },
    );
  }

  try {
    // Race the query against a 3s timeout so a hung pool can't hang Railway's healthcheck.
    const ping = db.query('SELECT 1 AS ok');
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('db ping timed out after 3s')), 3000),
    );
    await Promise.race([ping, timeout]);
    checks.db = 'ok';
  } catch (err) {
    checks.db = `error: ${(err as Error).message}`;
    return NextResponse.json(
      { status: 'unhealthy', checks },
      { status: 503 },
    );
  }

  return NextResponse.json({ status: 'healthy', checks });
}
