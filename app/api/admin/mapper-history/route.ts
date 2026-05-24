/**
 * GET /api/admin/mapper-history
 *
 * Returns aggregated activity for the Data Mapper Council:
 *   • totals       — runs, bytes saved, avg grade
 *   • byKind       — runs grouped by file kind (pdf/pptx/xlsx/csv/image)
 *   • byVerdict    — counts for ready/swapped/kept-original/blocked
 *   • recentRuns   — last 50 runs with size deltas + grade + findings
 *   • trend30d     — daily run + bytes-saved counts for last 30 days
 *
 * Admin-only.
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
    const { rows: recent } = await db.query(
      `SELECT id, filename, kind, original_bytes, final_bytes, grade, ready,
              attempts, elapsed_ms, blockers, majors, minors, strategies,
              created_at
         FROM mapper_runs
         ORDER BY created_at DESC
         LIMIT 50`,
    ).catch(() => ({ rows: [] as any[] }));

    const { rows: totals } = await db.query(
      `SELECT
         COUNT(*)::int                                    AS runs,
         COALESCE(SUM(original_bytes - final_bytes), 0)::bigint AS bytes_saved,
         COALESCE(AVG(grade)::numeric(4,2), 0)            AS avg_grade,
         COUNT(*) FILTER (WHERE ready = true)::int        AS ready_count,
         COUNT(*) FILTER (WHERE blockers > 0)::int        AS blocker_count,
         COUNT(*) FILTER (WHERE original_bytes <> final_bytes)::int AS compressed_count
       FROM mapper_runs`,
    ).catch(() => ({ rows: [{ runs: 0, bytes_saved: 0, avg_grade: 0, ready_count: 0, blocker_count: 0, compressed_count: 0 }] }));

    const { rows: kindRows } = await db.query(
      `SELECT kind, COUNT(*)::int AS n,
              COALESCE(SUM(original_bytes - final_bytes), 0)::bigint AS saved
         FROM mapper_runs
         GROUP BY kind
         ORDER BY n DESC`,
    ).catch(() => ({ rows: [] as any[] }));

    const { rows: trendRows } = await db.query(
      `SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
              COALESCE(r.runs, 0)::int       AS runs,
              COALESCE(r.saved, 0)::bigint   AS saved
         FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day') AS d
         LEFT JOIN (
           SELECT date_trunc('day', created_at)::date AS day,
                  COUNT(*) AS runs,
                  SUM(original_bytes - final_bytes) AS saved
             FROM mapper_runs
            WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
            GROUP BY 1
         ) r ON r.day = d::date
         ORDER BY d`,
    ).catch(() => ({ rows: [] as any[] }));

    return NextResponse.json({
      totals: {
        runs:            totals[0]?.runs ?? 0,
        bytesSaved:      Number(totals[0]?.bytes_saved ?? 0),
        avgGrade:        Number(totals[0]?.avg_grade ?? 0),
        readyCount:      totals[0]?.ready_count ?? 0,
        blockerCount:    totals[0]?.blocker_count ?? 0,
        compressedCount: totals[0]?.compressed_count ?? 0,
      },
      byKind: kindRows.map((r: any) => ({ kind: r.kind, runs: r.n, bytesSaved: Number(r.saved) })),
      recentRuns: recent.map((r: any) => ({
        id:           r.id,
        filename:     r.filename,
        kind:         r.kind,
        originalBytes: Number(r.original_bytes),
        finalBytes:    Number(r.final_bytes),
        grade:        r.grade,
        ready:        r.ready,
        attempts:     r.attempts,
        elapsedMs:    r.elapsed_ms,
        blockers:     r.blockers,
        majors:       r.majors,
        minors:       r.minors,
        strategies:   r.strategies ?? [],
        createdAt:    r.created_at,
      })),
      trend30d: trendRows.map((r: any) => ({ day: r.day, runs: r.runs, bytesSaved: Number(r.saved) })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal error', message: err.message }, { status: 500 });
  }
}
