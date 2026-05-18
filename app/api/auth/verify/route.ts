/**
 * GET /api/auth/verify?token=<hex>
 * Validates the one-time email token, creates the user account,
 * signs a session cookie, and redirects to /dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { upsertUser } from '@/lib/auth/server';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

function redirectError(req: NextRequest, code: string) {
  const base = new URL('/', req.url);
  return NextResponse.redirect(new URL(`/login?error=${code}`, base));
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token || token.length !== 64) return redirectError(req, 'invalid_token');

  try {
    const { rows } = await db.query(
      'SELECT email, name, expires_at FROM verification_tokens WHERE token = $1',
      [token],
    );

    if (rows.length === 0) return redirectError(req, 'invalid_token');

    const { email, name, expires_at } = rows[0];

    if (new Date(expires_at) < new Date()) {
      await db.query('DELETE FROM verification_tokens WHERE token = $1', [token]);
      return redirectError(req, 'expired_token');
    }

    // Create (or update) the user row
    const user = await upsertUser({ email, name, provider: 'demo' });

    // Consume the token — one-time use
    await db.query('DELETE FROM verification_tokens WHERE token = $1', [token]);

    // Sign a 7-day session
    const sessionToken = await signSession({
      userId:   user.id,
      email:    user.email,
      name:     user.name ?? null,
      image:    null,
      provider: 'demo',
    });

    const response = NextResponse.redirect(new URL('/dashboard', req.url));
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path:     '/',
      maxAge:   7 * 24 * 60 * 60,
    });
    return response;
  } catch (err) {
    console.error('[verify] error:', err);
    return redirectError(req, 'server_error');
  }
}
