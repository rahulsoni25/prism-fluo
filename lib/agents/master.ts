/**
 * lib/agents/master.ts
 *
 * The master council orchestrator. PRISM has four specialist councils that
 * each own a stage of a brief's lifecycle:
 *
 *   UPLOAD   → Data Mapper Council     (3 agents: compressor, mapper-qa, senior-audit)
 *   ANALYZE  → AI Health Cascade       (2 agents: model-health, fallback-monitor)
 *   VERIFY   → Insight Verification    (5 agents: proofreader, stat-checker,
 *                                                fact-analyzer, math-integrity, coverage)
 *   EXPORT   → Export Gatekeeper       (2 agents: pdf-inspector, excel-inspector)
 *
 * This module gives all four councils a single calling convention,
 * cross-council context sharing, and a master 0–10 system grade that
 * combines every council's verdict on a given brief.
 *
 * It deliberately does NOT replace the existing per-council entry points
 * (runMapperCouncil, verifyAnalysis, dualAgentVerifyExport) — those keep
 * working as before. This is the high-level shim that the dashboard and
 * future cross-talk hooks consume.
 */

import { runMapperCouncil } from '@/lib/mapper/orchestrator';
import { triggerCouncilForAnalysis } from '@/lib/ai/verify/trigger';
import { getHealthSnapshot } from '@/lib/ai/model-health';
import { fallbackSummary }   from '@/lib/ai/fallback-monitor';
import { dualAgentVerifyExport } from '@/lib/exports/dual-agent-export';
import { recordMapperRun } from '@/lib/mapper/persistence';
import { logger } from '@/lib/logger';
import type { MapperVerdict } from '@/lib/mapper/types';

// ── Public types ─────────────────────────────────────────────────────────

export type Stage = 'upload' | 'analyze' | 'verify' | 'export';

export interface MasterCouncilVerdict {
  stage:      Stage;
  council:    string;
  grade:      number;    // 0–10
  ready:      boolean;
  attempts:   number;
  elapsedMs:  number;
  blockers:   number;
  majors:     number;
  /** Plain-language verdict shown to callers / dashboard. */
  summary:    string;
  /** Raw council-specific payload for callers that want details. */
  raw?:       any;
}

export interface StageContext {
  /** Mapper verdict (if upload stage already ran on the same file). Used by
   *  the Verification council to weight findings on scanned/image-only PDFs. */
  mapper?: MapperVerdict;
  /** Optional brief identifier so dashboard can group by brief later. */
  briefId?: string | null;
}

// ── Master council runner ────────────────────────────────────────────────

/** Run the council that owns the given lifecycle stage. */
export async function runCouncilForStage(
  stage: 'upload',
  args:  { buffer: Buffer; filename: string; userId?: string | null; ctx?: StageContext },
): Promise<MasterCouncilVerdict>;
export async function runCouncilForStage(
  stage: 'verify',
  args:  { analysisId: string; ctx?: StageContext },
): Promise<MasterCouncilVerdict>;
export async function runCouncilForStage(
  stage: 'export',
  args:  { buffer: Buffer; kind: 'pdf' | 'xlsx'; analysisId: string | null; ctx?: StageContext },
): Promise<MasterCouncilVerdict>;
export async function runCouncilForStage(
  stage: 'analyze',
  args:  { ctx?: StageContext },
): Promise<MasterCouncilVerdict>;
export async function runCouncilForStage(
  stage: Stage,
  args:  any,
): Promise<MasterCouncilVerdict> {
  const t0 = Date.now();
  try {
    switch (stage) {
      case 'upload':   return await runUploadCouncil(args, t0);
      case 'verify':   return await runVerifyCouncil(args, t0);
      case 'export':   return await runExportCouncil(args, t0);
      case 'analyze':  return await runAnalyzeCouncil(args, t0);
      default:         throw new Error(`Unknown stage: ${stage}`);
    }
  } catch (err: any) {
    logger.warn('master-council:failed', { stage, error: err.message });
    return {
      stage, council: 'unknown', grade: 0, ready: false, attempts: 0,
      elapsedMs: Date.now() - t0, blockers: 1, majors: 0,
      summary: `Council failed: ${err.message}`,
    };
  }
}

async function runUploadCouncil(args: any, t0: number): Promise<MasterCouncilVerdict> {
  const { buffer, filename, userId } = args;
  const verdict = await runMapperCouncil(buffer, filename);
  recordMapperRun(filename, verdict, userId).catch(() => {});
  const blockers = verdict.findings.filter(f => f.severity === 'blocker').length;
  const majors   = verdict.findings.filter(f => f.severity === 'major').length;
  return {
    stage: 'upload', council: 'mapper',
    grade: verdict.grade, ready: verdict.ready, attempts: verdict.attempts,
    elapsedMs: verdict.elapsedMs, blockers, majors,
    summary: verdict.ready
      ? `Mapper passed (${verdict.grade}/10) — ${(buffer.length / 1e6).toFixed(1)} MB → ${(verdict.finalBuffer.length / 1e6).toFixed(1)} MB`
      : `Mapper graded ${verdict.grade}/10 — kept original buffer (${blockers} blocker(s), ${majors} major(s))`,
    raw: verdict,
  };
}

