/**
 * GET /api/admin/audit-events
 *
 * Admin endpoint that powers /admin/audit-log. Returns a paged slice of
 * the broad `audit_events` table (every user action) filtered by
 * kind/user/since/until + the total count.
 *
 * Adding ?format=csv triggers a CSV download — this is the procurement-
 * facing artifact for the ₹10K/mo audit-log add-on.
 *
 * Note: a SEPARATE narrower endpoint at /api/admin/audit-log already
 * exists for the old `admin_audit_log` table (admin actions only).
 * Keep both during migration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';
import { db } from '@/lib/db/client';
import { listAuditEvents, exportAuditEventsCsv } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function isAdmin(userId: string): Promise<boolean> {
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
  if (!(await isAdmin(session.userId))) {
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const opts = {
    kind:       sp.get('kind')       || undefined,
    userId:     sp.get('userId')     || undefined,
    targetType: sp.get('targetType') || undefined,
    targetId:   sp.get('targetId')   || undefined,
    since:      sp.get('since') ? new Date(sp.get('since')!) : undefined,
    until:      sp.get('until') ? new Date(sp.get('until')!) : undefined,
    limit:      Number(sp.get('limit')  || 100),
    offset:     Number(sp.get('offset') || 0),
  };

  if (sp.get('format') === 'csv') {
    const csv = await exportAuditEventsCsv(opts);
    const filename = `prism-audit-events-${new Date().toISOString().slice(0,10)}.csv`;
    return new NextResponse(csv, {
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  }

  const { rows, total } = await listAuditEvents(opts);
  return NextResponse.json({ events: rows, total });
}
