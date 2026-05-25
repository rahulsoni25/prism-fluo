/**
 * GET /api/briefs/[id]/keyword-intent
 *
 * Returns the KeywordIntent nugget for a brief — intent mix + top branded
 * + top non-branded + top trending. Null if no Keyword Planner data uploaded.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { buildKeywordIntentNugget } from '@/lib/nuggets/keyword-intent';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: briefId } = await ctx.params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const briefRes = await db.query(
    'SELECT id, brand, competitors FROM briefs WHERE id = $1 AND user_id = $2',
    [briefId, session.userId],
  ).catch(() => ({ rows: [] as any[] }));
  if (briefRes.rows.length === 0) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
  }

  const brief = briefRes.rows[0];
  const nugget = await buildKeywordIntentNugget(briefId, brief.brand, brief.competitors);

  return NextResponse.json({ briefId, nugget });
}
