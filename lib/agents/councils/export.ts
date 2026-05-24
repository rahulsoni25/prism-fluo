import { db } from '@/lib/db/client';
import { dualAgentVerifyExport } from '@/lib/exports/dual-agent-export';
import { registerCouncil } from '../registry';
import type { MasterCouncilVerdict } from '../registry';

registerCouncil({
  id: 'export',
  name: 'Export Gatekeeper',
  emoji: '📤',
  stage: 'export',
  agentNames: ['PDF-Inspector', 'Excel-Inspector'],
  description: 'Inspects PDF/Excel byte streams before download. Cross-talk: reads Verification council findings to weight decisions; logs every action to export_runs.',
  link: '/admin/export-history',
  autoRecover: { retry: true, fallback: true },

  async run(args: { buffer: Buffer; kind: 'pdf' | 'xlsx'; analysisId: string | null; userId?: string | null }): Promise<MasterCouncilVerdict> {
    const t0 = Date.now();
    const result: any = await dualAgentVerifyExport(args.buffer, args.kind, args.analysisId ?? null, { userId: args.userId });
    const blockers = (result?.combinedBlockers ?? 0);
    const majors   = (result?.combinedMajors   ?? 0);
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
    const totals = await db.query(
      `SELECT COUNT(*)::int AS runs,
              COUNT(*) FILTER (WHERE action = 'allow')::int AS allowed,
              COUNT(*) FILTER (WHERE action = 'block')::int AS blocked,
              COALESCE(AVG(confidence)::numeric(4,1), 0) AS avg_conf,
              COALESCE(SUM(bytes), 0)::bigint AS total_bytes
         FROM export_runs`,
    ).catch(() => ({ rows: [{ runs: 0, allowed: 0, blocked: 0, avg_conf: 0, total_bytes: 0 }] }));

    const recent = await db.query(
      `SELECT format, action, confidence, created_at
         FROM export_runs ORDER BY created_at DESC LIMIT 5`,
    ).catch(() => ({ rows: [] as any[] }));

    return {
      lifetime: {
        runs:          totals.rows[0].runs,
        allowed:       totals.rows[0].allowed,
        blocked:       totals.rows[0].blocked,
        avgConfidence: Number(totals.rows[0].avg_conf),
        totalBytes:    Number(totals.rows[0].total_bytes),
      },
      recent: recent.rows.map((r: any) => ({
        label: `${r.format.toUpperCase()} → ${r.action}`,
        grade: r.confidence != null ? Math.round(r.confidence / 10) : undefined,
        at: r.created_at,
      })),
    };
  },

  computeGrade(snap) {
    if (snap.lifetime.runs === 0) return 10;
    const blockRate = snap.lifetime.blocked / snap.lifetime.runs;
    if (blockRate > 0.3) return 4;       // many blocks = export pipeline producing bad files
    if (blockRate > 0.1) return 7;
    return 10;
  },
});
