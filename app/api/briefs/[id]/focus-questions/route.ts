/**
 * GET  /api/briefs/[id]/focus-questions — load previously-saved questions
 * POST /api/briefs/[id]/focus-questions — { rawText } → validate + save
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { validateFocusQuestions, saveFocusQuestions, loadFocusQuestions } from '@/lib/mapper/focus-validator';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function checkOwnership(briefId: string, userId: string): Promise<boolean> {
  const res = await db.query('SELECT id FROM briefs WHERE id = $1 AND user_id = $2', [briefId, userId]).catch(() => ({ rows: [] }));
  return res.rows.length > 0;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkOwnership(id, session.userId))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = await loadFocusQuestions(id);
  return NextResponse.json(data ?? { raw: '', questions: [] });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkOwnership(id, session.userId))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const rawText = String(body.rawText || '').trim();

  const validated = await validateFocusQuestions(id, rawText);
  await saveFocusQuestions(id, rawText, validated);

  return NextResponse.json({ raw: rawText, questions: validated });
}
