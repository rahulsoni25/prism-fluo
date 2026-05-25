import { db } from '@/lib/db/client';
import { triggerCouncilForAnalysis } from '@/lib/ai/verify/trigger';
import { registerCouncil } from '../registry';
import type { MasterCouncilVerdict } from '../registry';

registerCouncil({
  id: 'verification',
  name: 'Verification',
  emoji: '🔍',
  stage: 'verify',
  agentNames: ['ProofReader', 'StatChecker', 'FactAnalyzer', 'MathIntegrity', 'Coverage', 'BrandIsolation', 'InsightQuality'],
  description: '7 agents check facts, math, stats, prose, coverage, brand-isolation, AND insight quality (catches generic cards / no-datapoint observations / inactionable recs before they ship). Reads upstream Mapper verdict to weight findings.',
  link: '/admin/verification-history',
  autoRecover: { retry: true, fallback: true },

  async run(args: { analysisId: string }): Promise<MasterCouncilVerdict> {
    const t0 = Date.now();
    const report = await triggerCouncilForAnalysis(args.analysisId, {
      llm: true, reason: 'master-orchestrator',
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
  },

  async getSnapshot() {
    const lifetime = await db.query(
      `SELECT COUNT(*)::int AS runs FROM analysis_verifications`,
    ).catch(() => ({ rows: [{ runs: 0 }] }));

    const recent = await db.query(
      `SELECT av.analysis_id, av.generated_at, av.mode, av.report, b.brand
         FROM analysis_verifications av
         LEFT JOIN analyses a ON a.id = av.analysis_id
         LEFT JOIN briefs   b ON b.id = a.brief_id
        ORDER BY av.generated_at DESC LIMIT 5`,
    ).catch(() => ({ rows: [] as any[] }));

    const totals = await db.query(
      `SELECT report FROM analysis_verifications ORDER BY generated_at DESC LIMIT 20`,
    ).catch(() => ({ rows: [] as any[] }));
    let blockers = 0, majors = 0;
    for (const r of totals.rows) {
      const findings = Array.isArray(r.report?.findings) ? r.report.findings : [];
      blockers += findings.filter((f: any) => f.severity === 'blocker').length;
      majors   += findings.filter((f: any) => f.severity === 'major').length;
    }

    return {
      lifetime: { runs: lifetime.rows[0].runs, blockers, majors },
      recent: recent.rows.map((r: any) => {
        const findings = Array.isArray(r.report?.findings) ? r.report.findings : [];
        return {
          brand: r.brand, mode: r.mode,
          blockers: findings.filter((f: any) => f.severity === 'blocker').length,
          majors:   findings.filter((f: any) => f.severity === 'major').length,
          at: r.generated_at,
        };
      }),
    };
  },

  computeGrade(snap) {
    if (snap.lifetime.runs === 0) return 10;
    if (snap.lifetime.blockers > 0) return 5;
    if (snap.lifetime.majors > 2)   return 7;
    return 9;
  },
});
