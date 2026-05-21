/**
 * GET /api/admin/ai-health
 *
 * Returns:
 *   • Recent fallback events (last 200)
 *   • 24h aggregate summary by surface + severity
 *   • Current LLM provider status (key set, models known)
 *
 * Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { recentFallbackEvents, fallbackSummary } from '@/lib/ai/fallback-monitor';

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

export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  const [events, summary24h, summary1h] = await Promise.all([
    recentFallbackEvents({ limit: 200 }),
    fallbackSummary(24),
    fallbackSummary(1),
  ]);

  return NextResponse.json({
    providerStatus: {
      openRouterKeySet: !!process.env.OPENROUTER_API_KEY,
      openRouterKeyLength: (process.env.OPENROUTER_API_KEY || '').length,
      geminiKeySet: !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_API_KEY,
      smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
    },
    summary: {
      last1h:  summary1h,
      last24h: summary24h,
    },
    events,
  });
}
