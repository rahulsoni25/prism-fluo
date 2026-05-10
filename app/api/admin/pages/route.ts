/**
 * GET  /api/admin/pages  — list ALL pages (draft + published)
 * POST /api/admin/pages  — bulk actions: publish_all | unpublish_all
 *
 * Admin-only. Checks is_admin DB flag OR ADMIN_EMAILS env var.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

async function checkAdmin(userId: string): Promise<boolean> {
  try {
    const result = await db.query(
      'SELECT email, is_admin FROM users WHERE id = $1',
      [userId],
    );
    const user = result.rows[0];
    if (!user) return false;
    if (user.is_admin === true) return true;

    // Env-variable fallback: ADMIN_EMAILS=alice@co.com,bob@co.com
    const adminList = (process.env.ADMIN_EMAILS ?? '')
      .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    return adminList.includes((user.email ?? '').toLowerCase());
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const result = await db.query(
    `SELECT id, name, slug, description, icon, status, show_in_nav, protected, sort_order, updated_at
     FROM pages
     ORDER BY sort_order ASC`,
  );
  return NextResponse.json({ pages: result.rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const { action } = await req.json();

  if (action === 'publish_all') {
    await db.query(
      `UPDATE pages SET status = 'published', updated_at = NOW()`,
    );
    return NextResponse.json({ ok: true, action: 'publish_all' });
  }

  if (action === 'unpublish_all') {
    // Never unpublish protected pages (login, dashboard)
    await db.query(
      `UPDATE pages SET status = 'draft', updated_at = NOW() WHERE protected = false`,
    );
    return NextResponse.json({ ok: true, action: 'unpublish_all' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
