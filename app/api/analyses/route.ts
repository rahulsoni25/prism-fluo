/**
 * /api/analyses
 * GET  — list saved analyses (most recent first)
 * POST — upsert an analysis (uses ON CONFLICT on the unique constraint
 *         analyses_upload_sheet_unique so re-analyzing a sheet updates in place)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { cache } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth/server';

export async function GET() {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const { rows } = await logger.query('analyses:list', () =>
      db.query(`
        SELECT a.id, a.upload_id, a.sheet_name, a.filename,
               a.results_json->'meta' AS meta,
               a.created_at, a.brief_id,
               json_build_object(
                 'id', b.id,
                 'brand', b.brand,
                 'status', b.status,
                 'sla_hours', b.sla_hours,
                 'sla_due_at', b.sla_due_at,
                 'actual_completed_at', b.actual_completed_at
               ) AS brief
        FROM analyses a
        LEFT JOIN briefs b ON a.brief_id = b.id
        WHERE a.user_id = $1
        ORDER BY a.created_at DESC
        LIMIT 100
      `, [session.userId])
    );
    logger.info('api:GET /api/analyses', { ms: Date.now() - t0, count: rows.length, userId: session.userId });
    return NextResponse.json(rows);
  } catch (err: any) {
    logger.error('api:GET /api/analyses failed', { error: err.message });
    return NextResponse.json({ error: 'FETCH_FAILED', message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const body = await req.json();
    const { uploadId, sheetName, filename, results, briefId } = body;

    if (!uploadId || !sheetName || !results) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'uploadId, sheetName and results are required' },
        { status: 400 }
      );
    }

    // Upsert — if this sheet was already analyzed, update the results in place.
    // If a briefId is supplied, write it onto the analysis row too so the
    // file-to-brief relationship is queryable from either side.
    const { rows } = await logger.query('analyses:upsert', () =>
      db.query(
        `INSERT INTO analyses (upload_id, sheet_name, filename, results_json, brief_id, user_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT ON CONSTRAINT analyses_upload_sheet_unique
         DO UPDATE SET results_json = EXCLUDED.results_json,
                       filename     = EXCLUDED.filename,
                       brief_id     = COALESCE(EXCLUDED.brief_id, analyses.brief_id),
                       user_id      = COALESCE(EXCLUDED.user_id,  analyses.user_id)
         RETURNING id`,
        [uploadId, sheetName, filename ?? null, JSON.stringify(results), briefId ?? null, session.userId]
      )
    );

    const id = rows[0]?.id ?? null;

    // If a briefId was supplied, link analysis + flip to ready + stamp completion.
    // Owner check is enforced via WHERE user_id — never modifies someone else's brief.
    if (id && briefId) {
      await db.query(
        `UPDATE briefs
            SET analysis_id         = $1,
                status              = 'ready',
                actual_completed_at = COALESCE(actual_completed_at, NOW())
          WHERE id = $2 AND user_id = $3`,
        [id, briefId, session.userId]
      ).catch((err: any) => {
        logger.warn('analyses:brief_link_failed', { briefId, error: err.message });
      });
      cache.del(`dashboard:overview:${session.userId}`);
    }

    logger.info('api:POST /api/analyses', { ms: Date.now() - t0, id });
    return NextResponse.json({ id }, { status: 201 });

  } catch (err: any) {
    logger.error('api:POST /api/analyses failed', { error: err.message });
    return NextResponse.json({ error: 'UPSERT_FAILED', message: err.message }, { status: 500 });
  }
}
