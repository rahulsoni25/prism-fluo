/**
 * lib/presentations/dual-agent-verify.ts
 *
 * Two-agent download gatekeeper. Both agents must report clean before the
 * download is allowed to proceed.
 *
 *   Agent A — Visual / Structural Inspector (lib/presentations/deck-inspector)
 *     Reads the PPTX bytes, walks every slide + chart, flags:
 *       • empty / placeholder / truncated titles
 *       • charts with no data or no labels
 *       • mixed colour palettes
 *       • table-header gaps
 *
 *   Agent B — Content Verification Council (lib/ai/verify/orchestrator)
 *     The ProofReader + StatChecker + FactAnalyzer trio scans the source
 *     analysis cards (the same content that fed the deck generator) for:
 *       • language quality, jargon, length
 *       • number-traces-to-data
 *       • claim-vs-source consistency
 *
 * The two agents talk through this orchestrator. They run in PARALLEL —
 * total wall time = max(A, B), not A + B. Typical: A ≈ 300ms, B is cached
 * from the analysis lifecycle so ≈ 50ms. Worst case under 1 second.
 *
 * VERDICT POLICY:
 *   ready=true   ↔ Agent A clean (no blockers) AND Agent B clean (0 confirmed)
 *   ready=false  ↔ either agent flagged blockers. Return both reports so
 *                  the UI can show a unified "what's wrong" list.
 *
 * The content council is consulted only via its STORED report. If no report
 * exists for the analysis yet (rare — the council auto-runs on analysis
 * create), we skip the content check and warn rather than block. Visual
 * remains the hard gate.
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

export async function dualAgentVerify(
  pptxBuffer: Buffer,
  analysisId: string | null,
): Promise<DualAgentVerdict> {
  const t0 = Date.now();
  // Run both agents in parallel
  const [visual, content] = await Promise.all([
    inspectDeck(pptxBuffer),
    fetchContentReport(analysisId),
  ]);

  let contentNote: string | undefined;
  if (!content && analysisId) {
    contentNote = 'Content council has not run for this analysis yet — visual checks only.';
  }
  if (!analysisId) {
    contentNote = 'No analysis linked to this presentation — visual checks only.';
  }

  const visualBlockers = visual.issues.filter(i => i.severity === 'blocker').length;
  const visualMajors   = visual.issues.filter(i => i.severity === 'major').length;
  const contentBlockers = content?.summary?.bySeverity?.blocker ?? 0;
  const contentMajors   = content?.summary?.bySeverity?.major ?? 0;

  const combinedBlockers = visualBlockers + contentBlockers;
  const combinedMajors   = visualMajors + contentMajors;

  // Ready = no blockers from either agent. Majors are surfaced as warnings
  // but don't block — the user can still download with a notice.
  const ready = combinedBlockers === 0 && visual.ok;

  return {
    ready,
    visual,
    content,
    contentNote,
    combinedBlockers,
    combinedMajors,
    elapsedMs: Date.now() - t0,
  };
}
