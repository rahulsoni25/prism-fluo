/**
 * PATCH /api/admin/pages/[id]
 * Toggle a single page's status.  Body: { status: "published" | "draft" }
 * Protected pages cannot be set to "draft".
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

async function checkAdmin(userId: string): Promise<boolean> {
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const { status } = await req.json();
  if (!['draft', 'published'].includes(status))
    return NextResponse.json({ error: 'status must be "draft" or "published"' }, { status: 400 });

  // Check if page is protected before allowing unpublish
  const check = await db.query('SELECT protected FROM pages WHERE id = $1', [params.id]);
  if (!check.rows.length)
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  if (check.rows[0].protected && status === 'draft')
    return NextResponse.json({ error: 'This page is protected and cannot be unpublished' }, { status: 409 });

  const result = await db.query(
    `UPDATE pages SET status = $1, updated_at = NOW() WHERE id = $2
     RETURNING id, name, slug, status, updated_at`,
    [status, params.id],
  );

  return NextResponse.json({ page: result.rows[0] });
}
