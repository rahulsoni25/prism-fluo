/**
 * GET /api/briefs/[id]/data-completeness — proactive gap audit
 * Returns: sources present + ranked gaps + 0-100 completeness score
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { analyzeDataCompleteness } from '@/lib/mapper/data-completeness';

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const ownerRes = await db.query('SELECT id FROM briefs WHERE id = $1 AND user_id = $2', [id, session.userId])
    .catch(() => ({ rows: [] as any[] }));
  if (ownerRes.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const report = await analyzeDataCompleteness(id);
  return NextResponse.json(report);
}
