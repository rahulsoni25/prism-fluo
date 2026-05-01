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
import { calculateSla } from '@/lib/sla.server';
import { getSession } from '@/lib/auth/server';

const VALID_STATUSES = ['draft', 'waiting_for_data', 'processing', 'ready'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Owner scope — always filter by the current user.
    // If session.userId is not a valid UUID (e.g. demo fallback), cast-safe
    // comparison uses IS NULL so the query doesn't error on the UUID column.
    const validUid = UUID_REGEX.test(session.userId) ? session.userId : null;
    const where = [validUid ? 'user_id = $1' : '(user_id IS NULL OR user_id = $1)'];
    const args  = [validUid];

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
    
    // FALLBACK: If DB is down or empty in dev, return a mock brief
    if (rows.length === 0 && process.env.NODE_ENV !== 'production') {
      return NextResponse.json([{
        id: 'dummy-brief-1',
        brand: 'Nike India',
        category: 'Sportswear & Footwear',
        objective: 'Strategic Brand Audit',
        status: 'ready',
        analysis_id: 'dummy-analysis-1',
        created_at: new Date(Date.now() - 7200000).toISOString(),
        sla_hours: 6,
        sla_due_at: new Date(Date.now() + 14400000).toISOString(),
      }]);
    }

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
    let slaHours = 24, slaDueAt = new Date(Date.now() + 24 * 3600000).toISOString();
    try {
      const slaResult = await calculateSla();
      if (slaResult?.slaHours) {
        slaHours = slaResult.slaHours;
        slaDueAt = slaResult.slaDueAt;
      }
    } catch (slaErr) {
      console.warn('⚠️ SLA calculation failed, using defaults', { error: slaErr.message });
      // Keep defaults
    }

    // Validate userId is a proper UUID before inserting (demo fallback users get dummy IDs)
    const validUserId = UUID_REGEX.test(session.userId) ? session.userId : null;

    const { rows } = await logger.query('briefs:create', () =>
      db.query(
        `INSERT INTO briefs
           (brand, category, objective, age_ranges, gender, sec, market, geography,
            competitors, background, insight_buckets, status, sla_hours, sla_due_at, user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [brand, category, objective, age_ranges, gender, sec, market, geography,
         competitors, background, insight_buckets, status, slaHours, slaDueAt, validUserId]
      )
    );

    let brief = rows[0];

    // FALLBACK: If DB is down in dev, create a dummy brief to allow UI flow to continue
    if (!brief && process.env.NODE_ENV !== 'production') {
      brief = {
        id: `dummy-brief-${crypto.randomUUID().slice(0,8)}`,
        brand, category, objective, status,
        sla_hours: slaHours,
        sla_due_at: slaDueAt,
        created_at: new Date().toISOString(),
      };
      logger.warn('api:POST /api/briefs - using dummy brief fallback', { brand });
    }

    if (!brief) throw new Error('Failed to create brief (DB returned no data)');

    // Bust the per-user dashboard cache so the new brief appears immediately
    cache.del(`dashboard:overview:${session.userId}`);

    logger.info('api:POST /api/briefs', { ms: Date.now() - t0, id: brief.id, brand, slaHours, userId: session.userId });
    return NextResponse.json(brief, { status: 201 });

  } catch (err) {
    // Log the FULL error so we can debug
    console.error('❌ POST /api/briefs - FULL ERROR:', {
      message: err.message,
      code: err.code,
      detail: err.detail,
      constraint: err.constraint,
      stack: err.stack
    });
    logger.error('api:POST /api/briefs failed', { error: err.message, code: err.code, detail: err.detail });

    // Return more details in dev/debug
    return NextResponse.json({
      error: 'CREATE_FAILED',
      message: 'Failed to create brief',
      debug: {
        errorMessage: err.message,
        errorCode: err.code,
        errorDetail: err.detail
      }
    }, { status: 500 });
  }
}