/**
 * POST /api/auth/register
 *
 * INSTANT SIGNUP MODE (default): creates the user immediately, signs them in
 * with a session cookie, and fires the verification email as fire-and-forget.
 * User lands on /dashboard signed-in even if the email pipeline is down.
 *
 * Rationale (2026-05-31): email deliverability was blocking new signups
 * entirely — Gmail SMTP unreliable, Resend sandbox restricted. Rather than
 * make signup dependent on a moving-target email service, we auto-create
 * the account. Email verification can be re-required later by setting env
 * REQUIRE_EMAIL_VERIFICATION=true.
 *
 * Fallback behaviour (REQUIRE_EMAIL_VERIFICATION=true): the original flow —
 * creates a pending verification_tokens row + sends confirmation email,
 * user must click link to activate.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sendVerificationEmail } from '@/lib/email';
import { hashPassword } from '@/lib/auth/password';
import { isAllowedEmail, WORK_EMAIL_ERROR } from '@/lib/auth/email-policy';
import { checkRateLimit, clientIp, rateLimitResponse } from '@/lib/auth/rate-limit';
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Ensure the verification_tokens table exists (safe to run on every cold start)
async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS verification_tokens (
      token         TEXT PRIMARY KEY,
      email         TEXT NOT NULL,
      name          TEXT,
      password_hash TEXT,
      expires_at    TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`ALTER TABLE verification_tokens ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
}

export async function POST(req: NextRequest) {
  // Throttle signups per IP to stop bulk account creation. 5 / hour is high
  // enough for a small office sharing one IP, low enough to cap any abuser.
  const ip = clientIp(req);
  const rl = await checkRateLimit(`signup:ip:${ip}`, { max: 5, windowMs: 60 * 60_000 });
  if (!rl.ok) return rateLimitResponse(rl.retryAfterSec, rl.message);

  try {
    const { name, agency, email, password } = await req.json();

    if (!name?.trim() || !email?.trim() || !password) {
      return NextResponse.json({ error: 'Name, email and password are required.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 });
    }

    const normalEmail = email.toLowerCase().trim();
    if (!isAllowedEmail(normalEmail)) {
      return NextResponse.json({ error: WORK_EMAIL_ERROR }, { status: 400 });
    }
    const fullName    = agency?.trim() ? `${name.trim()} (${agency.trim()})` : name.trim();

    await ensureTable();

    // Block if already registered
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalEmail]);
    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in.' },
        { status: 409 },
      );
    }

    // Remove any stale pending token for this email
    await db.query('DELETE FROM verification_tokens WHERE email = $1', [normalEmail]);

    // Hash the password BEFORE persisting — the plaintext never touches the DB
    const passwordHash = await hashPassword(password);

    const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';

    // Build the verify URL either way (fire-and-forget email + fallback log)
    const host      = req.headers.get('host') ?? 'prism-fluo.vercel.app';
    const proto     = host.startsWith('localhost') ? 'http' : 'https';

    if (requireEmailVerification) {
      // ── LEGACY FLOW: email-verified activation ──────────────────
      const token     = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
      await db.query(
        'INSERT INTO verification_tokens (token, email, name, password_hash, expires_at) VALUES ($1, $2, $3, $4, $5)',
        [token, normalEmail, fullName, passwordHash, expiresAt],
      );
      const verifyUrl = `${proto}://${host}/api/auth/verify?token=${token}`;
      await sendVerificationEmail({ name: fullName, email: normalEmail }, verifyUrl);
      return NextResponse.json({ success: true, mode: 'verify-first' });
    }

    // ── INSTANT SIGNUP FLOW (default): create the user + sign them in ──
    const insertRes = await db.query(
      `INSERT INTO users (email, name, password_hash, provider, created_at, last_login)
       VALUES ($1, $2, $3, 'email', NOW(), NOW())
       RETURNING id, email, name, image`,
      [normalEmail, fullName, passwordHash],
    );
    const user = insertRes.rows[0];

    // Sign a session cookie so the user lands on /dashboard already logged in.
    // Provider is 'demo' — matches the login route's password-based path and
    // fits the current SessionPayload union ('demo' | 'google' | 'linkedin').
    // When we add a proper 'email' provider to the union, this can move too.
    const sessionToken = await signSession({
      userId:   user.id,
      email:    user.email,
      name:     user.name,
      image:    user.image,
      provider: 'demo',
    });

    // Fire the welcome / verification email as fire-and-forget. If it fails,
    // the signup still succeeds — the user is already logged in.
    const verifyUrl = `${proto}://${host}/api/auth/verify?instant=1`;
    sendVerificationEmail({ name: fullName, email: normalEmail }, verifyUrl)
      .catch(err => console.warn('[register] welcome email fire-and-forget failed:', err?.message));

    const res = NextResponse.json({
      success:      true,
      mode:         'instant',
      id:           user.id,
      email:        user.email,
      name:         user.name,
      redirectTo:   '/dashboard',
    });
    res.cookies.set(SESSION_COOKIE_NAME, sessionToken, SESSION_COOKIE_OPTIONS);
    return res;
  } catch (err) {
    console.error('[register] error:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
