/**
 * POST /api/auth/logout
 * Clears the session cookie. Always returns 200.
 * Must mirror the same cookie attributes used when the cookie was SET
 * (path, secure, sameSite) — browsers ignore a deletion that doesn't
 * match the original Set-Cookie attributes.
 */

import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 0,           // expire immediately
    expires: new Date(0), // belt-and-suspenders
  });
  return res;
}
