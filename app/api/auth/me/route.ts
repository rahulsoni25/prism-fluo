/**
 * GET /api/auth/me
 * Returns the current session payload, or 401 if no/invalid session.
 * Used by the client to detect login state on every page load.
 */

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({
    authenticated: true,
    userId:   s.userId,
    email:    s.email,
    name:     s.name ?? null,
    image:    s.image ?? null,
    provider: s.provider,
    exp:      s.exp,
  });
}
