/**
 * GET /api/admin/env-check
 *
 * Admin-only. Reports whether expected runtime env vars are present, their
 * length, and whether they look syntactically valid for their type. Never
 * returns the values themselves — only presence + shape signals.
 *
 * Why this exists: Vercel "Sensitive" env vars are encrypted; the dashboard
 * shows the name but not the value. If a key was rotated to an empty string
 * or only set for a non-production target, we can't tell from the UI. This
 * route lets a logged-in admin confirm from inside the running container.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

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

function inspect(name: string): { set: boolean; len: number; prefix: string | null; shape: string | null } {
  const v = process.env[name];
  if (v == null) return { set: false, len: 0, prefix: null, shape: null };
  const trimmed = v.trim();
  // First 6 chars only — enough to tell sk-or-… from a paste error or "" or quotes
  const prefix = trimmed.length > 0 ? trimmed.slice(0, 6) : '';
  let shape: string | null = null;
  if (trimmed.length === 0)                          shape = 'EMPTY';
  else if (/^["']/.test(trimmed))                    shape = 'STARTS_WITH_QUOTE';
  else if (name.includes('OPENROUTER') && !/^sk-or-/.test(trimmed)) shape = 'NOT_SK-OR_PREFIX';
  else                                               shape = 'LOOKS_OK';
  return { set: true, len: trimmed.length, prefix, shape };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkAdmin(session.userId)))
    return NextResponse.json({ error: 'Forbidden — admin only' }, { status: 403 });

  return NextResponse.json({
    runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    vars: {
      OPENROUTER_API_KEY: inspect('OPENROUTER_API_KEY'),
      GEMINI_API_KEY:     inspect('GEMINI_API_KEY'),
      GOOGLE_API_KEY:     inspect('GOOGLE_API_KEY'),
      DATABASE_URL:       inspect('DATABASE_URL'),
      SMTP_USER:          inspect('SMTP_USER'),
      SMTP_PASS:          inspect('SMTP_PASS'),
      AUTH_GOOGLE_ID:     inspect('AUTH_GOOGLE_ID'),
      AUTH_GOOGLE_SECRET: inspect('AUTH_GOOGLE_SECRET'),
    },
  });
}
