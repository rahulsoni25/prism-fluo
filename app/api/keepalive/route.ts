/**
 * GET /api/keepalive
 *
 * Runs a trivial SELECT 1 against the DB so Supabase's auto-pause timer
 * gets reset. Called by Vercel Cron every 5 minutes (see vercel.json).
 *
 * Also usable as an uptime probe from external services (UptimeRobot,
 * Better Uptime, etc.) — returns 200 with DB ok, 503 with clear reason
 * on failure.
 *
 * No auth: this is a public health endpoint, but it only executes a
 * hard-coded query and returns no data. Safe to expose.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

// Cache-buster: never cached by Vercel/browsers, always hits origin.
export const revalidate = 0;

export async function GET() {
  const t0 = Date.now();

  try {
    const { rows } = await db.query('SELECT 1 AS ok');
    const ms = Date.now() - t0;

    if (!rows?.[0]?.ok) {
      return NextResponse.json(
        { ok: false, reason: 'unexpected_result', ms },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok:      true,
      db:      'reachable',
      ms,
      ts:      new Date().toISOString(),
      note:    'Keep-alive ping — resets Supabase auto-pause timer',
    });
  } catch (err: any) {
    const ms = Date.now() - t0;
    console.error('[keepalive] DB unreachable:', err?.message);
    return NextResponse.json(
      {
        ok:     false,
        db:     'unreachable',
        ms,
        error:  err?.message ?? String(err),
        hint:   'Supabase project is likely paused. Open the Supabase dashboard to wake it.',
      },
      { status: 503 },
    );
  }
}
