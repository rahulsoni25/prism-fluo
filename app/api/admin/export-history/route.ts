/**
 * GET /api/admin/export-history
 *
 * Aggregated activity for the Export Gatekeeper council. Admin-only.
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
    const list = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return list.includes((u.email ?? '').toLowerCase());
  } catch { return false; }
}

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const totals = await db.query(
    `SELECT
       COUNT(*)::int AS runs,
       COUNT(*) FILTER (WHERE action = 'allow')::int AS allowed,
       COUNT(*) FILTER (WHERE action = 'ask')::int   AS ask,
       COUNT(*) FILTER (WHERE action = 'block')::int AS blocked,
       COALESCE(AVG(confidence)::numeric(4,1), 0)    AS avg_confidence,
       COALESCE(SUM(bytes), 0)::bigint               AS total_bytes
     FROM export_runs`,
  ).catch(() => ({ rows: [{ runs: 0, allowed: 0, ask: 0, blocked: 0, avg_confidence: 0, total_bytes: 0 }] }));

  const byFormat = await db.query(
    `SELECT format, COUNT(*)::int AS n, COALESCE(AVG(confidence)::numeric(4,1), 0) AS avg_conf
       FROM export_runs GROUP BY format ORDER BY n DESC`,
  ).catch(() => ({ rows: [] as any[] }));

  const recent = await db.query(
    `SELECT id, analysis_id, format, action, confidence, bytes,
            inspector_blockers, inspector_majors, content_blockers, content_majors,
            reasoning, elapsed_ms, created_at
       FROM export_runs ORDER BY created_at DESC LIMIT 50`,
  ).catch(() => ({ rows: [] as any[] }));

  const trend = await db.query(
    `SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
            COALESCE(r.runs, 0)::int    AS runs,
            COALESCE(r.blocked, 0)::int AS blocked
       FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day') AS d
       LEFT JOIN (
         SELECT date_trunc('day', created_at)::date AS day,
                COUNT(*) AS runs,
                COUNT(*) FILTER (WHERE action = 'block') AS blocked
           FROM export_runs WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
           GROUP BY 1
       ) r ON r.day = d::date
       ORDER BY d`,
  ).catch(() => ({ rows: [] as any[] }));

  return NextResponse.json({
    totals: {
      runs:        totals.rows[0].runs,
      allowed:     totals.rows[0].allowed,
      ask:         totals.rows[0].ask,
      blocked:     totals.rows[0].blocked,
      avgConfidence: Number(totals.rows[0].avg_confidence),
      totalBytes:  Number(totals.rows[0].total_bytes),
    },
    byFormat: byFormat.rows.map((r: any) => ({ format: r.format, runs: r.n, avgConfidence: Number(r.avg_conf) })),
    recentRuns: recent.rows.map((r: any) => ({
      id: r.id, analysisId: r.analysis_id, format: r.format,
      action: r.action, confidence: r.confidence,
      bytes: Number(r.bytes),
      inspectorBlockers: r.inspector_blockers, inspectorMajors: r.inspector_majors,
      contentBlockers: r.content_blockers, contentMajors: r.content_majors,
      reasoning: r.reasoning,
      elapsedMs: r.elapsed_ms,
      createdAt: r.created_at,
    })),
    trend30d: trend.rows.map((r: any) => ({ day: r.day, runs: r.runs, blocked: r.blocked })),
  });
}
