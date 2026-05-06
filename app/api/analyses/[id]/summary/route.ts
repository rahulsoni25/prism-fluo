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
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [id, session.userId],
    );

    if (rows.length === 0) {
      // FALLBACK: If DB is down in dev, return a mock summary for dummy IDs
      if (id.startsWith('dummy-') && process.env.NODE_ENV !== 'production') {
        return NextResponse.json({
          headline: 'Nike India: Capturing the Gen Z Fitness Movement',
          objective: 'Analyze strategic growth opportunities within the 18–34 Indian fitness segment across commerce and content channels.',
          observations: [
            'Short-form video engagement is 4.2× higher than static imagery for Gen Z consumers.',
            'DTC conversion rate lags category peers by 7 points despite high brand consideration.',
            'Tier 2/3 markets show high aspiration but 3× lower conversion due to price-to-value gaps.'
          ],
          recommendations: [
            'Shift 70% of social budget to vertical short-form video (Reels/Shorts).',
            'Launch an "Accessible Premium" SKU line targeting the ₹2,000–₹4,000 price band.',
            'Hyper-target Bangalore and Mumbai pin code clusters with high purchase intent signals.'
          ]
        });
      }
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
