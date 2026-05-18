/**
 * POST /api/auth/forgot-password
 * Body: { email }
 *
 * If the email exists AND the user has a password_hash (i.e. they signed up
 * via the email flow, not pure OAuth/demo), we create a one-time reset token
 * and email them a link. Otherwise we still respond 200 with the same body —
 * this prevents account enumeration ("does X have an account here?").
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db/client';
import { sendPasswordResetEmail } from '@/lib/email';
import { isAllowedEmail, WORK_EMAIL_ERROR } from '@/lib/auth/email-policy';

export const dynamic = 'force-dynamic';

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token      TEXT PRIMARY KEY,
      user_id    UUID NOT NULL,
      email      TEXT NOT NULL,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      used_at    TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_pwreset_user    ON password_reset_tokens(user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_pwreset_expires ON password_reset_tokens(expires_at)`);
}

const GENERIC_RESPONSE = { ok: true, message: "If an account exists for that email, we've sent a reset link." };

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const email = (body?.email ?? '').toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }
  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: WORK_EMAIL_ERROR }, { status: 403 });
  }

  try {
    await ensureTable();
    const { rows } = await db.query(
      'SELECT id, email, name FROM users WHERE email = $1 AND password_hash IS NOT NULL',
      [email],
    );

    if (rows.length === 0) {
      // Don't reveal whether the account exists. Constant-time delay so
      // attackers can't measure timing.
      await new Promise(r => setTimeout(r, 150));
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const user = rows[0];
    // Invalidate any prior unused tokens for this user
    await db.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

    const token     = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    await db.query(
      'INSERT INTO password_reset_tokens (token, user_id, email, expires_at) VALUES ($1, $2, $3, $4)',
      [token, user.id, email, expiresAt],
    );

    const host    = req.headers.get('host') ?? 'prism-fluo.vercel.app';
    const proto   = host.startsWith('localhost') ? 'http' : 'https';
    const resetUrl = `${proto}://${host}/reset-password?token=${token}`;

    await sendPasswordResetEmail({ name: user.name ?? user.email, email }, resetUrl);
    return NextResponse.json(GENERIC_RESPONSE);
  } catch (err) {
    console.error('[forgot-password] error:', err);
    return NextResponse.json(GENERIC_RESPONSE); // Still 200 — don't leak
  }
}
