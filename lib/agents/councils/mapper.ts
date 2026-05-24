import { db } from '@/lib/db/client';
import { runMapperCouncil } from '@/lib/mapper/orchestrator';
import { recordMapperRun }  from '@/lib/mapper/persistence';
import { registerCouncil } from '../registry';
import type { MasterCouncilVerdict } from '../registry';

registerCouncil({
  id: 'mapper',
  name: 'Mapper',
  emoji: '🗜',
  stage: 'upload',
  agentNames: ['Compressor', 'Mapper-QA', 'Senior-Audit', 'Client-Compressor', 'Client-QA'],
  description: 'Compress + verify file integrity. Runs in TWO places: client-side mini-council shrinks the file BEFORE upload (compressor + structural QA); server-side full council re-verifies after upload (compressor + text-match QA + senior audit).',
  link: '/admin/mapper-history',

  async run(args: { buffer: Buffer; filename: string; userId?: string | null }): Promise<MasterCouncilVerdict> {
    const t0 = Date.now();
    const verdict = await runMapperCouncil(args.buffer, args.filename);
    recordMapperRun(args.filename, verdict, args.userId).catch(() => {});
    const blockers = verdict.findings.filter(f => f.severity === 'blocker').length;
    const majors   = verdict.findings.filter(f => f.severity === 'major').length;
    return {
      stage: 'upload', council: 'mapper',
      grade: verdict.grade, ready: verdict.ready, attempts: verdict.attempts,
      elapsedMs: verdict.elapsedMs, blockers, majors,
      summary: verdict.ready
        ? `Mapper passed (${verdict.grade}/10) — ${(args.buffer.length / 1e6).toFixed(1)} MB → ${(verdict.finalBuffer.length / 1e6).toFixed(1)} MB`
        : `Mapper graded ${verdict.grade}/10 — kept original buffer (${blockers} blocker(s), ${majors} major(s))`,
      raw: verdict,
    };
  },

  async getSnapshot() {
    const lifetime = await db.query(
      `SELECT COUNT(*)::int AS runs,
              COALESCE(AVG(grade)::numeric(4,2), 0) AS avg_grade,
              COALESCE(SUM(original_bytes - final_bytes), 0)::bigint AS bytes_saved,
              COUNT(*) FILTER (WHERE blockers > 0)::int AS blocker_runs
         FROM mapper_runs`,
    ).catch(() => ({ rows: [{ runs: 0, avg_grade: 0, bytes_saved: 0, blocker_runs: 0 }] }));

    const recent = await db.query(
      `SELECT filename, kind, grade, ready, blockers, majors, created_at
         FROM mapper_runs ORDER BY created_at DESC LIMIT 5`,
    ).catch(() => ({ rows: [] as any[] }));

    return {
      lifetime: {
        runs:        lifetime.rows[0].runs,
        avgGrade:    Number(lifetime.rows[0].avg_grade),
        bytesSaved:  Number(lifetime.rows[0].bytes_saved),
        blockerRuns: lifetime.rows[0].blocker_runs,
      },
      recent: recent.rows.map((r: any) => ({
        filename: r.filename, grade: r.grade, ready: r.ready,
        blockers: r.blockers, majors: r.majors, at: r.created_at,
      })),
    };
  },

  computeGrade(snap) {
    return snap.lifetime.runs > 0 ? Number(snap.lifetime.avgGrade) : 10;
  },
});
