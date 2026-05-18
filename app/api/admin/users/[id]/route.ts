/**
 * PATCH  /api/admin/users/[id] — { isAdmin?: boolean, password?: string, name?: string }
 *   Toggle admin, reset password, or rename.
 * DELETE /api/admin/users/[id] — remove a user (cascades to their owned rows).
 *
 * Admin-only. Admins cannot demote or delete themselves.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { hashPassword } from '@/lib/auth/password';
import { logAdminAction } from '@/lib/auth/audit';

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

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const sets: string[] = [];
  const vals: any[] = [];

  if (typeof body.isAdmin === 'boolean') {
    if (id === session.userId && body.isAdmin === false) {
      return NextResponse.json({ error: 'You cannot demote yourself.' }, { status: 400 });
    }
    sets.push(`is_admin = $${sets.length + 1}`);
    vals.push(body.isAdmin);
  }

  if (typeof body.password === 'string' && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }
    sets.push(`password_hash = $${sets.length + 1}`);
    vals.push(await hashPassword(body.password));
  }

  if (typeof body.name === 'string' && body.name.trim()) {
    sets.push(`name = $${sets.length + 1}`);
    vals.push(body.name.trim());
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No supported fields provided.' }, { status: 400 });
  }

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${vals.length}
     RETURNING id, email, name, is_admin, (password_hash IS NOT NULL) AS has_password`,
    vals,
  );
  if (rows.length === 0) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  // Fire-and-forget audit — never blocks or fails the response
  const changedFields: string[] = [];
  if (typeof body.isAdmin === 'boolean')                changedFields.push(body.isAdmin ? 'promote' : 'demote');
  if (typeof body.password === 'string' && body.password) changedFields.push('reset_password');
  if (typeof body.name === 'string' && body.name.trim()) changedFields.push('rename');
  logAdminAction({
    actorId:     session.userId,
    actorEmail:  session.email,
    action:      `user.${changedFields.join('+') || 'patch'}`,
    targetId:    rows[0].id,
    targetEmail: rows[0].email,
    details:     { fields: changedFields, isAdminNow: rows[0].is_admin },
  }).catch(() => {});

  return NextResponse.json({ user: rows[0] });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const { id } = await ctx.params;
  if (id === session.userId) {
    return NextResponse.json({ error: 'You cannot delete your own account from here.' }, { status: 400 });
  }

  // Capture email before deletion for the audit row
  const { rows: targetRows } = await db.query('SELECT email FROM users WHERE id = $1', [id]);
  const targetEmail = targetRows[0]?.email ?? null;

  const { rowCount } = await db.query('DELETE FROM users WHERE id = $1', [id]);
  if (!rowCount) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  logAdminAction({
    actorId:     session.userId,
    actorEmail:  session.email,
    action:      'user.delete',
    targetId:    id,
    targetEmail,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