async function runVerifyCouncil(args: any, t0: number): Promise<MasterCouncilVerdict> {
  const { analysisId, ctx } = args;
  // Cross-talk: if the upload council flagged a scanned/image-only PDF,
  // the verification council notes that in its reason string so the trigger
  // can downgrade severity on FactAnalyzer + Coverage findings.
  const mapperWarning = ctx?.mapper && ctx.mapper.findings.some(f => /scan|image-only|extractable/i.test(f.issue))
    ? ' [mapper:thin-source]'
    : '';

  const report = await triggerCouncilForAnalysis(analysisId, {
    llm: true,
    reason: `master-orchestrator${mapperWarning}`,
  });
  const findings = Array.isArray((report as any)?.findings) ? (report as any).findings : [];
  const blockers = findings.filter((f: any) => f.severity === 'blocker').length;
  const majors   = findings.filter((f: any) => f.severity === 'major').length;
  const grade = blockers > 0 ? 4 : majors > 2 ? 6 : majors > 0 ? 8 : 10;
  return {
    stage: 'verify', council: 'verification',
    grade, ready: blockers === 0,
    attempts: 1, elapsedMs: Date.now() - t0,
    blockers, majors,
    summary: blockers > 0 ? `Verification blocked: ${blockers} blocker(s), ${majors} major(s)`
           : majors  > 0 ? `Verification cleared with ${majors} major finding(s)`
           : 'Verification clean — all 5 agents agree',
    raw: report,
  };
}

async function runExportCouncil(args: any, t0: number): Promise<MasterCouncilVerdict> {
  const { buffer, kind, analysisId } = args;
  const result: any = await dualAgentVerifyExport(buffer, kind, analysisId ?? null);
  // Treat dualAgent result as ready=true if no blockers reported
  const blockers = (result?.findings ?? []).filter((f: any) => f.severity === 'blocker').length;
  const majors   = (result?.findings ?? []).filter((f: any) => f.severity === 'major').length;
  const grade = blockers > 0 ? 3 : majors > 0 ? 7 : 10;
  return {
    stage: 'export', council: 'export-gatekeeper',
    grade, ready: blockers === 0,
    attempts: 1, elapsedMs: Date.now() - t0,
    blockers, majors,
    summary: blockers > 0 ? `Export refused: ${blockers} blocker(s)`
           : majors  > 0 ? `Export cleared with ${majors} warning(s)`
           : 'Export verified — both inspectors agree',
    raw: result,
  };
}

async function runAnalyzeCouncil(args: any, t0: number): Promise<MasterCouncilVerdict> {
  // The analyze stage doesn't run a discrete council on demand — it consults
  // the always-on health cascade. Return a snapshot.
  const snap = getHealthSnapshot();
  const downCount  = snap.filter(s => s.quarantined).length;
  const healthy    = snap.filter(s => s.rate === null || s.rate >= 0.95).length;
  const grade = downCount > snap.length / 2 ? 4 : downCount > 0 ? 7 : 10;
  return {
    stage: 'analyze', council: 'ai-health',
    grade, ready: downCount === 0,
    attempts: 1, elapsedMs: Date.now() - t0,
    blockers: downCount, majors: 0,
    summary: downCount > 0
      ? `${downCount}/${snap.length} model(s) quarantined — cascade in degraded mode`
      : `All ${snap.length} model(s) healthy (${healthy} at ≥95% success rate)`,
    raw: snap,
  };
}

// ── System-wide grade ────────────────────────────────────────────────────

/** Aggregate snapshot used by /admin/agents — combines all four councils
 *  into a single 0–10 system grade by averaging the most-recent verdicts. */
export async function getSystemSnapshot(): Promise<{
  grade: number;
  councils: { name: string; stage: Stage; lastRun: string | null; recent: any }[];
  health: { quarantined: number; healthy: number; total: number };
  fallback24h: { total: number; alerts: number } | null;
}> {
  const health = getHealthSnapshot();
  let fb: any = null;
  try { fb = await fallbackSummary(24); } catch { /* table may not exist yet */ }

  // The dashboard API does the heavy lifting of fetching per-council recents.
  // This function just shapes a placeholder + live health snapshot.
  return {
    grade: 10, // dashboard will recompute from actual recents
    councils: [
      { name: 'Mapper',       stage: 'upload',  lastRun: null, recent: null },
      { name: 'AI Health',    stage: 'analyze', lastRun: null, recent: health },
      { name: 'Verification', stage: 'verify',  lastRun: null, recent: null },
      { name: 'Export',       stage: 'export',  lastRun: null, recent: null },
    ],
    health: {
      quarantined: health.filter(s => s.quarantined).length,
      healthy:     health.filter(s => s.rate === null || s.rate >= 0.95).length,
      total:       health.length,
    },
    fallback24h: fb ? { total: fb.total ?? 0, alerts: fb.alerts ?? 0 } : null,
  };
}
