/**
 * lib/mapper/orchestrator.ts
 *
 * The Data Mapper Council. Routes based on file size:
 *
 *   ≥ 10 MB → compress-and-verify loop
 *       1. Compressor agent reduces file size
 *       2. Mapper-QA agent verifies text + structure preserved
 *       3. Grade = f(compression ratio, text match, structure)
 *       4. If grade < 10/10 → identify fix (3s budget) → retry up to 3 times
 *       5. If still < 10 after 3 attempts → ship best attempt with findings
 *
 *   < 10 MB → senior-audit (single thorough pass with one rerun-on-fail)
 *       Same return shape so the caller doesn't branch.
 *
 * Returns a MapperVerdict with the final buffer + grade + agent findings.
 * The caller (upload pipeline) replaces the in-DB file with verdict.finalBuffer
 * when ready=true.
 */

import { compress } from './compressor';
import { runQa } from './mapper-qa';
import { runSeniorAudit } from './senior-audit';
import type { MapperVerdict, MapperFinding } from './types';

const TEN_MB = 10 * 1024 * 1024;
const MAX_COMPRESS_ATTEMPTS = 3;

/** Grade the council's work on a 0–10 scale.
 *
 *   Base = 7.0 (file is at least usable)
 *   +1 for each: text match >= 99.5%, structure preserved, ratio < 0.7 (saved 30%+)
 *   −2 if QA failed
 *   −3 if structure broken
 *   Capped to [0, 10]
 */
function gradeRun(qa: ReturnType<typeof runQa> extends Promise<infer R> ? R : never, compRatio: number): number {
  let g = 7;
  if (qa.textMatchPct >= 99.5) g += 1;
  if (qa.structurePreserved) g += 1;
  if (compRatio < 0.7) g += 1;     // saved 30%+
  if (!qa.ok) g -= 2;
  if (!qa.structurePreserved) g -= 3;
  return Math.max(0, Math.min(10, g));
}

export async function runMapperCouncil(buffer: Buffer, filename: string): Promise<MapperVerdict> {
  const t0 = Date.now();
  const allFindings: MapperFinding[] = [];

  // ── Route 1 — small file → senior audit only ─────────────────
  if (buffer.length < TEN_MB) {
    const senior = await runSeniorAudit(buffer, filename);
    allFindings.push(...senior.findings);
    const grade = senior.ok ? 10 : senior.findings.some(f => f.severity === 'blocker') ? 4 : 8;
    return {
      grade,
      ready: senior.ok,
      attempts: senior.reranOnce ? 2 : 1,
      finalBuffer: buffer,        // small file unchanged
      senior,
      findings: allFindings,
      elapsedMs: Date.now() - t0,
    };
  }

  // ── Route 2 — large file → compress + verify loop ────────────
  let bestBuf = buffer;
  let bestRatio = 1;
  let bestQa: any = null;
  let bestCompressor: any = null;
  let bestGrade = 0;
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_COMPRESS_ATTEMPTS; attempt++) {
    attempts = attempt;
    // Compressor pass (same input on every attempt for now — could vary
    // strategies between attempts in future)
    const compRes = await compress(buffer, filename);
    const qa = await runQa(buffer, compRes, filename);
    const grade = gradeRun(qa, compRes.ratio);

    // If this attempt is better than what we've seen → save it
    if (grade > bestGrade || (grade === bestGrade && compRes.compressedSize < bestBuf.length)) {
      bestBuf = qa.ok ? compRes.buffer : buffer; // never ship a failing-QA buffer
      bestRatio = compRes.ratio;
      bestQa = qa;
      bestCompressor = compRes;
      bestGrade = grade;
    }

    // Council talking step: if grade < 10, the Mapper-QA findings inform
    // what the Compressor should do differently next round. Currently the
    // compressor has only one strategy chain so the next attempt is
    // unlikely to change much — log + break if no improvement is possible.
    if (grade >= 10) break;

    if (attempt < MAX_COMPRESS_ATTEMPTS) {
      // 3s "think time" budget per spec — used here to let any IO settle
      await new Promise(r => setTimeout(r, 50)); // 50ms is enough; the 3s budget is the SLA, not a sleep
      // Future: pick a different compression strategy based on qa.findings
    }
  }

  if (bestQa) allFindings.push(...bestQa.findings);

  return {
    grade: bestGrade,
    ready: bestGrade >= 10,
    attempts,
    finalBuffer: bestBuf,
    compressor: bestCompressor,
    qa: bestQa,
    findings: allFindings,
    elapsedMs: Date.now() - t0,
  };
}
