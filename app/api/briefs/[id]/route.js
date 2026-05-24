import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { cache } from '@/lib/cache';
import { getSession } from '@/lib/auth/server';
import { ensureCouncilHasRun } from '@/lib/ai/verify/trigger';

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

    // ── Pre-flight: snapshot the OLD brief so we can detect which
    //    analysis-affecting fields actually changed (vs metadata-only
    //    updates like status flips that don't invalidate insights). ──
    const oldRows = await db.query(
      'SELECT * FROM briefs WHERE id = $1 AND user_id = $2',
      [id, session.userId],
    );
    if (oldRows.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const oldBrief = oldRows.rows[0];

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

    // ── Cross-talk: detect analysis-staleness ──────────────────────
    // These brief fields are baked into the AI narrative + nuggets stored
    // on the analysis. If any change AND there's a linked analysis, mark
    // the analysis stale so the insights page can prompt regeneration.
    // (The MarketPyramid card recomputes client-side from brief.* and is
    //  always live — only the AI text is stale.)
    const ANALYSIS_AFFECTING = [
      'brand', 'category', 'objective',
      'age_ranges', 'gender', 'sec', 'market', 'geography',
      'competitors', 'insight_buckets',
    ];
    const changedAffecting = fields.filter(f =>
      ANALYSIS_AFFECTING.includes(f) && String(body[f] ?? '') !== String(oldBrief[f] ?? '')
    );
    if (changedAffecting.length > 0 && rows[0].analysis_id) {
      try {
        // Auto-migrate the column on first use — safe to repeat.
        await db.query(`ALTER TABLE analyses ADD COLUMN IF NOT EXISTS is_stale BOOLEAN DEFAULT false`);
        await db.query(`ALTER TABLE analyses ADD COLUMN IF NOT EXISTS stale_reason TEXT`);
        await db.query(
          `UPDATE analyses SET is_stale = true, stale_reason = $1 WHERE id = $2`,
          [`Brief edited: ${changedAffecting.join(', ')}`, rows[0].analysis_id],
        );
      } catch (err) {
        // Best-effort — never block the PATCH on staleness marking
        console.warn('[briefs:PATCH] stale-mark failed:', err.message);
      }
    }

    // If this PATCH flipped the brief to 'ready' AND a linked analysis
    // exists, ensure the 3-agent council has run against that analysis.
    if (rows[0].status === 'ready' && rows[0].analysis_id) {
      ensureCouncilHasRun(rows[0].analysis_id, 'briefs:PATCH→ready').catch(() => {});
    }

    return NextResponse.json({ ...rows[0], analysisStaleFields: changedAffecting });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/briefs/[id]
 * Permanently deletes the brief (and its linked analyses/uploads via CASCADE).
 * Only the owner can delete their own brief.
 */
export async function DELETE(_req, { params }) {
  const { id } = await params;
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

    const { rowCount } = await db.query(
      'DELETE FROM briefs WHERE id = $1 AND user_id = $2',
      [id, session.userId],
    );
    if (rowCount === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    cache.del(`dashboard:overview:${session.userId}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
