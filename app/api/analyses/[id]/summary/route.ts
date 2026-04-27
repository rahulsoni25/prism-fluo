/**
 * GET /api/analyses/[id]/summary
 *
 * Generates or retrieves the executive summary (HEADLINE, OBJECTIVE,
 * OBSERVATIONS, RECOMMENDATIONS) for an analysis using the SMART framework.
 * Owner-checked — 404 on mis-owned.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { generateExecutiveSummary } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  try {
    // Owner-check the analysis
    const { rows } = await db.query(
      `SELECT id, results_json, sheet_name, filename
       FROM analyses
       WHERE id = $1 AND user_id = $2`,
      [id, session.userId],
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const analysis = rows[0];
    const results = analysis.results_json || {};
    const charts = Array.isArray(results.charts) ? results.charts : [];
    const meta = results.meta || {};

    // If summary already stored, return it
    if (results.executiveSummary) {
      return NextResponse.json(results.executiveSummary);
    }

    // Otherwise, generate it from the charts
    if (charts.length === 0) {
      return NextResponse.json({
        headline: 'No insights to summarize',
        objective: 'Analysis data not available',
        observations: [],
        recommendations: [],
      });
    }

    const context = analysis.sheet_name || analysis.filename || 'Data Analysis';
    const toolLabel = meta.toolLabel || meta.domain || 'Analysis Tool';

    // Generate summary from charts alone (without raw data)
    const summary = await generateExecutiveSummary(charts, [], context, toolLabel);

    // Optionally, cache it in the database by updating results_json
    // (This keeps future loads fast without regenerating)
    await db.query(
      `UPDATE analyses
       SET results_json = jsonb_set(results_json, '{executiveSummary}', $1::jsonb)
       WHERE id = $2`,
      [JSON.stringify(summary), id],
    ).catch((err: any) => {
      // Silently fail cache update — still return the summary
      console.warn('[analysis:summary] cache update failed:', err.message);
    });

    return NextResponse.json(summary);

  } catch (err: any) {
    console.error('[analysis:summary] failed:', err.message);
    return NextResponse.json(
      { error: 'SUMMARY_GENERATION_FAILED', message: err.message },
      { status: 500 },
    );
  }
}
