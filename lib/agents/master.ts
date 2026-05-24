/**
 * lib/agents/master.ts
 *
 * Thin façade over lib/agents/registry.ts — gives every council a single
 * calling convention without itself knowing how many councils exist.
 *
 *   await runCouncilForStage('upload',  { buffer, filename })   → Mapper
 *   await runCouncilForStage('analyze', { ... })                → AI Health
 *   await runCouncilForStage('verify',  { analysisId })         → Verification
 *   await runCouncilForStage('export',  { buffer, kind, analysisId }) → Gatekeeper
 *
 * To add a new council: drop a file in lib/agents/councils/ that calls
 * registerCouncil({...}) and import it from lib/agents/councils/index.ts.
 * This module needs no changes.
 */

import './councils';   // side effect: registers every council
import { getCouncilForStage, getCouncils } from './registry';
import type { MasterCouncilVerdict, Stage } from './registry';
import { logger } from '@/lib/logger';

export type { MasterCouncilVerdict, Stage } from './registry';

export async function runCouncilForStage(
  stage: Stage,
  args:  any,
): Promise<MasterCouncilVerdict> {
  const t0 = Date.now();
  const council = getCouncilForStage(stage);

  if (!council) {
    logger.warn('master-council:unknown_stage', { stage });
    return {
      stage, council: 'unknown', grade: 0, ready: false, attempts: 0,
      elapsedMs: Date.now() - t0, blockers: 1, majors: 0,
      summary: `No council registered for stage "${stage}"`,
    };
  }

  if (!council.run) {
    // Always-on monitor (e.g. AI Health) — return a snapshot-based verdict.
    const snap = await council.getSnapshot();
    const grade = council.computeGrade ? council.computeGrade(snap) : 10;
    return {
      stage, council: council.id, grade,
      ready: grade >= 8, attempts: 1, elapsedMs: Date.now() - t0,
      blockers: 0, majors: 0,
      summary: `${council.name} is a passive monitor — current grade ${grade}/10`,
      raw: snap,
    };
  }

  try {
    return await council.run(args);
  } catch (err: any) {
    logger.warn('master-council:failed', { stage, council: council.id, error: err.message });
    return {
      stage, council: council.id, grade: 0, ready: false, attempts: 0,
      elapsedMs: Date.now() - t0, blockers: 1, majors: 0,
      summary: `${council.name} crashed: ${err.message}`,
    };
  }
}

/** Convenience: snapshot every council in one call. Used by the dashboard
 *  to render all council cards without N round-trips. */
export async function snapshotAllCouncils(): Promise<Array<{
  descriptor: ReturnType<typeof getCouncils>[number];
  snapshot:   Awaited<ReturnType<ReturnType<typeof getCouncils>[number]['getSnapshot']>>;
  grade:      number | null;
}>> {
  const councils = getCouncils();
  return Promise.all(councils.map(async d => {
    const snap = await d.getSnapshot().catch(() => ({ lifetime: { error: 'snapshot failed' }, recent: [] }));
    const grade = d.computeGrade ? d.computeGrade(snap) : null;
    return { descriptor: d, snapshot: snap, grade };
  }));
}
