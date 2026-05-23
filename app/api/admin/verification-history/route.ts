/**
 * GET /api/admin/verification-history
 *
 * Aggregates everything the 5-agent verification council has caught and
 * returns:
 *   • totals          — number of analyses verified, total findings
 *   • byAgent         — count of confirmed findings per agent
 *   • bySeverity      — count by blocker/major/minor
 *   • bySection       — coverage-agent findings grouped by blueprint section
 *   • recentRuns      — last 50 verifications with brand + timestamp +
 *                       issue count + verdict shape
 *   • trend30d        — daily issue count for the last 30 days
 *
 * Drives the /admin/verification-history page. Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

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

  try {
    // Recent runs joined with brief context
    const { rows: runs } = await db.query(
      `SELECT
         av.analysis_id,
         av.generated_at,
         av.mode,
         av.report,
         b.brand   AS brand,
         b.category AS category,
         a.sheet_name
       FROM analysis_verifications av
       LEFT JOIN analyses a ON a.id = av.analysis_id
       LEFT JOIN briefs   b ON b.id = a.brief_id
       ORDER BY av.generated_at DESC
       LIMIT 50`,
    ).catch(() => ({ rows: [] as any[] }));

    // Stats per analysis based on the stored report
    let totalAnalyses = 0;
    let totalFindings = 0;
    let totalBlockers = 0;
    let totalMajors   = 0;
    let totalMinors   = 0;
    const byAgent: Record<string, number> = {
      proofreader: 0, 'stat-checker': 0, 'fact-analyzer': 0,
      'math-integrity': 0, coverage: 0,
    };
    const bySection: Record<string, number> = {};
    const recentRuns: any[] = [];

    for (const r of runs) {
      totalAnalyses++;
      const summary = r.report?.summary;
      const cards   = r.report?.cards || [];
      let runFindings = 0, runBlockers = 0, runMajors = 0, runMinors = 0;
      for (const c of cards) {
        for (const f of (c.findings || [])) {
          if (f.verdict !== 'confirmed') continue;
          runFindings++;
          if (f.severity === 'blocker') runBlockers++;
          else if (f.severity === 'major') runMajors++;
          else if (f.severity === 'minor') runMinors++;
          if (byAgent[f.agent] !== undefined) byAgent[f.agent]++;
          if (f.agent === 'coverage' && f.evidence) {
            // Coverage evidence is "<sectionId>" or "<sectionId>.<metric>"
            const sec = String(f.evidence).split('.')[0];
            bySection[sec] = (bySection[sec] || 0) + 1;
          }
        }
      }
      totalFindings += runFindings;
      totalBlockers += runBlockers;
      totalMajors   += runMajors;
      totalMinors   += runMinors;

      recentRuns.push({
        analysisId:    r.analysis_id,
        brand:         r.brand || r.sheet_name || '(no brand)',
        category:      r.category,
        generatedAt:   r.generated_at,
        mode:          r.mode,
        totalCards:    summary?.totalCards ?? cards.length,
        cardsWithIssues: summary?.cardsWithIssues ?? cards.filter((c: any) => (c.findings || []).some((f: any) => f.verdict === 'confirmed')).length,
        findings:      runFindings,
        blockers:      runBlockers,
        majors:        runMajors,
        minors:        runMinors,
        verdict:       runBlockers > 0 ? 'block' : runMajors > 0 ? 'review' : 'clean',
      });
    }

    // 30-day trend — daily finding count
    const trend30d: { day: string; findings: number; runs: number }[] = [];
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = 29; i >= 0; i--) {
      const dayStart = new Date(now - i * dayMs);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + dayMs);
      const inDay = recentRuns.filter(r => {
        const t = new Date(r.generatedAt).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      });
      trend30d.push({
        day: dayStart.toISOString().slice(0, 10),
        findings: inDay.reduce((n, r) => n + r.findings, 0),
        runs: inDay.length,
      });
    }

    return NextResponse.json({
      totals: {
        analyses:  totalAnalyses,
        findings:  totalFindings,
        blockers:  totalBlockers,
        majors:    totalMajors,
        minors:    totalMinors,
      },
      byAgent,
      bySeverity: { blocker: totalBlockers, major: totalMajors, minor: totalMinors },
      bySection,
      recentRuns,
      trend30d,
    });
  } catch (err: any) {
    if (/relation .* does not exist/i.test(err.message)) {
      return NextResponse.json({
        totals: { analyses: 0, findings: 0, blockers: 0, majors: 0, minors: 0 },
        byAgent: {}, bySeverity: {}, bySection: {}, recentRuns: [], trend30d: [],
        note: 'No verification runs yet — verify an analysis to start populating history.',
      });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
