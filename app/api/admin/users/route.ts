/**
 * GET /api/admin/users — list all users in the system.
 * Admin-only. Checks is_admin DB flag OR ADMIN_EMAILS env var.
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

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const { rows } = await db.query(
    `SELECT id, email, name, image, provider, is_admin,
            (password_hash IS NOT NULL) AS has_password,
            created_at, last_login
       FROM users
       ORDER BY created_at DESC`,
  );

  const { rows: pendingRows } = await db.query(
    `SELECT email, name, expires_at, created_at
       FROM verification_tokens
       WHERE expires_at > NOW()
       ORDER BY created_at DESC`,
  ).catch(() => ({ rows: [] as any[] }));

  return NextResponse.json({ users: rows, pending: pendingRows, me: session.userId });
}
