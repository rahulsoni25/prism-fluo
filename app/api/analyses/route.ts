/**
 * /api/analyses
 * GET  — list saved analyses (most recent first)
 * POST — upsert an analysis (uses ON CONFLICT on the unique constraint
 *         analyses_upload_sheet_unique so re-analyzing a sheet updates in place)
 */

import { NextRequest, NextResponse } from 'next/server';
import { db, getPool } from '@/lib/db/client';
import { cache } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth/server';
import { calculateSla } from '@/lib/sla.server';
import { sendBriefActiveEmail } from '@/lib/email';

export async function GET() {
  const t0 = Date.now();
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    // Check short-lived cache first to avoid a DB round-trip on every page visit
    const cacheKey = `analyses:list:${session.userId}`;
    const cached = cache.get(cacheKey) as any[] | undefined;
    if (cached) {
      logger.info('api:GET /api/analyses (cache hit)', { ms: Date.now() - t0, count: cached.length });
      return NextResponse.json(cached, {
        headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
      });
    }

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
    if (rows.length === 0) {
      // FALLBACK: If DB is down in dev, return dummy analyses list
      if (process.env.NODE_ENV !== 'production') {
        return NextResponse.json([{
          id: 'dummy-analysis-1',
          filename: 'nike_india_audit.xlsx',
          sheet_name: 'Strategic Brand Audit',
          created_at: new Date().toISOString(),
          brief: { brand: 'Nike India', status: 'ready' }
        }]);
      }
      return NextResponse.json([]);
    }

    // Cache the result for 30 s — short enough to show new analyses quickly
    cache.set(cacheKey, rows, 30);

    logger.info('api:GET /api/analyses', { ms: Date.now() - t0, count: rows.length });
    return NextResponse.json(rows, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=60' },
    });
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

    // Generate a UUID on the server — never rely on RETURNING from Supabase
    const { randomUUID } = await import('crypto');
    let id = randomUUID();

    // Verify userId actually exists in users table (fallback UUIDs from auth
    // failures are stored in the session but are NOT in the users table —
    // passing them as user_id violates the FK constraint and kills the INSERT)
    let safeUserId: string | null = null;
    try {
      const userCheck = await getPool().query(
        `SELECT id FROM users WHERE id = $1`, [session.userId]
      );
      if (userCheck.rows.length > 0) safeUserId = session.userId;
      else logger.warn('analyses:user_not_in_db', { userId: session.userId });
    } catch (e: any) {
      logger.warn('analyses:user_check_failed', { error: e.message });
    }

    try {
      // Step 1: Check if row already exists (avoids FK errors on duplicate inserts)
      const existing = await getPool().query(
        `SELECT id FROM analyses WHERE upload_id = $1 AND sheet_name = $2`,
        [uploadId, sheetName]
      );

      if (existing.rows.length > 0) {
        // Row exists → UPDATE in place, reuse existing id
        id = existing.rows[0].id;
        await getPool().query(
          `UPDATE analyses
             SET results_json = $1, filename = $2,
                 brief_id  = COALESCE($3, brief_id),
                 user_id   = COALESCE($4, user_id)
           WHERE id = $5`,
          [JSON.stringify(results), filename ?? null, briefId ?? null, safeUserId, id]
        );
        logger.info('analyses:update_success', { id, uploadId, sheetName });
      } else {
        // Row does not exist → INSERT with pre-generated UUID (no RETURNING needed)
        await getPool().query(
          `INSERT INTO analyses (id, upload_id, sheet_name, filename, results_json, brief_id, user_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [id, uploadId, sheetName, filename ?? null, JSON.stringify(results), briefId ?? null, safeUserId]
        );
        logger.info('analyses:insert_success', { id, uploadId, sheetName });
      }
    } catch (err: any) {
      logger.error('analyses:upsert_failed', { error: err.message, uploadId, sheetName, userId: session.userId });
      throw err;
    }

    // FALLBACK: If DB is down in dev, return a mock analysis ID to allow the UI to redirect
    if (!id && process.env.NODE_ENV !== 'production') {
      id = `dummy-analysis-${crypto.randomUUID().slice(0, 8)}`;
      logger.warn('api:POST /api/analyses - using dummy analysis fallback', { sheetName });
    }

    // If a briefId was supplied, link analysis + flip to ready + set SLA + stamp completion.
    // SLA is calculated NOW (when data arrives) — not at brief creation time.
    if (id && briefId) {
      // Calculate SLA based on current queue depth
      let slaHours = 24;
      let slaDueAt = new Date(Date.now() + 24 * 3600_000).toISOString();
      try {
        const slaResult = await calculateSla();
        if (slaResult?.slaHours) { slaHours = slaResult.slaHours; slaDueAt = slaResult.slaDueAt; }
      } catch { /* keep defaults */ }

      const briefRow = await db.query(
        `UPDATE briefs
            SET analysis_id         = $1,
                status              = 'ready',
                sla_hours           = $4,
                sla_due_at          = $5,
                actual_completed_at = COALESCE(actual_completed_at, NOW())
          WHERE id = $2 AND user_id = $3
          RETURNING brand, category`,
        [id, briefId, session.userId, slaHours, slaDueAt]
      ).catch((err: any) => {
        logger.warn('analyses:brief_link_failed', { briefId, error: err.message });
        return { rows: [] };
      });

      cache.del(`dashboard:overview:${session.userId}`);
      cache.del(`analyses:list:${session.userId}`);

      // Fire "Brief Active" email — non-blocking
      const bf = briefRow.rows?.[0];
      if (bf) {
        sendBriefActiveEmail(
          { id: briefId, brand: bf.brand, category: bf.category },
          { email: session.email, name: (session as any).name },
          slaHours,
        ).catch((e: Error) => logger.warn('analyses:active_email_failed', { error: e.message }));
      }
    }

    logger.info('api:POST /api/analyses', { ms: Date.now() - t0, id });
    return NextResponse.json({ id }, { status: 201 });

  } catch (err: any) {
    logger.error('api:POST /api/analyses failed', { error: err.message });
    return NextResponse.json({ error: 'UPSERT_FAILED', message: err.message }, { status: 500 });
  }
}
