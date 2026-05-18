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
import { generateExecutiveSummary, generateStrategicRead } from '@/lib/ai/gemini';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  try {
    // Owner-check the analysis + pull brief_id so we can synthesise from brief
    const { rows } = await db.query(
      `SELECT id, results_json, sheet_name, filename, brief_id
       FROM analyses
       WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [id, session.userId],
    );

    if (rows.length === 0) {
      // FALLBACK: If DB is down in dev, return a mock summary for dummy IDs
      if (id.startsWith('dummy-') && process.env.NODE_ENV !== 'production') {
        return NextResponse.json({
          headline: 'Nike India: Capturing the Gen Z Fitness Movement',
          strategicRead:
            "Nike India's growth brief lands at a sharp moment: 18–34 fitness-led shoppers spend " +
            "4.2× more time on short-form video than static creative, yet Nike's DTC conversion " +
            "lags category peers by 7 points despite high brand consideration. The tension is " +
            "an aspiration-affordability gap — Tier 2/3 markets convert 3× lower because the " +
            "₹6,000+ entry price doesn't match local wallet. Lean into accessible-premium SKUs " +
            "and a vertical-video-first creative system rather than translating global campaigns.",
          actions: [
            'Shift 70% of social budget to vertical short-form video (Reels/Shorts) within Q1.',
            'Launch an "Accessible Premium" SKU line at ₹2,000–₹4,000 in next 90 days.',
            'Hyper-target Bangalore and Mumbai pin-codes with high purchase-intent signals before festive.'
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
      // ── STRATEGIC READ: ONE-paragraph narrative bridge ───────────
      // Replaces the old "Key Findings" bullet list (which duplicated the
      // Nuggets rail headlines word-for-word). The Strategic Read is the
      // ONLY connective tissue on the page — it names the audience
      // moment, the opportunity, the tension, and the posture.
      let brief: any = null;
      if (analysis.brief_id) {
        const { rows: briefRows } = await db.query(
          'SELECT * FROM briefs WHERE id = $1',
          [analysis.brief_id],
        );
        brief = briefRows[0] ?? null;
      }
      const audienceDescriptor = brief ? [
        brief.gender,
        brief.age_ranges,
        brief.sec && `SEC ${brief.sec}`,
        brief.geography || brief.market,
      ].filter(Boolean).join(' · ') : null;

      // Build top-fact-per-bucket from ALL uploaded sheets. This is what
      // feeds the multi-source rule in the strategic-read prompt — without
      // it, Gemini only sees the keyword+shelf nuggets and ignores GWI,
      // social listening, PPTX, etc.
      const allBucketCards = [...charts]
        .filter((c: any) => c.bucket && (c.title || c.stat))
        .sort((a: any, b: any) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0));

      // Use cached strategicRead if we've generated it before for this row
      let strategicRead: string = results.executiveSummary?.strategicRead || '';
      if (!strategicRead) {
        strategicRead = await generateStrategicRead({
          brief,
          nuggets,
          audienceDescriptor,
          allBucketCards,
          fallbackTopCards: allBucketCards.slice(0, 5),
        });
      }

      // ── NEXT MOVES (actions): BUCKET-DIVERSE selection ──────────
      // Pull from highest-conviction recs (>=75) but enforce ONE action
      // per bucket so 3 actions cover 3 different angles (e.g. one media,
      // one creative, one commerce — not 3 commerce). Also deduped against
      // each other AND against the strategicRead paragraph.
      const seenActionStarts = new Set<string>();
      const seenBuckets = new Set<string>();
      const actions: string[] = [];
      const ranked = allBucketCards.filter((c: any) => c.rec && (c.conviction ?? 0) >= 75);

      const readLower = strategicRead.toLowerCase();
      // Pass 1: bucket-unique. Pass 2: top up any remaining slots.
      for (const c of ranked) {
        if (actions.length >= 3) break;
        const bucket = String(c.bucket || '').toLowerCase();
        if (seenBuckets.has(bucket)) continue;
        const labelMatch = String(c.rec).match(/(?:CREATIVE|MEDIA|BRAND|STRATEGY|CHANNEL|EXPERIENCE)\s*[:—]\s*([^\n]+?[.!?])(?=\s|$)/);
        let sent = labelMatch?.[1]?.trim() || String(c.rec).trim().split(/(?<=[.!?])\s+/)[0];
        if (!sent || sent.length < 20) continue;
        const head = sent.toLowerCase().slice(0, 25);
        if (seenActionStarts.has(head)) continue;
        if (readLower && sent.length > 30 && readLower.includes(sent.toLowerCase().slice(0, 30))) continue;
        seenActionStarts.add(head);
        seenBuckets.add(bucket);
        actions.push(sent.length > 180 ? sent.slice(0, 178) + '…' : sent);
      }
      // Pass 2: top up if we under-filled (small analyses with <3 distinct buckets)
      for (const c of ranked) {
        if (actions.length >= 3) break;
        const labelMatch = String(c.rec).match(/(?:CREATIVE|MEDIA|BRAND|STRATEGY|CHANNEL|EXPERIENCE)\s*[:—]\s*([^\n]+?[.!?])(?=\s|$)/);
        let sent = labelMatch?.[1]?.trim() || String(c.rec).trim().split(/(?<=[.!?])\s+/)[0];
        if (!sent || sent.length < 20) continue;
        const head = sent.toLowerCase().slice(0, 25);
        if (seenActionStarts.has(head)) continue;
        if (readLower && sent.length > 30 && readLower.includes(sent.toLowerCase().slice(0, 30))) continue;
        seenActionStarts.add(head);
        actions.push(sent.length > 180 ? sent.slice(0, 178) + '…' : sent);
      }

      const summary = {
        headline:      headline || 'Strategic readout',
        strategicRead,
        actions,
      };

      await db.query(
        `UPDATE analyses
         SET results_json = jsonb_set(results_json, '{executiveSummary}', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(summary), id],
      ).catch((err: any) => console.warn('[analysis:summary] cache update failed:', err.message));

      return NextResponse.json(summary);
    }

    // ── FALLBACK (legacy analyses with no nuggets payload) ──────────
    //  Even without nuggets, we still synthesise a Strategic Read paragraph
    //  using the top-conviction charts as data context. Then attach
    //  deduped Next Moves from the same charts.
    if (results.executiveSummary?.strategicRead) {
      const es = results.executiveSummary;
      return NextResponse.json({
        headline:      es.headline,
        strategicRead: es.strategicRead,
        actions:       Array.isArray(es.actions) ? es.actions : (es.recommendations || []),
      });
    }

    // Fetch brief for legacy path too
    let legacyBrief: any = null;
    if (analysis.brief_id) {
      const { rows: briefRows } = await db.query(
        'SELECT * FROM briefs WHERE id = $1',
        [analysis.brief_id],
      );
      legacyBrief = briefRows[0] ?? null;
    }
    const legacyAudience = legacyBrief ? [
      legacyBrief.gender,
      legacyBrief.age_ranges,
      legacyBrief.sec && `SEC ${legacyBrief.sec}`,
      legacyBrief.geography || legacyBrief.market,
    ].filter(Boolean).join(' · ') : null;

    const topCards = [...charts]
      .sort((a: any, b: any) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0))
      .slice(0, 5);

    const strategicRead = await generateStrategicRead({
      brief: legacyBrief,
      nuggets: {},  // none on legacy
      audienceDescriptor: legacyAudience,
      allBucketCards: [...charts].sort((a: any, b: any) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0)),
      fallbackTopCards: topCards,
    });

    // Build actions from top-conviction recs — bucket-diverse across uploaded sheets
    const seenLegacyActionStarts = new Set<string>();
    const seenLegacyBuckets = new Set<string>();
    const legacyActions: string[] = [];
    const readLowerL = strategicRead.toLowerCase();
    const rankedLegacy = [...charts]
      .filter((c: any) => c.rec && (c.conviction ?? 0) >= 70)
      .sort((a: any, b: any) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0));

    // Pass 1 — one per bucket
    for (const c of rankedLegacy) {
      if (legacyActions.length >= 3) break;
      const bucket = String(c.bucket || '').toLowerCase();
      if (seenLegacyBuckets.has(bucket)) continue;
      const labelMatch = String(c.rec).match(/(?:CREATIVE|MEDIA|BRAND|STRATEGY|CHANNEL|EXPERIENCE)\s*[:—]\s*([^\n]+?[.!?])(?=\s|$)/);
      let sent = labelMatch?.[1]?.trim() || String(c.rec).trim().split(/(?<=[.!?])\s+/)[0];
      if (!sent || sent.length < 20) continue;
      const head = sent.toLowerCase().slice(0, 25);
      if (seenLegacyActionStarts.has(head)) continue;
      if (readLowerL && sent.length > 30 && readLowerL.includes(sent.toLowerCase().slice(0, 30))) continue;
      seenLegacyActionStarts.add(head);
      seenLegacyBuckets.add(bucket);
      legacyActions.push(sent.length > 180 ? sent.slice(0, 178) + '…' : sent);
    }
    // Pass 2 — top up if under-filled
    for (const c of rankedLegacy) {
      if (legacyActions.length >= 3) break;
      const labelMatch = String(c.rec).match(/(?:CREATIVE|MEDIA|BRAND|STRATEGY|CHANNEL|EXPERIENCE)\s*[:—]\s*([^\n]+?[.!?])(?=\s|$)/);
      let sent = labelMatch?.[1]?.trim() || String(c.rec).trim().split(/(?<=[.!?])\s+/)[0];
      if (!sent || sent.length < 20) continue;
      const head = sent.toLowerCase().slice(0, 25);
      if (seenLegacyActionStarts.has(head)) continue;
      if (readLowerL && sent.length > 30 && readLowerL.includes(sent.toLowerCase().slice(0, 30))) continue;
      seenLegacyActionStarts.add(head);
      legacyActions.push(sent.length > 180 ? sent.slice(0, 178) + '…' : sent);
    }

    // If Gemini failed and we have an old cached summary, lift findings from there
    let legacyHeadline = headline;
    if (!legacyHeadline && results.executiveSummary?.headline) legacyHeadline = results.executiveSummary.headline;
    if (!legacyHeadline) {
      const context = analysis.sheet_name || analysis.filename || 'Data Analysis';
      const toolLabel = meta.toolLabel || meta.domain || 'Analysis Tool';
      const llmSummary = await generateExecutiveSummary(charts, [], context, toolLabel);
      legacyHeadline = llmSummary.headline;
    }

    const legacySummary = {
      headline:      legacyHeadline || 'Strategic readout',
      strategicRead,
      actions:       legacyActions,
    };

    await db.query(
      `UPDATE analyses
       SET results_json = jsonb_set(results_json, '{executiveSummary}', $1::jsonb)
       WHERE id = $2`,
      [JSON.stringify(legacySummary), id],
    ).catch((err: any) => console.warn('[analysis:summary] cache update failed:', err.message));

    return NextResponse.json(legacySummary);

  } catch (err: any) {
    console.error('[analysis:summary] failed:', err.message);
    return NextResponse.json(
      { error: 'SUMMARY_GENERATION_FAILED', message: err.message },
      { status: 500 },
    );
  }
}
