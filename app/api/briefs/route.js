/**
 * /api/briefs
 * GET  — list all briefs
 * POST — create a new brief
 *
 * After creating a brief, invalidates the dashboard overview cache so the
 * next dashboard load reflects the new entry immediately.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { cache } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { calculateSla } from '@/lib/sla';
import { getSession } from '@/lib/auth/server';

const VALID_STATUSES = ['draft', 'waiting_for_data', 'processing', 'ready'];

/**
 * GET /api/briefs
 * Optional filters via query string:
 *   ?status=ready,processing      — comma-separated list
 *   ?brand=Nike                   — case-insensitive partial match
 *   ?from=2026-04-01              — created_at >= ISO date
 *   ?to=2026-04-30                — created_at <= ISO date
 */
export async function GET(request) {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const url   = new URL(request.url);
    // Owner scope — every list always filters by the current user.
    const where = ['user_id = $1'];
    const args  = [session.userId];

    const status = url.searchParams.get('status');
    if (status) {
      const list = status.split(',').map(s => s.trim()).filter(s => VALID_STATUSES.includes(s));
      if (list.length > 0) {
        args.push(list);
        where.push(`status = ANY($${args.length}::text[])`);
      }
    }

    const brand = url.searchParams.get('brand');
    if (brand?.trim()) {
      args.push(`%${brand.trim()}%`);
      where.push(`brand ILIKE $${args.length}`);
    }

    const from = url.searchParams.get('from');
    if (from) { args.push(from); where.push(`created_at >= $${args.length}`); }

    const to = url.searchParams.get('to');
    if (to)   { args.push(to);   where.push(`created_at <= $${args.length}`); }

    const sql = `
      SELECT id, brand, category, objective, status, age_ranges, gender, market,
             analysis_id, created_at,
             sla_hours, sla_due_at, actual_completed_at
        FROM briefs
        WHERE ${where.join(' AND ')}
        ORDER BY created_at DESC
        LIMIT 200`;

    const { rows } = await logger.query('briefs:list', () => db.query(sql, args));
    logger.info('api:GET /api/briefs', { ms: Date.now() - t0, count: rows.length, filters: where.length });
    return NextResponse.json(rows);
  } catch (err) {
    logger.error('api:GET /api/briefs failed', { error: err.message });
    return NextResponse.json({ error: 'FETCH_FAILED', message: 'Failed to fetch briefs' }, { status: 500 });
  }
}

export async function POST(request) {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const body = await request.json();
    const {
      brand, category, objective,
      age_ranges, gender, sec,
      market, geography,
      competitors, background,
      insight_buckets,
      status = 'waiting_for_data',  // default new brief: waiting for data upload
    } = body;

    if (!brand?.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'brand is required' },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: `status must be one of ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Deterministic SLA — under-promise, over-deliver
    const { slaHours, slaDueAt } = await calculateSla();

    const { rows } = await logger.query('briefs:create', () =>
      db.query(
        `INSERT INTO briefs
           (brand, category, objective, age_ranges, gender, sec, market, geography,
            competitors, background, insight_buckets, status, sla_hours, sla_due_at, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [brand, category, objective, age_ranges, gender, sec, market, geography,
         competitors, background, insight_buckets, status, slaHours, slaDueAt, session.userId]
      )
    );

    // Bust the per-user dashboard cache so the new brief appears immediately
    cache.del(`dashboard:overview:${session.userId}`);

    logger.info('api:POST /api/briefs', { ms: Date.now() - t0, id: rows[0].id, brand, slaHours, userId: session.userId });
    return NextResponse.json(rows[0], { status: 201 });

  } catch (err) {
    logger.error('api:POST /api/briefs failed', { error: err.message });
    return NextResponse.json({ error: 'CREATE_FAILED', message: 'Failed to create brief' }, { status: 500 });
  }
}
