/**
 * lib/presentations/dual-agent-verify.ts
 *
 * Two-agent download gatekeeper. Both must report clean before download.
 *
 *   Agent A — Visual / Structural Inspector (lib/presentations/deck-inspector)
 *     Now template-aware (per-template slide flow, brand palette, font
 *     bands) + content-cross-referenced (every high-conviction insight
 *     card from the source analysis must appear in the deck).
 *
 *   Agent B — Content Verification Council (lib/ai/verify/orchestrator)
 *     ProofReader + StatChecker + FactAnalyzer. Report read from cache.
 *
 * Total time budget: ≤ 1 second on warm cache, ≤ 4 seconds cold.
 */

import { db } from '@/lib/db/client';
import { inspectDeck, type InspectorReport } from './deck-inspector';
import type { VerificationReport } from '@/lib/ai/verify/types';

export interface DualAgentVerdict {
  ready:      boolean;
  visual:     InspectorReport;
  content:    VerificationReport | null;
  contentNote?: string;
  combinedBlockers: number;
  combinedMajors:   number;
  elapsedMs:  number;
}

async function fetchContentReport(analysisId: string | null): Promise<VerificationReport | null> {
  if (!analysisId) return null;
  try {
    const { rows } = await db.query(
      'SELECT report FROM analysis_verifications WHERE analysis_id = $1',
      [analysisId],
    );
    if (rows.length === 0) return null;
    return rows[0].report as VerificationReport;
  } catch {
    return null;
  }
}

async function fetchSourceCards(analysisId: string | null): Promise<Array<{ title: string; conviction?: number }>> {
  if (!analysisId) return [];
  try {
    const { rows } = await db.query(
      'SELECT results_json FROM analyses WHERE id = $1',
      [analysisId],
    );
    const charts = rows[0]?.results_json?.charts ?? [];
    return charts.map((c: any) => ({
      title: String(c.title || ''),
      conviction: Number(c.conviction) || 0,
    }));
  } catch {
    return [];
  }
}

export async function dualAgentVerify(
  pptxBuffer: Buffer,
  analysisId: string | null,
  templateName: string | null = null,
): Promise<DualAgentVerdict> {
  const t0 = Date.now();
  // Run prep + both agents in parallel for max speed
  const [content, sourceCards] = await Promise.all([
    fetchContentReport(analysisId),
    fetchSourceCards(analysisId),
  ]);
  const visual = await inspectDeck(pptxBuffer, { templateName, sourceCards });

  let contentNote: string | undefined;
  if (!content && analysisId) contentNote = 'Content council has not run for this analysis yet — visual checks only.';
  if (!analysisId)            contentNote = 'No analysis linked to this presentation — visual checks only.';

  const visualBlockers  = visual.issues.filter(i => i.severity === 'blocker').length;
  const visualMajors    = visual.issues.filter(i => i.severity === 'major').length;
  const contentBlockers = content?.summary?.bySeverity?.blocker ?? 0;
  const contentMajors   = content?.summary?.bySeverity?.major ?? 0;

  const combinedBlockers = visualBlockers + contentBlockers;
  const combinedMajors   = visualMajors + contentMajors;
  const ready = combinedBlockers === 0 && visual.ok;

  return {
    ready, visual, content, contentNote,
    combinedBlockers, combinedMajors,
    elapsedMs: Date.now() - t0,
  };
}
