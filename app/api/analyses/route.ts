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
import { getSession, upsertUser } from '@/lib/auth/server';
import { calculateSla } from '@/lib/sla.server';
import { sendBriefActiveEmail } from '@/lib/email';
import { verifyAnalysis } from '@/lib/ai/verify/orchestrator';

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
        WHERE (a.user_id = $1 OR a.user_id IS NULL)
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
    const { uploadId, sheetName, filename, results, briefId, slaHours } = body;

    if (!uploadId || !sheetName || !results) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'uploadId, sheetName and results are required' },
        { status: 400 }
      );
    }

    // Guard: refuse to persist an analysis with zero CHART cards (the
    // frontend stores cards under results.charts, not .insights — checked
    // the wrong field before). An empty-charts row renders just the
    // headline + snapshot on /insights, looks broken, and pollutes cache.
    const incomingCharts = Array.isArray((results as any)?.charts)
      ? (results as any).charts
      : null;
    if (incomingCharts !== null && incomingCharts.length === 0) {
      logger.warn('analyses:refused_empty_charts', { uploadId, sheetName });
      return NextResponse.json(
        {
          error: 'EMPTY_INSIGHTS',
          message: 'Analysis returned 0 insight cards — refusing to save. Re-run analysis or simplify the input.',
        },
        { status: 422 },
      );
    }

    // Generate a UUID on the server — never rely on RETURNING from Supabase
    const { randomUUID } = await import('crypto');
    let id = randomUUID();

    // Ensure the user exists in the DB. Auth fallback UUIDs (generated from
    // email hash when DB was unreachable at login) are NOT in the users table,
    // causing a FK violation on INSERT. Re-upsert here to self-heal.
    let safeUserId: string | null = session.userId;
    try {
      const userCheck = await getPool().query(
        `SELECT id FROM users WHERE id = $1`, [session.userId]
      );
      if (userCheck.rows.length === 0) {
        // User not in DB — try to re-create from session data
        logger.warn('analyses:user_not_in_db_reinserting', { userId: session.userId });
        try {
          const reinserted = await upsertUser({
            email:    session.email,
            name:     (session as any).name ?? null,
            image:    (session as any).image ?? null,
            provider: session.provider ?? 'demo',
          });
          safeUserId = reinserted.id;
          logger.info('analyses:user_reinserted', { newId: reinserted.id });
        } catch (e: any) {
          logger.warn('analyses:user_reinsert_failed', { error: e.message, uploadId });
          safeUserId = null; // Save without user ownership rather than fail entirely
          // NOTE: analysis will be saved but invisible to the user in /insights.
          // Recover with: UPDATE analyses SET user_id = '<id>' WHERE upload_id = '<uploadId>'
        }
      }
    } catch (e: any) {
      logger.warn('analyses:user_check_failed', { error: e.message });
      safeUserId = null;
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
    // SLA can either be user-selected (passed in body) or auto-calculated based on queue depth.
    if (id && briefId) {
      let finalSlaHours = slaHours ?? 24;
      let slaDueAt = new Date(Date.now() + finalSlaHours * 3600_000).toISOString();

      // Only auto-calculate SLA if user didn't provide one
      if (!slaHours) {
        try {
          const slaResult = await calculateSla();
          if (slaResult?.slaHours) {
            finalSlaHours = slaResult.slaHours;
            slaDueAt = slaResult.slaDueAt;
          }
        } catch { /* keep defaults */ }
      }

      const briefRow = await db.query(
        `UPDATE briefs
            SET analysis_id         = $1,
                status              = 'ready',
                sla_hours           = $4,
                sla_due_at          = $5,
                actual_completed_at = COALESCE(actual_completed_at, NOW())
          WHERE id = $2 AND (user_id = $3 OR user_id IS NULL)
          RETURNING brand, category`,
        [id, briefId, session.userId, finalSlaHours, slaDueAt]
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
          finalSlaHours,
        ).catch((e: Error) => logger.warn('analyses:active_email_failed', { error: e.message }));
      }
    }

    logger.info('api:POST /api/analyses', { ms: Date.now() - t0, id });

    // ── Fire 3-agent verification council in the background ───────────
    // Runs the proofreader + stat-checker + fact-analyzer over every card,
    // cross-confirms findings, and stores the report. Non-blocking so the
    // client still gets a fast 201. Rules-only by default (deterministic,
    // no LLM cost). Pass ?llm=1 on the verify route later to do a deep
    // grammar/consistency pass.
    if (id && Array.isArray(results?.charts) && results.charts.length > 0) {
      const cards = results.charts.map((c: any, i: number) => ({
        index: i,
        title: c.title || '(no title)',
        obs:   c.obs,
        stat:  c.stat,
        rec:   c.rec,
        bucket: c.bucket,
        computedChartData: c.computedChartData,
        toolLabel: c.toolLabel,
      }));
      // Look up brand on a best-effort basis (briefId may be null for legacy)
      let brand: string | null = null;
      if (briefId) {
        try {
          const b = await db.query('SELECT brand FROM briefs WHERE id = $1', [briefId]);
          brand = b.rows[0]?.brand ?? null;
        } catch { /* ignore */ }
      }
      verifyAnalysis(id, cards, brand, { llm: false })
        .then(async (report) => {
          // Ensure table + upsert
          await db.query(`
            CREATE TABLE IF NOT EXISTS analysis_verifications (
              analysis_id   UUID PRIMARY KEY,
              report        JSONB NOT NULL,
              generated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
              mode          TEXT NOT NULL DEFAULT 'rules-only'
            )
          `);
          await db.query(
            `INSERT INTO analysis_verifications (analysis_id, report, generated_at, mode)
             VALUES ($1, $2, NOW(), 'rules-only')
             ON CONFLICT (analysis_id)
             DO UPDATE SET report = EXCLUDED.report, generated_at = EXCLUDED.generated_at, mode = EXCLUDED.mode`,
            [id, JSON.stringify(report)],
          );
          logger.info('analyses:verify_complete', {
            id, ms: Date.now() - t0,
            cardsWithIssues: report.summary.cardsWithIssues,
            confirmed: report.summary.confirmedFindings,
          });
        })
        .catch((err: Error) => logger.warn('analyses:verify_failed', { id, error: err.message }));
    }

    return NextResponse.json({ id }, { status: 201 });

  } catch (err: any) {
    logger.error('api:POST /api/analyses failed', { error: err.message });
    return NextResponse.json({ error: 'UPSERT_FAILED', message: err.message }, { status: 500 });
  }
}
