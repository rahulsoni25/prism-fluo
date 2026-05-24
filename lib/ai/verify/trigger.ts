/**
 * lib/ai/verify/trigger.ts
 *
 * Centralized helper for firing the 3-agent verification council against an
 * analysis. Called from every lifecycle event where insights are created or
 * mutated:
 *   - /api/analyses POST                (new analysis from /analyze-data)
 *   - /api/analyses/[id]/regenerate POST (re-run with newer prompts)
 *   - /api/briefs/[id] PATCH → status=ready (manual flip; only re-verifies
 *      if there's no stored report yet)
 *
 * Fire-and-forget by design — never blocks the calling route. If the
 * council fails the originating action still succeeds; the failure is
 * logged but never surfaced to the user. This is the right trade-off:
 * verification is helpful, not blocking.
 */

import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { verifyAnalysis, buildGeminiFeedback } from './orchestrator';
import type { CardInput, VerificationReport } from './types';

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS analysis_verifications (
      analysis_id   UUID PRIMARY KEY,
      report        JSONB NOT NULL,
      generated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      mode          TEXT NOT NULL DEFAULT 'rules-only',
      feedback      TEXT
    )
  `);
  // The `feedback` column is new — add it to existing tables idempotently.
  await db.query(`ALTER TABLE analysis_verifications ADD COLUMN IF NOT EXISTS feedback TEXT`);
}

async function storeReport(analysisId: string, report: VerificationReport, mode: string, feedback: string) {
  await ensureTable();
  await db.query(
    `INSERT INTO analysis_verifications (analysis_id, report, generated_at, mode, feedback)
     VALUES ($1, $2, NOW(), $3, $4)
     ON CONFLICT (analysis_id)
     DO UPDATE SET report = EXCLUDED.report,
                   generated_at = EXCLUDED.generated_at,
                   mode = EXCLUDED.mode,
                   feedback = EXCLUDED.feedback`,
    [analysisId, JSON.stringify(report), mode, feedback || null],
  );
}

/**
 * Load chart data + brand for an analysis, then run the council. Stores the
 * result. Never throws — logs and swallows. Returns the report on success
 * or null on any failure.
 */
export async function triggerCouncilForAnalysis(
  analysisId: string,
  opts: { llm?: boolean; reason?: string } = {},
): Promise<VerificationReport | null> {
  const reason = opts.reason || 'unspecified';
  try {
    const { rows } = await db.query(
      `SELECT a.results_json, b.brand, b.gender, b.age_ranges, b.geography, b.market,
              b.competitors, b.category, b.objective,
              -- Cross-council: pull the most recent mapper verdict for this brief
              (SELECT u.mapper_verdict FROM uploads u
                WHERE u.brief_id = a.brief_id AND u.mapper_verdict IS NOT NULL
                ORDER BY u.created_at DESC LIMIT 1) AS mapper_verdict
         FROM analyses a
         LEFT JOIN briefs b ON b.id = a.brief_id
        WHERE a.id = $1`,
      [analysisId],
    );
    if (rows.length === 0) {
      logger.warn('verify:trigger:not_found', { analysisId, reason });
      return null;
    }
    const charts: any[] = rows[0].results_json?.charts ?? [];
    if (charts.length === 0) {
      logger.info('verify:trigger:no_charts', { analysisId, reason });
      return null;
    }
    const brand: string | null = rows[0].brand ?? null;
    // Attach brief audience fields to the first card so math-integrity
    // agent can re-derive TAM. (Other agents ignore the .brief field.)
    const brief = {
      brand:       rows[0].brand,
      gender:      rows[0].gender,
      age_ranges:  rows[0].age_ranges,
      geography:   rows[0].geography,
      market:      rows[0].market,
      competitors: rows[0].competitors,
      category:    rows[0].category,
      objective:   rows[0].objective,
    };
    const cards: CardInput[] = charts.map((c: any, i: number) => ({
      index: i,
      title: c.title || '(no title)',
      obs:   c.obs,
      stat:  c.stat,
      rec:   c.rec,
      bucket: c.bucket,
      computedChartData: c.computedChartData,
      toolLabel: c.toolLabel,
      ...(i === 0 ? { brief } : {}),
    }) as any);

    // Cross-council intel: if Mapper graded the source as thin / image-only,
    // log it so we can correlate weak verification scores with weak source files
    // on the agents dashboard. Future: pass this into verifyAnalysis to soften
    // FactAnalyzer findings when the source is known-thin.
    const mapperVerdict: any = rows[0].mapper_verdict ?? null;
    if (mapperVerdict && (mapperVerdict.blockers > 0 || mapperVerdict.majors > 0)) {
      logger.info('verify:trigger:mapper_warning', {
        analysisId, reason,
        mapperGrade:    mapperVerdict.grade,
        mapperBlockers: mapperVerdict.blockers,
        mapperMajors:   mapperVerdict.majors,
        mapperTopFinding: mapperVerdict.topFinding,
      });
    }

    const t0 = Date.now();
    const report = await verifyAnalysis(analysisId, cards, brand, { llm: opts.llm });
    const feedback = buildGeminiFeedback(report);
    await storeReport(analysisId, report, opts.llm ? 'rules+llm' : 'rules-only', feedback);

    logger.info('verify:trigger:complete', {
      analysisId, reason, ms: Date.now() - t0,
      totalCards: report.summary.totalCards,
      cardsWithIssues: report.summary.cardsWithIssues,
      confirmedFindings: report.summary.confirmedFindings,
      mode: opts.llm ? 'rules+llm' : 'rules-only',
    });
    return report;
  } catch (err: any) {
    logger.warn('verify:trigger:failed', { analysisId, reason, error: err.message });
    return null;
  }
}

/**
 * Fire the council in the background. Returns immediately, the work happens
 * after the caller's response is already sent. Use this from POST/PATCH
 * routes that mustn't be blocked by verification time.
 */
export function fireCouncilInBackground(
  analysisId: string,
  opts: { llm?: boolean; reason?: string } = {},
): void {
  triggerCouncilForAnalysis(analysisId, opts).catch((err: Error) =>
    logger.warn('verify:trigger:background_failed', { analysisId, error: err.message }),
  );
}

/**
 * Verify only if no report exists yet. Used by brief-status PATCHes — we
 * don't want to re-verify an already-checked analysis just because the
 * brief flipped to ready. Idempotent + cheap.
 */
export async function ensureCouncilHasRun(analysisId: string, reason: string): Promise<void> {
  try {
    await ensureTable();
    const { rows } = await db.query(
      'SELECT analysis_id FROM analysis_verifications WHERE analysis_id = $1',
      [analysisId],
    );
    if (rows.length > 0) return; // already verified
    fireCouncilInBackground(analysisId, { reason });
  } catch (err: any) {
    logger.warn('verify:ensure:failed', { analysisId, reason, error: err.message });
  }
}
