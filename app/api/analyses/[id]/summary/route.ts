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
          keyFindings: [
            'Short-form video engagement is 4.2× higher than static imagery for Gen Z consumers.',
            'DTC conversion rate lags category peers by 7 points despite high brand consideration.',
            'Tier 2/3 markets show high aspiration but 3× lower conversion due to price-to-value gaps.'
          ],
          actions: [
            'Shift 70% of social budget to vertical short-form video (Reels/Shorts).',
            'Launch an "Accessible Premium" SKU line targeting the ₹2,000–₹4,000 price band.',
            'Hyper-target Bangalore and Mumbai pin code clusters with high purchase intent signals.'
          ]
        });
      }
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const analysis = rows[0];
    const results  = analysis.results_json || {};
    const charts   = Array.isArray(results.charts) ? results.charts : [];
    const meta     = results.meta || {};
    const nuggets  = results.nuggets  || {};   // deterministic, computed
    const overview = results.overview || {};   // deterministic, computed

    if (charts.length === 0) {
      return NextResponse.json({ headline: 'No insights to summarize', keyFindings: [], actions: [] });
    }

    /* ── PREFERRED PATH: build the panel from DETERMINISTIC sources ──
       The Executive Summary panel used to be double-LLM (Gemini generated
       cards → another Gemini call summarised those cards). That dilutes
       specificity. Now we synthesise the panel from the same computed
       nuggets that drive the rail — the numbers are CERTIFIED-from-data,
       not template phrases. Falls back to LLM summary only if nuggets are
       missing on legacy analyses. */
    const headline = overview.headline || results.executiveSummary?.headline || '';

    if (nuggets && (nuggets.keyword || nuggets.helium10 || nuggets.competition || nuggets.cultural || nuggets.trust)) {
      // ── KEY FINDINGS: pull the most concrete computed facts ─────
      // Sources in priority order: Keyword Nugget headline + hoverLines[0],
      // Helium 10 Nugget headline, Competition headline, Trust headline,
      // Cultural Cues headline. Up to 5 distinct findings.
      const keyFindings: string[] = [];
      if (nuggets.keyword?.headline)     keyFindings.push(nuggets.keyword.headline);
      if (nuggets.helium10?.headline)    keyFindings.push(nuggets.helium10.headline);
      if (nuggets.competition?.headline) keyFindings.push(nuggets.competition.headline);
      if (nuggets.trust?.headline)       keyFindings.push(nuggets.trust.headline);
      if (nuggets.cultural?.headline)    keyFindings.push(nuggets.cultural.headline);
      // Top-up with the strongest hoverLines if we have <4 findings
      const allHover: string[] = [
        ...(nuggets.keyword?.hoverLines  || []),
        ...(nuggets.helium10?.hoverLines || []),
        ...(nuggets.competition?.hoverLines || []),
      ].filter(l => l && !/needs|requires|read these|section/i.test(l));
      for (const h of allHover) {
        if (keyFindings.length >= 5) break;
        if (!keyFindings.some(f => f.toLowerCase().slice(0, 30) === h.toLowerCase().slice(0, 30))) {
          keyFindings.push(h);
        }
      }

      // ── ACTIONS: pull from the highest-conviction recommendations
      //    in the charts[] array, DEDUPED against any text that already
      //    appears in keyFindings (so the panel doesn't repeat itself). ──
      const seenActionStarts = new Set<string>();
      const actions: string[] = [];
      const ranked = [...charts]
        .filter((c: any) => c.rec && (c.conviction ?? 0) >= 75)
        .sort((a: any, b: any) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0));

      for (const c of ranked) {
        if (actions.length >= 4) break;
        // Extract the first sentence of the rec
        const sent = String(c.rec).trim().split(/(?<=[.!?])\s+/)[0];
        if (!sent || sent.length < 20) continue;
        // Dedup by leading 25 chars
        const head = sent.toLowerCase().slice(0, 25);
        if (seenActionStarts.has(head)) continue;
        // Skip if action's leading phrase echoes a finding too closely
        if (keyFindings.some(f => f.toLowerCase().slice(0, 25) === head)) continue;
        seenActionStarts.add(head);
        actions.push(sent.length > 180 ? sent.slice(0, 178) + '…' : sent);
      }

      const summary = {
        headline:    headline || (keyFindings[0] || 'Strategic readout'),
        keyFindings: keyFindings.slice(0, 5),
        actions:     actions.slice(0, 4),
      };

      // Cache for fast subsequent loads
      await db.query(
        `UPDATE analyses
         SET results_json = jsonb_set(results_json, '{executiveSummary}', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(summary), id],
      ).catch((err: any) => console.warn('[analysis:summary] cache update failed:', err.message));

      return NextResponse.json(summary);
    }

    // ── FALLBACK (legacy analyses with no nuggets payload) ──────────
    if (results.executiveSummary) {
      // Map old shape { objective, observations, recommendations } to new
      // { keyFindings, actions } for the updated panel UI.
      const es = results.executiveSummary;
      return NextResponse.json({
        headline:    es.headline,
        keyFindings: Array.isArray(es.observations) ? es.observations : [],
        actions:     Array.isArray(es.recommendations) ? es.recommendations : [],
      });
    }

    const context  = analysis.sheet_name || analysis.filename || 'Data Analysis';
    const toolLabel = meta.toolLabel || meta.domain || 'Analysis Tool';
    const llmSummary = await generateExecutiveSummary(charts, [], context, toolLabel);

    await db.query(
      `UPDATE analyses
       SET results_json = jsonb_set(results_json, '{executiveSummary}', $1::jsonb)
       WHERE id = $2`,
      [JSON.stringify(llmSummary), id],
    ).catch((err: any) => console.warn('[analysis:summary] cache update failed:', err.message));

    return NextResponse.json({
      headline:    llmSummary.headline,
      keyFindings: llmSummary.observations,
      actions:     llmSummary.recommendations,
    });

  } catch (err: any) {
    console.error('[analysis:summary] failed:', err.message);
    return NextResponse.json(
      { error: 'SUMMARY_GENERATION_FAILED', message: err.message },
      { status: 500 },
    );
  }
}
