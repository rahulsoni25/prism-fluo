/**
 * GET /api/admin/inbox
 *
 * The founder's "did anything happen?" feed. Single page that answers
 * questions like:
 *   - Did Schbang raise any briefs last week?
 *   - Who signed up but never created a brief?
 *   - Which accounts went quiet?
 *   - Which briefs got created but never analyzed?
 *
 * Returns 5 sections in one round-trip so the page can render fast:
 *   1. recentEvents  — unified timeline of signups, briefs, uploads,
 *                       analyses, share-link creates + views
 *   2. byAccount     — per-domain grouping with this-week counts
 *   3. quietAccounts — users with no activity 7+ days (churn watch)
 *   4. stuckBriefs   — briefs created but never analyzed (founder action)
 *   5. summary       — top-line numbers for the header
 *
 * Query params:
 *   ?days=7   (default 7, max 90)  — how far back to look
 *   ?q=email  (optional)            — search filter on user email/domain
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

async function isAdmin(userId: string): Promise<boolean> {
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

// ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await isAdmin(session.userId))) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const sp    = req.nextUrl.searchParams;
  const days  = Math.min(Math.max(Number(sp.get('days')) || 7, 1), 90);
  const q     = (sp.get('q') || '').trim().toLowerCase();
  const qLike = q ? `%${q}%` : null;

  // Tolerant select wrapper: any individual query failing should not kill
  // the whole page — show what we have, log the rest.
  async function tryQuery<T = any>(sql: string, params: any[]): Promise<T[]> {
    try {
      const { rows } = await db.query(sql, params);
      return rows as T[];
    } catch (err: any) {
      console.warn('[admin/inbox] query failed:', err.message?.slice(0, 200));
      return [];
    }
  }

  // 1. RECENT EVENTS — unified timeline across 5 tables, sorted newest-first.
  //    Each row is shaped { ts, kind, user_email, target_label, meta }.
  const events = await tryQuery(`
    WITH s AS (SELECT NOW() - ($1 || ' days')::interval AS since)
    SELECT * FROM (
      -- Signups
      SELECT
        u.created_at AS ts,
        'auth.signup'::text AS kind,
        u.email AS user_email,
        COALESCE(u.name, u.email) AS target_label,
        jsonb_build_object('provider', u.provider) AS meta
      FROM users u, s
      WHERE u.created_at >= s.since
        AND ($2::text IS NULL OR LOWER(u.email) LIKE $2)

      UNION ALL

      -- Briefs
      SELECT
        b.created_at AS ts,
        'brief.create'::text AS kind,
        u.email AS user_email,
        CONCAT(b.brand, COALESCE(' · ' || b.objective, '')) AS target_label,
        jsonb_build_object('brief_id', b.id, 'brand', b.brand, 'objective', b.objective) AS meta
      FROM briefs b
      LEFT JOIN users u ON u.id = b.user_id, s
      WHERE b.created_at >= s.since
        AND ($2::text IS NULL OR LOWER(COALESCE(u.email,'')) LIKE $2)

      UNION ALL

      -- Uploads
      SELECT
        up.created_at AS ts,
        'upload.create'::text AS kind,
        u.email AS user_email,
        up.filename AS target_label,
        jsonb_build_object('upload_id', up.id, 'brief_id', up.brief_id) AS meta
      FROM uploads up
      LEFT JOIN users u ON u.id = up.user_id, s
      WHERE up.created_at >= s.since
        AND ($2::text IS NULL OR LOWER(COALESCE(u.email,'')) LIKE $2)

      UNION ALL

      -- Analyses (the "did they actually use the product" signal)
      SELECT
        a.created_at AS ts,
        'analysis.run'::text AS kind,
        u.email AS user_email,
        CONCAT(COALESCE(b.brand, a.filename), COALESCE(' · ' || b.objective, '')) AS target_label,
        jsonb_build_object('analysis_id', a.id, 'brief_id', a.brief_id, 'filename', a.filename) AS meta
      FROM analyses a
      LEFT JOIN users u  ON u.id  = a.user_id
      LEFT JOIN briefs b ON b.id  = a.brief_id, s
      WHERE a.created_at >= s.since
        AND ($2::text IS NULL OR LOWER(COALESCE(u.email,'')) LIKE $2)
    ) tl
    ORDER BY ts DESC
    LIMIT 500
  `, [String(days), qLike]);

  // 2. BY ACCOUNT — group by email domain (rough proxy for agency).
  const byAccount = await tryQuery(`
    WITH s AS (SELECT NOW() - ($1 || ' days')::interval AS since)
    SELECT
      SPLIT_PART(LOWER(u.email), '@', 2)             AS domain,
      COUNT(DISTINCT u.id)                            AS user_count,
      COUNT(DISTINCT b.id)                            AS brief_count,
      COUNT(DISTINCT a.id)                            AS analysis_count,
      MAX(GREATEST(
        COALESCE(b.created_at, '1970-01-01'),
        COALESCE(a.created_at, '1970-01-01'),
        COALESCE(u.last_login, '1970-01-01')
      ))                                              AS last_activity
    FROM users u, s
    LEFT JOIN briefs   b ON b.user_id = u.id AND b.created_at >= s.since
    LEFT JOIN analyses a ON a.user_id = u.id AND a.created_at >= s.since
    WHERE ($2::text IS NULL OR LOWER(u.email) LIKE $2)
    GROUP BY domain
    HAVING COUNT(DISTINCT b.id) > 0 OR COUNT(DISTINCT a.id) > 0
    ORDER BY brief_count DESC, analysis_count DESC
    LIMIT 50
  `, [String(days), qLike]);

  // 3. QUIET ACCOUNTS — registered users who have not done anything in 7+
  //    days. "Did something" = created a brief, ran an analysis, or logged
  //    in. We compare against the most recent of those three signals.
  const quietAccounts = await tryQuery(`
    SELECT
      u.id, u.email, u.name, u.created_at,
      GREATEST(
        COALESCE(u.last_login,           '1970-01-01'::timestamptz),
        COALESCE((SELECT MAX(created_at) FROM briefs   WHERE user_id = u.id), '1970-01-01'::timestamptz),
        COALESCE((SELECT MAX(created_at) FROM analyses WHERE user_id = u.id), '1970-01-01'::timestamptz)
      ) AS last_activity
    FROM users u
    WHERE u.created_at < NOW() - INTERVAL '7 days'
      AND ($1::text IS NULL OR LOWER(u.email) LIKE $1)
    ORDER BY last_activity ASC NULLS FIRST
    LIMIT 25
  `, [qLike]);
  // Trim: only return ones whose last_activity is actually >7 days ago.
  const quietFiltered = (quietAccounts as any[]).filter(r => {
    const la = new Date(r.last_activity).getTime();
    return Date.now() - la > 7 * 24 * 60 * 60 * 1000;
  }).slice(0, 15);

  // 4. STUCK BRIEFS — created but never analyzed. These are the "founder
  //    needs to nudge" signals.
  const stuckBriefs = await tryQuery(`
    SELECT
      b.id, b.brand, b.objective, b.created_at,
      u.email AS user_email,
      (SELECT COUNT(*) FROM uploads up WHERE up.brief_id = b.id) AS upload_count
    FROM briefs b
    LEFT JOIN users u    ON u.id = b.user_id
    LEFT JOIN analyses a ON a.brief_id = b.id
    WHERE a.id IS NULL
      AND b.created_at >= NOW() - INTERVAL '30 days'
      AND ($1::text IS NULL OR LOWER(COALESCE(u.email,'')) LIKE $1)
    ORDER BY b.created_at DESC
    LIMIT 25
  `, [qLike]);

  // 5. SUMMARY — the header bar's top-line numbers.
  const summaryRows = await tryQuery(`
    WITH s AS (SELECT NOW() - ($1 || ' days')::interval AS since)
    SELECT
      (SELECT COUNT(*) FROM users    , s WHERE created_at >= s.since AND ($2::text IS NULL OR LOWER(email) LIKE $2))    AS new_signups,
      (SELECT COUNT(*) FROM briefs   , s WHERE created_at >= s.since)                                                    AS new_briefs,
      (SELECT COUNT(*) FROM analyses , s WHERE created_at >= s.since)                                                    AS new_analyses,
      (SELECT COUNT(*) FROM uploads  , s WHERE created_at >= s.since)                                                    AS new_uploads
  `, [String(days), qLike]);

  return NextResponse.json({
    windowDays: days,
    query:      q || null,
    summary:    summaryRows[0] ?? { new_signups: 0, new_briefs: 0, new_analyses: 0, new_uploads: 0 },
    recentEvents: events,
    byAccount,
    quietAccounts: quietFiltered,
    stuckBriefs,
    generatedAt: new Date().toISOString(),
  });
}
