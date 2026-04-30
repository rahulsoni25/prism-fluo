/**
 * GET /api/dashboard/overview
 *
 * Single endpoint that powers the entire dashboard page in ONE round trip.
 * Previously the dashboard called /api/briefs + potentially multiple stat
 * queries separately.  Now it's all aggregated IN the DB (not in JS) and
 * cached for 90 seconds.
 *
 * Response shape:
 * {
 *   stats:  { total, ready, processing, draft },
 *   briefs: Brief[],
 *   recentAnalyses: AnalysisMeta[],
 * }
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { cache } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth/server';

const CACHE_TTL = 90; // seconds

export async function GET() {
  const t0 = Date.now();

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const userId   = session.userId;
  const cacheKey = `dashboard:overview:${userId}`;

  // ── Per-user cache hit ────────────────────────────────────
  const cached = cache.get<object>(cacheKey);
  if (cached) {
    logger.debug('dashboard:overview:cache_hit', { ms: Date.now() - t0, userId });
    return NextResponse.json(cached);
  }

  try {
    // ── 1. Brief counts — scoped to this user ─────────────────
    const statsPromise = logger.query('dashboard:stats', () =>
      db.query(`
        SELECT
          COUNT(*)                                                 AS total,
          COUNT(*) FILTER (WHERE status = 'ready')                AS ready,
          COUNT(*) FILTER (WHERE status = 'processing')           AS processing,
          COUNT(*) FILTER (WHERE status = 'waiting_for_data')     AS waiting,
          COUNT(*) FILTER (WHERE status = 'draft')                AS draft
        FROM briefs
        WHERE user_id = $1
      `, [userId])
    );

    // ── 2. Most recent 50 briefs — scoped to this user ────────
    const briefsPromise = logger.query('dashboard:briefs', () =>
      db.query(`
        SELECT
          id, brand, category, objective, status,
          age_ranges, gender, market,
          analysis_id, created_at,
          sla_hours, sla_due_at, actual_completed_at
        FROM briefs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `, [userId])
    );

    // ── 3. Recent analyses — scoped to this user ──────────────
    const analysesPromise = logger.query('dashboard:analyses', () =>
      db.query(`
        SELECT
          a.id,
          a.sheet_name,
          a.filename,
          a.created_at,
          a.results_json->'meta'->>'domain' AS domain,
          a.results_json->'meta'->>'title'  AS title
        FROM analyses a
        WHERE a.user_id = $1
        ORDER BY a.created_at DESC
        LIMIT 10
      `, [userId])
    );

    // Run all three queries in parallel
    const [statsRes, briefsRes, analysesRes] = await Promise.all([
      statsPromise, briefsPromise, analysesPromise,
    ]);

    const raw = statsRes.rows[0];
    const stats = {
      total:      parseInt(raw.total,      10),
      ready:      parseInt(raw.ready,      10),
      processing: parseInt(raw.processing, 10),
      waiting:    parseInt(raw.waiting,    10),
      draft:      parseInt(raw.draft,      10),
    };

    const payload = {
      stats,
      briefs:          briefsRes.rows,
      recentAnalyses:  analysesRes.rows,
    };

    // ── Per-user cache & return ───────────────────────────────
    cache.set(cacheKey, payload, CACHE_TTL);

    logger.info('dashboard:overview', { ms: Date.now() - t0, briefs: briefsRes.rows.length, userId });
    return NextResponse.json(payload);

  } catch (err: any) {
    logger.error('dashboard:overview:error', { error: err.message, ms: Date.now() - t0 });

    // FALLBACK: Return dummy data if the database is unreachable
    // This allows the UI to be debugged even without a working Postgres connection.
    const dummyPayload = {
      stats: {
        total:      3,
        ready:      1,
        processing: 1,
        waiting:    0,
        draft:      1,
      },
      briefs: [
        {
          id: 'dummy-1',
          brand: 'Coca-Cola',
          category: 'FMCG — Food & Beverages',
          objective: 'Summer Campaign Analysis',
          status: 'ready',
          analysis_id: 'dummy-analysis-1',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          sla_hours: 4,
          sla_due_at: new Date(Date.now() + 7200000).toISOString(),
        },
        {
          id: 'dummy-2',
          brand: 'Nike India',
          category: 'Sportswear & Footwear',
          objective: 'Strategic Brand Audit',
          status: 'processing',
          created_at: new Date(Date.now() - 7200000).toISOString(),
          sla_hours: 6,
          sla_due_at: new Date(Date.now() + 14400000).toISOString(),
        },
        {
          id: 'dummy-3',
          brand: 'Samsung',
          category: 'Telecom',
          objective: 'Product Launch Insights',
          status: 'draft',
          created_at: new Date(Date.now() - 86400000).toISOString(),
        }
      ],
      recentAnalyses: [
        {
          id: 'dummy-analysis-1',
          sheet_name: 'Summer Campaign',
          filename: 'coke_summer.xlsx',
          created_at: new Date(Date.now() - 3600000).toISOString(),
          domain: 'Commerce',
          title: 'Growth Opportunities in Tier 2 Cities',
        }
      ],
      is_dummy: true,
    };

    return NextResponse.json(dummyPayload);
  }
}
