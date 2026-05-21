/**
 * GET  /api/analyses/[id]/verify   — fetch the latest stored verification
 * POST /api/analyses/[id]/verify   — re-run the 3-agent council, store result
 *
 * The council itself is in lib/ai/verify/. This route hydrates the cards
 * from the saved analysis, runs orchestrator.verifyAnalysis(), stores the
 * report on analysis_verifications, and returns the JSON.
 *
 * Storage is "single latest" — re-running overwrites. Add a history table
 * later if we ever need to track verification drift over time.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { verifyAnalysis, buildGeminiFeedback } from '@/lib/ai/verify/orchestrator';
import { triggerCouncilForAnalysis, ensureCouncilHasRun } from '@/lib/ai/verify/trigger';
import type { CardInput } from '@/lib/ai/verify/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 120; // up to 2 min for LLM mode

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS analysis_verifications (
      analysis_id   UUID PRIMARY KEY,
      report        JSONB NOT NULL,
      generated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      mode          TEXT NOT NULL DEFAULT 'rules-only'
    )
  `);
}

async function loadCards(analysisId: string, userId: string): Promise<{ cards: CardInput[]; brand: string | null } | null> {
  const { rows } = await db.query(
    `SELECT a.results_json, b.brand
       FROM analyses a
       LEFT JOIN briefs b ON b.id = a.brief_id
      WHERE a.id = $1 AND (a.user_id = $2 OR a.user_id IS NULL)`,
    [analysisId, userId],
  );
  if (rows.length === 0) return null;
  const charts: any[] = rows[0].results_json?.charts ?? [];
  const cards: CardInput[] = charts.map((c, i) => ({
    index: i,
    title: c.title || '(no title)',
    obs:   c.obs,
    stat:  c.stat,
    rec:   c.rec,
    bucket: c.bucket,
    computedChartData: c.computedChartData,
    toolLabel: c.toolLabel,
  }));
  return { cards, brand: rows[0].brand };
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Confirm read access first
  const data = await loadCards(id, session.userId);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    await ensureTable();
    const { rows } = await db.query(
      'SELECT report, generated_at, mode FROM analysis_verifications WHERE analysis_id = $1',
      [id],
    );
    if (rows.length === 0) {
      // Auto-backfill: silently fire the council in the background. The
      // user sees "verification pending" once; the next page load shows
      // the result. Keeps existing analyses moving toward 100% coverage
      // without anyone having to remember to click anything.
      ensureCouncilHasRun(id, 'verify:GET:backfill').catch(() => {});
      return NextResponse.json({
        status: 'never-run',
        message: 'Verification started in the background. Refresh shortly to see results.',
      });
    }
    return NextResponse.json({
      status: 'stored',
      generatedAt: rows[0].generated_at,
      mode: rows[0].mode,
      report: rows[0].report,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Confirm read access via the same loadCards check (it scopes by user_id)
  const data = await loadCards(id, session.userId);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const useLlm = req.nextUrl.searchParams.get('llm') === '1';
  // Use the centralized trigger helper — same code path as the auto-fire
  // from analyses POST / regenerate, ensures identical storage shape.
  const report = await triggerCouncilForAnalysis(id, { llm: useLlm, reason: 'verify:manual' });
  if (!report) return NextResponse.json({ error: 'Council failed' }, { status: 500 });
  const feedback = buildGeminiFeedback(report);

  return NextResponse.json({
    status: 'verified',
    mode: useLlm ? 'rules+llm' : 'rules-only',
    report,
    geminiFeedback: feedback,
  });
}
