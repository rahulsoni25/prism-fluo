import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { cache } from '@/lib/cache';
import { getSession } from '@/lib/auth/server';

const VALID_STATUSES = ['draft', 'waiting_for_data', 'processing', 'ready'];

export async function GET(_req, { params }) {
  const { id } = await params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    // Owner check + 404 are indistinguishable on purpose — never reveal
    // whether a brief id exists for someone else.
    const { rows } = await db.query(
      'SELECT * FROM briefs WHERE id = $1 AND user_id = $2',
      [id, session.userId],
    );
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/briefs/[id]
 * - Allows updating: status, analysis_id, brand, category, objective, etc.
 * - When status flips to 'ready', actual_completed_at is auto-set so we can
 *   show "Planned vs Actual" SLA on the insights page.
 */
export async function PATCH(req, { params }) {
  const { id } = await params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const body = await req.json();
    const allowed = [
      'status', 'analysis_id',
      'brand', 'category', 'objective',
      'age_ranges', 'gender', 'sec', 'market', 'geography',
      'competitors', 'background', 'insight_buckets',
    ];
    const fields = Object.keys(body).filter(k => allowed.includes(k));
    if (fields.length === 0) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: `status must be one of ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    const sets = fields.map((f, i) => `${f} = $${i + 1}`);
    const vals = fields.map(f => body[f]);

    // Auto-stamp completion time the first time we move to 'ready'
    if (body.status === 'ready') {
      sets.push('actual_completed_at = COALESCE(actual_completed_at, NOW())');
    }

    const sql = `UPDATE briefs SET ${sets.join(', ')}
                  WHERE id = $${fields.length + 1}
                    AND user_id = $${fields.length + 2}
                  RETURNING *`;
    const { rows } = await db.query(sql, [...vals, id, session.userId]);
    if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    cache.del(`dashboard:overview:${session.userId}`);
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
