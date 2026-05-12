/**
 * POST /api/analyses/[id]/regenerate
 *
 * Re-runs the GWI Insight Strategist pipeline against the original upload's
 * stored rows and overwrites `analyses.results_json`. Used for two cases:
 *   1. Investor-facing reanalysis of OLD analyses created before the blueprint
 *      prompt + chart rules + bucket fix were deployed.
 *   2. A user-triggered "Regenerate" button on the insights page.
 *
 * Auth: owner-only. Returns 404 if the analysis doesn't belong to the caller.
 *
 * Pipeline (mirrors the live `/api/ai/analyze-data` route):
 *   1. Load analysis row → get upload_id, sheet_name, brief_id, filename
 *   2. Load original rows from `gwi_time_spent` (preferred) or `tool_data`
 *   3. Call the analyze-data POST handler in-process — this picks up every
 *      blueprint change automatically (prompt, chart rules, bucket fix)
 *   4. UPDATE analyses SET results_json = $1 WHERE id = $2 AND user_id = $3
 *   5. Return the new results
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { POST as analyzeDataPOST } from '@/app/api/ai/analyze-data/route';
import { insightsToCharts } from '@/lib/charts/build-gemini-chart-data';

export const maxDuration = 300;  // Gemini batches + overview can take ~90s for large files

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    // ── 1. Load the analysis (owner-scoped) ────────────────────────────
    const { rows: aRows } = await db.query(
      `SELECT id, upload_id, sheet_name, filename, brief_id, results_json
         FROM analyses
        WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [id, session.userId],
    );
    if (aRows.length === 0) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    }
    const analysis = aRows[0];

    // ── 2. Load original rows from the appropriate table ───────────────
    // Try gwi_time_spent first (the dominant GWI shape), then fall back to
    // tool_data for generic / non-GWI uploads.
    const gwiRes = await db.query(
      `SELECT time_bucket, audience, audience_pct, data_point_pct, universe, index_score, responses
         FROM gwi_time_spent
        WHERE upload_id = $1 AND sheet_name = $2`,
      [analysis.upload_id, analysis.sheet_name],
    );

    let sourceRows: any[];
    if (gwiRes.rows.length > 0) {
      // Map back to the column names buildInsightSlots expects (case-insensitive
      // normalisation happens inside that function).
      sourceRows = gwiRes.rows.map(r => ({
        'Short Label Question': r.time_bucket,
        'Attributes':           r.audience,
        'Audience %':           r.audience_pct,
        'Data point %':         r.data_point_pct,
        'Universe':             r.universe,
        'Index':                r.index_score,
        'Responses':            r.responses,
      }));
    } else {
      const toolRes = await db.query(
        `SELECT row_data FROM tool_data
          WHERE upload_id = $1 AND sheet_name = $2
          ORDER BY id ASC LIMIT 2000`,
        [analysis.upload_id, analysis.sheet_name],
      );
      if (toolRes.rows.length === 0) {
        return NextResponse.json(
          { error: 'No source rows found for this upload/sheet. The original data may have been purged.' },
          { status: 422 },
        );
      }
      sourceRows = toolRes.rows.map((r: any) => r.row_data);
    }

    // ── 3. Re-run the analyze-data pipeline in-process ─────────────────
    // Call the route handler directly — picks up every blueprint change
    // (Insight Strategist prompt, Main Headline + Audience Snapshot,
    // chart Rules A + B, bucket classifier fixes).
    const internalReq = new NextRequest('http://localhost/api/ai/analyze-data', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        rows:      sourceRows,
        sheetName: analysis.sheet_name,
        fileNames: [analysis.filename],
        briefId:   analysis.brief_id ?? null,
      }),
    });
    const internalRes = await analyzeDataPOST(internalReq);
    const aiBody = await internalRes.json();

    if (!internalRes.ok || !Array.isArray(aiBody.insights) || aiBody.insights.length === 0) {
      return NextResponse.json(
        { error: `Pipeline returned no insights: ${aiBody.error ?? 'unknown'}`, detail: aiBody },
        { status: 502 },
      );
    }

    // ── 4. Build the same `results` shape the upload page writes ───────
    const existing = analysis.results_json ?? {};
    const updatedResults = {
      ...existing,                                   // preserve scorecards, strategicBrief, anomalies if present
      charts:         insightsToCharts(aiBody.insights, `regen-${Date.now()}`),
      overview:       aiBody.overview ?? null,
      meta: {
        ...(existing.meta ?? {}),
        domain:       existing.meta?.domain ?? 'GWI',
        title:        existing.meta?.title  ?? analysis.sheet_name,
        cls:          existing.meta?.cls    ?? 'content',
        regeneratedAt: new Date().toISOString(),
      },
    };

    // ── 5. Persist ─────────────────────────────────────────────────────
    await db.query(
      `UPDATE analyses
          SET results_json = $1::jsonb
        WHERE id = $2 AND (user_id = $3 OR user_id IS NULL)`,
      [JSON.stringify(updatedResults), id, session.userId],
    );

    return NextResponse.json({
      id,
      regenerated:      true,
      insightsCount:    aiBody.insights.length,
      hasOverview:      Boolean(aiBody.overview?.headline),
      fallback:         aiBody.fallback ?? null,
      regeneratedAt:    updatedResults.meta.regeneratedAt,
    });
  } catch (err: any) {
    console.error('[regenerate] failed:', err);
    return NextResponse.json({ error: err.message ?? 'Regeneration failed' }, { status: 500 });
  }
}

