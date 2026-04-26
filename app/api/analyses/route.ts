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

export async function GET() {
  const t0 = Date.now();
  try {
    const { rows } = await logger.query('analyses:list', () =>
      db.query(`
        SELECT id, upload_id, sheet_name, filename,
               results_json->'meta' AS meta,
               created_at
        FROM analyses
        ORDER BY created_at DESC
        LIMIT 100
      `)
    );
    logger.info('api:GET /api/analyses', { ms: Date.now() - t0, count: rows.length });
    return NextResponse.json(rows);
  } catch (err: any) {
    logger.error('api:GET /api/analyses failed', { error: err.message });
    return NextResponse.json({ error: 'FETCH_FAILED', message: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  try {
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
        `INSERT INTO analyses (upload_id, sheet_name, filename, results_json, brief_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ON CONSTRAINT analyses_upload_sheet_unique
         DO UPDATE SET results_json = EXCLUDED.results_json,
                       filename     = EXCLUDED.filename,
                       brief_id     = COALESCE(EXCLUDED.brief_id, analyses.brief_id)
         RETURNING id`,
        [uploadId, sheetName, filename ?? null, JSON.stringify(results), briefId ?? null]
      )
    );

    const id = rows[0]?.id ?? null;

    // If a briefId was supplied, link analysis + flip to ready + stamp completion
    if (id && briefId) {
      await db.query(
        `UPDATE briefs
            SET analysis_id         = $1,
                status              = 'ready',
                actual_completed_at = COALESCE(actual_completed_at, NOW())
          WHERE id = $2`,
        [id, briefId]
      ).catch((err: any) => {
        logger.warn('analyses:brief_link_failed', { briefId, error: err.message });
      });
      cache.del('dashboard:overview'); // bust cache when a brief becomes ready
    }

    logger.info('api:POST /api/analyses', { ms: Date.now() - t0, id });
    return NextResponse.json({ id }, { status: 201 });

  } catch (err: any) {
    logger.error('api:POST /api/analyses failed', { error: err.message });
    return NextResponse.json({ error: 'UPSERT_FAILED', message: err.message }, { status: 500 });
  }
}
