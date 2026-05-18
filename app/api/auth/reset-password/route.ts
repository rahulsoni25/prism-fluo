/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 *
 * Validates the token, updates the user's password_hash, marks the token
 * as used, signs them in, and returns the session cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { hashPassword } from '@/lib/auth/password';
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const token    = String(body?.token    ?? '').trim();
  const password = String(body?.password ?? '');
  if (!token || token.length !== 64) {
    return NextResponse.json({ error: 'Invalid or missing token.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
  }

  try {
    const { rows } = await db.query(
      `SELECT prt.user_id, prt.email, prt.expires_at, prt.used_at, u.name, u.image
         FROM password_reset_tokens prt
         JOIN users u ON u.id = prt.user_id
        WHERE prt.token = $1`,
      [token],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'This reset link is invalid or has already been used.' }, { status: 400 });
    }
    const r = rows[0];
    if (r.used_at) {
      return NextResponse.json({ error: 'This reset link has already been used.' }, { status: 400 });
    }
    if (new Date(r.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This reset link has expired. Please request a new one.' }, { status: 400 });
    }

    const newHash = await hashPassword(password);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, r.user_id]);
    await db.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token = $1', [token]);

    // Sign them in
    const sessionToken = await signSession({
      userId:   r.user_id,
      email:    r.email,
      name:     r.name ?? null,
      image:    r.image ?? null,
      provider: 'demo',
    });
    const res = NextResponse.json({ ok: true, email: r.email });
    res.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);
    return res;
  } catch (err: any) {
    console.error('[reset-password] error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
