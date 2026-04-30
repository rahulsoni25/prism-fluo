/**
 * POST /api/auth/login
 *
 * Demo-mode email/password login. Accepts ANY password for the canonical
 * demo accounts (sarah@wunderman.com), and any email ending in a
 * whitelisted domain — useful for letting agency teammates self-onboard
 * during the demo phase before real Google/LinkedIn OAuth is wired.
 *
 * Once OAuth is configured (AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET, or
 * AUTH_LINKEDIN_ID + AUTH_LINKEDIN_SECRET), the login page hides the
 * email/password form and exposes social buttons — but this endpoint
 * keeps working as a documented break-glass.
 *
 * Body:  { email: string, password?: string, name?: string }
 * Reply: 200 { id, email, name } + Set-Cookie
 *        401 on failure
 */

import { NextRequest, NextResponse } from 'next/server';
import { signSession, SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS } from '@/lib/auth/session';
import { upsertUser } from '@/lib/auth/server';

const DEMO_EMAIL_DOMAINS = ['wunderman.com', 'fluo.ai', 'prism.ai', 'demo.prism.ai', 'localhost', 'dummy.ai'];
const DEMO_HARDCODED = new Set(['sarah@wunderman.com']);

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const email: string = (body?.email ?? '').toLowerCase().trim();
  const name:  string = (body?.name  ?? '').trim();

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 });
  }

  const domain    = email.split('@')[1];
  const isDemo    = DEMO_HARDCODED.has(email) || DEMO_EMAIL_DOMAINS.includes(domain);
  const allowDemo = process.env.AUTH_DEMO_OPEN !== 'false'; // default ON until OAuth is wired

  if (!isDemo && !allowDemo) {
    return NextResponse.json(
      { error: 'Demo email/password login is restricted. Use Google or LinkedIn sign-in.' },
      { status: 401 },
    );
  }

  const user = await upsertUser({
    email,
    name:     name || email.split('@')[0],
    provider: 'demo',
  });

  const token = await signSession({
    userId:   user.id,
    email:    user.email,
    name:     user.name,
    image:    user.image,
    provider: 'demo',
  });

  const res = NextResponse.json({ id: user.id, email: user.email, name: user.name });
  res.cookies.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  return res;
}
