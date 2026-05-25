/**
 * GET /api/briefs/[id]/genre-nugget
 *
 * Returns the "Content Genres They Prefer" nugget for a brief, derived
 * from non-superseded GWI uploads. Returns 200 with nugget = null when
 * no genre-shaped GWI data is present (the UI then shows an honest
 * placeholder instead of fabricating numbers).
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { buildGenreNugget, listGwiQuestionTypes } from '@/lib/nuggets/genres';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: briefId } = await ctx.params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Ownership check
  const briefRes = await db.query(
    'SELECT id, brand FROM briefs WHERE id = $1 AND user_id = $2',
    [briefId, session.userId],
  ).catch(() => ({ rows: [] }));
  if (briefRes.rows.length === 0) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
  }

  const nugget = await buildGenreNugget(briefId);
  const presentQuestionTypes = await listGwiQuestionTypes(briefId);

  return NextResponse.json({
    briefId,
    nugget,
    presentQuestionTypes,
    suggestedUploads: nugget
      ? null
      : [
          'TV shows watched (GWI question)',
          'Content topics of interest',
          'Music genres listened to',
          'Streaming services used',
        ],
  });
}
