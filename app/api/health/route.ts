/**
 * GET /api/health
 *
 * Health check endpoint for monitoring and uptime tracking
 * Returns system status, database connection, and timestamp
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const checks = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    status: 'healthy' as const,
    database: { status: 'unknown' as const, latency: 0 },
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  };

  // Check database connection
  try {
    const dbStart = Date.now();
    const { rows } = await db.query('SELECT NOW() as timestamp');
    checks.database.latency = Date.now() - dbStart;
    checks.database.status = 'connected';
  } catch (error) {
    checks.database.status = 'disconnected';
    checks.status = 'degraded';
  }

  const totalLatency = Date.now() - startTime;

  // Return 200 for healthy, 503 for degraded
  const statusCode = checks.status === 'healthy' ? 200 : 503;

  return NextResponse.json(
    {
      ...checks,
      latency: totalLatency,
    },
    { status: statusCode }
  );
}
