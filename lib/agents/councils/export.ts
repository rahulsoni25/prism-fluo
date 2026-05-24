import { dualAgentVerifyExport } from '@/lib/exports/dual-agent-export';
import { registerCouncil } from '../registry';
import type { MasterCouncilVerdict } from '../registry';

registerCouncil({
  id: 'export',
  name: 'Export Gatekeeper',
  emoji: '📤',
  stage: 'export',
  agentNames: ['PDF-Inspector', 'Excel-Inspector'],
  description: 'Inspects PDF/Excel byte streams before download. Future: refuses to ship if Verification graded <7/10.',
  link: null, // no own dashboard yet

  async run(args: { buffer: Buffer; kind: 'pdf' | 'xlsx'; analysisId: string | null }): Promise<MasterCouncilVerdict> {
    const t0 = Date.now();
    const result: any = await dualAgentVerifyExport(args.buffer, args.kind, args.analysisId ?? null);
    const blockers = (result?.findings ?? []).filter((f: any) => f.severity === 'blocker').length;
    const majors   = (result?.findings ?? []).filter((f: any) => f.severity === 'major').length;
    const grade = blockers > 0 ? 3 : majors > 0 ? 7 : 10;
    return {
      stage: 'export', council: 'export',
      grade, ready: blockers === 0,
      attempts: 1, elapsedMs: Date.now() - t0,
      blockers, majors,
      summary: blockers > 0 ? `Export refused: ${blockers} blocker(s)`
             : majors  > 0 ? `Export cleared with ${majors} warning(s)`
             : 'Export verified — both inspectors agree',
      raw: result,
    };
  },

  async getSnapshot() {
    // No own persistence layer yet — surface a placeholder.
    return {
      lifetime: { note: 'Logs-only — no persistence yet' },
      recent: [],
    };
  },
  // No computeGrade — skipped from system avg until it has data.
});
