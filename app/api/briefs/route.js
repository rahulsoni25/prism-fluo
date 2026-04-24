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

export async function GET() {
  const t0 = Date.now();
  try {
    const { rows } = await logger.query('briefs:list', () =>
      db.query('SELECT id, brand, category, objective, status, age_ranges, gender, market, analysis_id, created_at FROM briefs ORDER BY created_at DESC')
    );
    logger.info('api:GET /api/briefs', { ms: Date.now() - t0, count: rows.length });
    return NextResponse.json(rows);
  } catch (err) {
    logger.error('api:GET /api/briefs failed', { error: err.message });
    return NextResponse.json({ error: 'FETCH_FAILED', message: 'Failed to fetch briefs' }, { status: 500 });
  }
}

export async function POST(request) {
  const t0 = Date.now();
  try {
    const body = await request.json();
    const {
      brand, category, objective,
      age_ranges, gender, sec,
      market, geography,
      competitors, background,
      insight_buckets, status = 'processing',
    } = body;

    if (!brand?.trim()) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'brand is required' },
        { status: 400 }
      );
    }

    const { rows } = await logger.query('briefs:create', () =>
      db.query(
        `INSERT INTO briefs
           (brand, category, objective, age_ranges, gender, sec, market, geography,
            competitors, background, insight_buckets, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [brand, category, objective, age_ranges, gender, sec, market, geography,
         competitors, background, insight_buckets, status]
      )
    );

    // Bust the dashboard overview cache so the new brief appears immediately
    cache.del('dashboard:overview');

    logger.info('api:POST /api/briefs', { ms: Date.now() - t0, id: rows[0].id, brand });
    return NextResponse.json(rows[0], { status: 201 });

  } catch (err) {
    logger.error('api:POST /api/briefs failed', { error: err.message });
    return NextResponse.json({ error: 'CREATE_FAILED', message: 'Failed to create brief' }, { status: 500 });
  }
}
