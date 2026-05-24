/**
 * GET /api/admin/agents-overview
 *
 * Iterates the council registry and asks each one for its snapshot. Does
 * NOT know how many councils exist — adding one in lib/agents/councils/
 * makes it appear here automatically.
 *
 * Returns { systemGrade, councils: [...] } consumed by /admin/agents.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { snapshotAllCouncils } from '@/lib/agents/master';

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

  const all = await snapshotAllCouncils();

  // System grade = mean of councils that contribute a grade (computeGrade defined)
  const grades = all.map(c => c.grade).filter((g): g is number => typeof g === 'number');
  const systemGrade = grades.length
    ? Math.round((grades.reduce((a, b) => a + b, 0) / grades.length) * 10) / 10
    : 10;

  return NextResponse.json({
    systemGrade,
    councils: all.map(({ descriptor: d, snapshot, grade }) => ({
      id:          d.id,
      name:        d.name,
      stage:       d.stage,
      emoji:       d.emoji,
      agents:      d.agentNames.length,
      agentNames:  d.agentNames,
      description: d.description,
      lifetime:    snapshot.lifetime,
      recent:      snapshot.recent,
      link:        d.link,
      grade,
    })),
  });
}
