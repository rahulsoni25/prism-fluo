/**
 * GET /api/admin/agents-overview
 *
 * One-stop snapshot of every council in PRISM:
 *   • Mapper       — recent verdicts from mapper_runs
 *   • Verification — recent verdicts from analysis_verifications
 *   • AI Health    — live snapshot from in-memory health cascade
 *   • Export       — counts from fallback monitor (export gatekeeper logs)
 *
 * Plus a master 0–10 system grade that averages the four councils.
 *
 * Drives /admin/agents. Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { getHealthSnapshot } from '@/lib/ai/model-health';
import { fallbackSummary }   from '@/lib/ai/fallback-monitor';

export const dynamic = 'force-dynamic';

async function checkAdmin(userId: string): Promise<boolean> {
  try {
    const { rows } = await db.query('SELECT email, is_admin FROM users WHERE id = $1', [userId]);
    const u = rows[0];
    if (!u) return false;
    if (u.is_admin === true) return true;
    const list = (process.env.ADMIN_EMAILS ?? '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return list.includes((u.email ?? '').toLowerCase());
  } catch { return false; }
}

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  // ── Mapper (last 24h + lifetime totals) ────────────────────────
  const mapperLifetime = await db.query(
    `SELECT COUNT(*)::int AS runs,
            COALESCE(AVG(grade)::numeric(4,2), 0) AS avg_grade,
            COALESCE(SUM(original_bytes - final_bytes), 0)::bigint AS bytes_saved,
            COUNT(*) FILTER (WHERE blockers > 0)::int AS blocker_runs
       FROM mapper_runs`,
  ).catch(() => ({ rows: [{ runs: 0, avg_grade: 0, bytes_saved: 0, blocker_runs: 0 }] }));
  const mapperRecent = await db.query(
    `SELECT filename, kind, grade, ready, blockers, majors, created_at
       FROM mapper_runs ORDER BY created_at DESC LIMIT 5`,
  ).catch(() => ({ rows: [] as any[] }));

  // ── Verification (lifetime + recent) ───────────────────────────
  const verifLifetime = await db.query(
    `SELECT COUNT(*)::int AS runs
       FROM analysis_verifications`,
  ).catch(() => ({ rows: [{ runs: 0 }] }));
  const verifRecent = await db.query(
    `SELECT av.analysis_id, av.generated_at, av.mode, av.report, b.brand
       FROM analysis_verifications av
       LEFT JOIN analyses a ON a.id = av.analysis_id
       LEFT JOIN briefs   b ON b.id = a.brief_id
      ORDER BY av.generated_at DESC LIMIT 5`,
  ).catch(() => ({ rows: [] as any[] }));

  // Count blockers / majors across the most recent 20 verification reports
  const verifTotals = await db.query(
    `SELECT report FROM analysis_verifications ORDER BY generated_at DESC LIMIT 20`,
  ).catch(() => ({ rows: [] as any[] }));
  let verifBlockers = 0, verifMajors = 0;
  for (const r of verifTotals.rows) {
    const findings = Array.isArray(r.report?.findings) ? r.report.findings : [];
    verifBlockers += findings.filter((f: any) => f.severity === 'blocker').length;
    verifMajors   += findings.filter((f: any) => f.severity === 'major').length;
  }

  // ── AI Health (live in-memory snapshot) ─────────────────────────
  const health = getHealthSnapshot();
  const healthDown    = health.filter(s => s.quarantined).length;
  const healthHealthy = health.filter(s => s.rate === null || s.rate >= 0.95).length;

  // ── Fallback monitor (24h summary) ──────────────────────────────
  let fb24h: any = null;
  try { fb24h = await fallbackSummary(24); } catch { /* table may not exist */ }

  // ── Master system grade ─────────────────────────────────────────
  const grades: number[] = [];
  if (mapperLifetime.rows[0].runs > 0)  grades.push(Number(mapperLifetime.rows[0].avg_grade));
  if (verifLifetime.rows[0].runs > 0)  grades.push(verifBlockers > 0 ? 5 : verifMajors > 2 ? 7 : 9);
  grades.push(healthDown > 0 ? Math.max(0, 10 - healthDown * 3) : 10);
  if (fb24h) grades.push((fb24h.alerts ?? 0) > 0 ? 6 : 10);
  const systemGrade = grades.length ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10 : 10;

  return NextResponse.json({
    systemGrade,
    councils: [
      {
        name: 'Mapper', stage: 'upload', emoji: '🗜', agents: 3,
        agentNames: ['Compressor', 'Mapper-QA', 'Senior-Audit'],
        lifetime: {
          runs:       mapperLifetime.rows[0].runs,
          avgGrade:   Number(mapperLifetime.rows[0].avg_grade),
          bytesSaved: Number(mapperLifetime.rows[0].bytes_saved),
          blockerRuns: mapperLifetime.rows[0].blocker_runs,
        },
        recent: mapperRecent.rows.map((r: any) => ({
          filename: r.filename, kind: r.kind, grade: r.grade,
          ready: r.ready, blockers: r.blockers, majors: r.majors, at: r.created_at,
        })),
        link: '/admin/mapper-history',
      },
      {
        name: 'Verification', stage: 'verify', emoji: '🔍', agents: 5,
        agentNames: ['ProofReader', 'StatChecker', 'FactAnalyzer', 'MathIntegrity', 'Coverage'],
        lifetime: {
          runs:       verifLifetime.rows[0].runs,
          blockers:   verifBlockers,
          majors:     verifMajors,
        },
        recent: verifRecent.rows.map((r: any) => {
          const findings = Array.isArray(r.report?.findings) ? r.report.findings : [];
          return {
            brand: r.brand,
            mode: r.mode,
            blockers: findings.filter((f: any) => f.severity === 'blocker').length,
            majors:   findings.filter((f: any) => f.severity === 'major').length,
            at: r.generated_at,
          };
        }),
        link: '/admin/verification-history',
      },
      {
        name: 'AI Health', stage: 'analyze', emoji: '🩺', agents: 2,
        agentNames: ['Model-Health', 'Fallback-Monitor'],
        lifetime: {
          totalModels: health.length,
          healthy:     healthHealthy,
          quarantined: healthDown,
          alerts24h:   fb24h?.alerts ?? 0,
          fallback24h: fb24h?.total  ?? 0,
        },
        recent: health.slice(0, 5).map(s => ({
          model: s.model, rate: s.rate, quarantined: s.quarantined,
        })),
        link: '/admin/ai-health',
      },
      {
        name: 'Export Gatekeeper', stage: 'export', emoji: '📤', agents: 2,
        agentNames: ['PDF-Inspector', 'Excel-Inspector'],
        lifetime: {
          // Export gatekeeper doesn't have its own persisted table yet — surface
          // its activity via fallback monitor counts where applicable.
          note: 'Logs-only — no persistence yet',
        },
        recent: [],
        link: null,
      },
    ],
  });
}
