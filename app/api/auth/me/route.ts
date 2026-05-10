/**
 * GET /api/auth/me
 * Returns the current session payload, or 401 if no/invalid session.
 * Used by the client to detect login state on every page load.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

async function resolveAdmin(userId: string): Promise<boolean> {
  try {
    const result = await db.query(
      'SELECT email, is_admin FROM users WHERE id = $1',
      [userId],
    );
    const user = result.rows[0];
    if (!user) return false;
    if (user.is_admin === true) return true;
    const adminList = (process.env.ADMIN_EMAILS ?? '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return adminList.includes((user.email ?? '').toLowerCase());
  } catch {
    return false;
  }
}

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ authenticated: false }, { status: 401 });

  const isAdmin = await resolveAdmin(s.userId);

  return NextResponse.json({
    authenticated: true,
    userId:   s.userId,
    email:    s.email,
    name:     s.name ?? null,
    image:    s.image ?? null,
    provider: s.provider,
    exp:      s.exp,
    isAdmin,
  });
}
