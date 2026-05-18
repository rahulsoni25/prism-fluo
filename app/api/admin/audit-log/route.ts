/**
 * GET /api/admin/audit-log?limit=100&action=user.delete
 * Returns the most recent admin actions. Admin-only.
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

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const limit  = Math.min(500, Math.max(1, Number(req.nextUrl.searchParams.get('limit')) || 100));
  const action = req.nextUrl.searchParams.get('action');

  try {
    const params: any[] = [];
    let where = '';
    if (action) { params.push(action); where = `WHERE action = $${params.length}`; }
    params.push(limit);
    const { rows } = await db.query(
      `SELECT id, actor_id, actor_email, action, target_id, target_email, details, created_at
         FROM admin_audit_log
         ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length}`,
      params,
    );
    return NextResponse.json({ entries: rows });
  } catch (e: any) {
    // Most likely the table doesn't exist yet — return empty rather than 500.
    if (/relation .* does not exist/i.test(e.message)) {
      return NextResponse.json({ entries: [], note: 'audit table not yet created — perform an admin action to initialize' });
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
