/**
 * middleware.ts
 *
 * Edge middleware — runs before every request. Redirects unauthenticated
 * users to /login for app routes, and returns 401 JSON for unprotected
 * API routes that need a session.
 *
 * Whitelisted paths (no auth required):
 *   /login                — the login page itself
 *   /api/auth/*           — login/logout/me/providers/oauth callbacks
 *   /api/health           — used by Railway healthcheck
 *   /api/version          — used for deploy verification
 *   /_next/*              — Next.js static assets
 *   /favicon.ico, *.png   — static
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

const PUBLIC_PATHS = [
  '/login',
];
const PUBLIC_API_PREFIXES = [
  '/api/auth/',
  '/api/health',
  '/api/version',
];
// Static assets — never gate
function isStatic(pathname: string): boolean {
  return (
    pathname.startsWith('/_next/')   ||
    pathname.startsWith('/static/')  ||
    pathname === '/favicon.ico'      ||
    /\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|eot|map)$/i.test(pathname)
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isStatic(pathname)) return NextResponse.next();
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some(p => pathname.startsWith(p))) return NextResponse.next();

  // Read + verify the session cookie
  const token   = req.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  const session = await verifySession(token);

  if (session) return NextResponse.next();

  // Unauthenticated. API routes get 401 JSON; pages redirect to /login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

// Run on every path EXCEPT the static and image asset prefixes.
// This matcher is the cheap fast-path; isStatic() above catches edge cases.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
