/**
 * GET /api/briefs/[id]/files
 *
 * Returns every upload attached to this brief — used by the insights
 * page to show "Source Files" alongside the cards. Owner-checked: 404
 * if the brief belongs to someone else.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    // Owner-check the brief in the same query so we never reveal someone
    // else's brief id by behaviour difference.
    const owner = await db.query(
      'SELECT 1 FROM briefs WHERE id = $1 AND user_id = $2',
      [id, session.userId],
    );
    if (owner.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { rows } = await db.query(
      `SELECT u.id, u.filename, u.created_at,
              -- distinct sheet count per upload, NULL-safe
              COALESCE((
                SELECT COUNT(DISTINCT sheet_name)::int
                  FROM gwi_time_spent g
                 WHERE g.upload_id = u.id
              ), 0)
              + COALESCE((
                SELECT COUNT(DISTINCT sheet_name)::int
                  FROM keywords k
                 WHERE k.upload_id = u.id
              ), 0)
              + COALESCE((
                SELECT COUNT(DISTINCT sheet_name)::int
                  FROM tool_data t
                 WHERE t.upload_id = u.id
              ), 0) AS sheet_count
         FROM uploads u
        WHERE u.brief_id = $1
        ORDER BY u.created_at DESC`,
      [id],
    );

    return NextResponse.json(rows);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
