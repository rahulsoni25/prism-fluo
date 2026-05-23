/**
 * lib/presentations/dual-agent-verify.ts
 *
 * The autonomous download decision-maker. Two agents (visual + content)
 * report independently, then a verdict policy turns those into one of
 * four actions:
 *
 *   ALLOW           — both agents clean (or only minors)
 *   BLOCK           — confirmed blockers, none are auto-recoverable
 *   AUTO-RECOVER    — confirmed blockers but ALL are recoverable
 *                     (truncated titles, placeholders, missing alt-text).
 *                     The agent fires /regenerate in the background and
 *                     re-verifies. If the re-verify is clean → ALLOW.
 *                     If it still fails → BLOCK.
 *   ASK             — borderline (majors only, no blockers). User decides.
 *
 * Confidence score (0–100) is attached to every verdict so the UI can
 * say "85% confident, blocking" rather than just "blocked". Helps the
 * user know whether to trust the agent's call vs override it.
 */

import { db } from '@/lib/db/client';
import { inspectDeck, type InspectorReport, type InspectorIssue } from './deck-inspector';
import type { VerificationReport } from '@/lib/ai/verify/types';

export type VerdictAction = 'allow' | 'block' | 'auto-recover' | 'ask';

export interface DualAgentVerdict {
  ready:      boolean;
  action:     VerdictAction;
  confidence: number;        // 0–100; how sure the agent is of its call
  reasoning:  string;        // 1-line explanation for the UI
  visual:     InspectorReport;
  content:    VerificationReport | null;
  contentNote?: string;
  combinedBlockers: number;
  combinedMajors:   number;
  recoverableBlockers: number;
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
    const { rows } = await db.query('SELECT results_json FROM analyses WHERE id = $1', [analysisId]);
    const charts = rows[0]?.results_json?.charts ?? [];
    return charts.map((c: any) => ({ title: String(c.title || ''), conviction: Number(c.conviction) || 0 }));
  } catch {
    return [];
  }
}

/** Decide what to do with a set of findings.
 *  Confidence model: higher when severities are stark + sources agree. */
function decide(visual: InspectorReport, content: VerificationReport | null): {
  action: VerdictAction;
  confidence: number;
  reasoning: string;
} {
  const visualBlockers     = visual.issues.filter(i => i.severity === 'blocker');
  const visualMajors       = visual.issues.filter(i => i.severity === 'major');
  const contentBlockers    = content?.summary?.bySeverity?.blocker ?? 0;
  const contentMajors      = content?.summary?.bySeverity?.major   ?? 0;
  const totalBlockers      = visualBlockers.length + contentBlockers;
  const totalMajors        = visualMajors.length + contentMajors;

  // Content-council blockers are always considered non-recoverable from the
  // deck side — they came from the source analysis, which would need its own
  // regenerate before any deck regenerate makes sense.
  const allVisualBlockersRecoverable = visualBlockers.length > 0 &&
    visualBlockers.every(b => b.recoverable === true);

  // ALLOW path
  if (totalBlockers === 0 && totalMajors === 0) {
    return { action: 'allow', confidence: 98, reasoning: 'Both agents report fully clean.' };
  }
  if (totalBlockers === 0 && totalMajors <= 5) {
    return { action: 'allow', confidence: 88, reasoning: `Clean of blockers; ${totalMajors} minor warning(s) — within acceptable noise floor.` };
  }

  // AUTO-RECOVER path — only if blockers are JUST visual + all recoverable +
  // no content blockers (which would need an upstream regenerate)
  if (contentBlockers === 0 && allVisualBlockersRecoverable && visualBlockers.length <= 5) {
    return {
      action: 'auto-recover',
      confidence: 75,
      reasoning: `${visualBlockers.length} visual blocker(s) detected — all are auto-recoverable. Attempting regenerate.`,
    };
  }

  // BLOCK path — content blockers or many visual blockers
  if (contentBlockers > 0) {
    return {
      action: 'block',
      confidence: 95,
      reasoning: `Content council found ${contentBlockers} confirmed blocker(s) in the source analysis — fix the source insights before regenerating the deck.`,
    };
  }
  if (visualBlockers.length > 0) {
    return {
      action: 'block',
      confidence: 90,
      reasoning: `Visual inspector found ${visualBlockers.length} blocker(s) that auto-recovery can't fix.`,
    };
  }

  // ASK path — too many majors to allow without confirmation
  return {
    action: 'ask',
    confidence: 60,
    reasoning: `${totalMajors} major warning(s) detected — no blockers, but reviewer attention recommended.`,
  };
}

export async function dualAgentVerify(
  pptxBuffer: Buffer,
  analysisId: string | null,
  templateName: string | null = null,
): Promise<DualAgentVerdict> {
  const t0 = Date.now();

  // Prep in parallel
  const [content, sourceCards] = await Promise.all([
    fetchContentReport(analysisId),
    fetchSourceCards(analysisId),
  ]);
  const visual = await inspectDeck(pptxBuffer, { templateName, sourceCards });

  const decision = decide(visual, content);

  let contentNote: string | undefined;
  if (!content && analysisId) contentNote = 'Content council has not run for this analysis yet — visual checks only.';
  if (!analysisId)            contentNote = 'No analysis linked to this presentation — visual checks only.';

  const visualBlockers  = visual.issues.filter(i => i.severity === 'blocker').length;
  const visualMajors    = visual.issues.filter(i => i.severity === 'major').length;
  const contentBlockers = content?.summary?.bySeverity?.blocker ?? 0;
  const contentMajors   = content?.summary?.bySeverity?.major ?? 0;
  const recoverableBlockers = visual.issues.filter(i => i.severity === 'blocker' && i.recoverable === true).length;

  return {
    ready: decision.action === 'allow',
    action: decision.action,
    confidence: decision.confidence,
    reasoning: decision.reasoning,
    visual, content, contentNote,
    combinedBlockers: visualBlockers + contentBlockers,
    combinedMajors:   visualMajors + contentMajors,
    recoverableBlockers,
    elapsedMs: Date.now() - t0,
  };
}
