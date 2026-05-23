/**
 * lib/exports/dual-agent-export.ts
 *
 * Format-agnostic dual-agent verifier for Excel + PDF exports.
 *
 * Same pattern as lib/presentations/dual-agent-verify.ts:
 *   Agent A — Format inspector (Excel or PDF — both expose ok/issues/sev)
 *   Agent B — Content council (cached report from analysis_verifications)
 *   Orchestrator — runs both in parallel, applies verdict policy
 *
 * Verdict actions match the PPT pipeline (allow / block / auto-recover /
 * ask) so the safe-download client helper can be the same for all formats.
 */

import { db } from '@/lib/db/client';
import { inspectExcel, type ExcelReport } from './excel-inspector';
import { inspectPdf, type PdfReport } from './pdf-inspector';
import type { VerificationReport } from '@/lib/ai/verify/types';

export type ExportFormat = 'xlsx' | 'pdf';
export type VerdictAction = 'allow' | 'block' | 'auto-recover' | 'ask';

export interface ExportVerdict {
  ready:      boolean;
  format:     ExportFormat;
  action:     VerdictAction;
  confidence: number;
  reasoning:  string;
  /** Either an ExcelReport or PdfReport — type-narrow by `format`. */
  inspector:  ExcelReport | PdfReport;
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
    return rows[0]?.report ?? null;
  } catch { return null; }
}

async function fetchSourceCards(analysisId: string | null): Promise<Array<{ title: string; conviction?: number }>> {
  if (!analysisId) return [];
  try {
    const { rows } = await db.query('SELECT results_json FROM analyses WHERE id = $1', [analysisId]);
    const charts = rows[0]?.results_json?.charts ?? [];
    return charts.map((c: any) => ({ title: String(c.title || ''), conviction: Number(c.conviction) || 0 }));
  } catch { return []; }
}

function decide(inspector: ExcelReport | PdfReport, content: VerificationReport | null) {
  const inspectorBlockers = inspector.issues.filter(i => i.severity === 'blocker');
  const inspectorMajors   = inspector.issues.filter(i => i.severity === 'major');
  const contentBlockers   = content?.summary?.bySeverity?.blocker ?? 0;
  const contentMajors     = content?.summary?.bySeverity?.major   ?? 0;
  const totalBlockers     = inspectorBlockers.length + contentBlockers;
  const totalMajors       = inspectorMajors.length + contentMajors;
  const recoverableInspectorBlockers =
    inspectorBlockers.length > 0 && inspectorBlockers.every(b => b.recoverable === true);

  if (totalBlockers === 0 && totalMajors === 0)
    return { action: 'allow' as VerdictAction, confidence: 98, reasoning: 'Both agents report fully clean.' };
  if (totalBlockers === 0 && totalMajors <= 5)
    return { action: 'allow' as VerdictAction, confidence: 88, reasoning: `Clean of blockers; ${totalMajors} minor warning(s).` };

  if (contentBlockers === 0 && recoverableInspectorBlockers && inspectorBlockers.length <= 5)
    return { action: 'auto-recover' as VerdictAction, confidence: 75,
      reasoning: `${inspectorBlockers.length} blocker(s) detected — all recoverable. Attempting regenerate.` };

  if (contentBlockers > 0)
    return { action: 'block' as VerdictAction, confidence: 95,
      reasoning: `Content council found ${contentBlockers} confirmed blocker(s) in the source analysis.` };
  if (inspectorBlockers.length > 0)
    return { action: 'block' as VerdictAction, confidence: 90,
      reasoning: `Inspector found ${inspectorBlockers.length} blocker(s) that auto-recovery can't fix.` };

  return { action: 'ask' as VerdictAction, confidence: 60,
    reasoning: `${totalMajors} major warning(s) detected — reviewer attention recommended.` };
}

export async function dualAgentVerifyExport(
  buffer: Buffer,
  format: ExportFormat,
  analysisId: string | null,
  opts: { minPages?: number } = {},
): Promise<ExportVerdict> {
  const t0 = Date.now();
  const [content, sourceCards] = await Promise.all([
    fetchContentReport(analysisId),
    fetchSourceCards(analysisId),
  ]);
  const inspector = format === 'xlsx'
    ? await inspectExcel(buffer, { sourceCards })
    : await inspectPdf(buffer,   { sourceCards, minPages: opts.minPages });

  const decision = decide(inspector, content);

  let contentNote: string | undefined;
  if (!content && analysisId) contentNote = 'Content council has not run for this analysis yet.';
  if (!analysisId)            contentNote = 'No analysis linked to this export.';

  const inspectorBlockers = inspector.issues.filter(i => i.severity === 'blocker').length;
  const inspectorMajors   = inspector.issues.filter(i => i.severity === 'major').length;
  const contentBlockers   = content?.summary?.bySeverity?.blocker ?? 0;
  const contentMajors     = content?.summary?.bySeverity?.major ?? 0;
  const recoverableBlockers = inspector.issues.filter(i => i.severity === 'blocker' && i.recoverable === true).length;

  return {
    ready: decision.action === 'allow',
    format, action: decision.action, confidence: decision.confidence, reasoning: decision.reasoning,
    inspector, content, contentNote,
    combinedBlockers: inspectorBlockers + contentBlockers,
    combinedMajors:   inspectorMajors + contentMajors,
    recoverableBlockers,
    elapsedMs: Date.now() - t0,
  };
}
