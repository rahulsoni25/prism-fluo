/**
 * /api/briefs/[id]/share-link
 *
 *   GET    → returns the active share link for this brief (if any)
 *            { token, url, createdAt, viewCount, revoked }
 *   POST   → creates a new share link (idempotent — returns the existing
 *            one if active). Body: { expiresInDays?: number }
 *   DELETE → revokes the active share link
 *
 * Auth: only the brief owner can manage the link. The PUBLIC view of the
 * link itself lives at /share/[token] and requires no login.
 *
 * Schema is auto-migrated on first call — no manual migration step needed.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { audit, reqMeta } from '@/lib/audit';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

let _schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  _schemaReady = true;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS share_links (
        token        TEXT PRIMARY KEY,
        brief_id     UUID NOT NULL,
        created_by   UUID,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at   TIMESTAMPTZ,
        revoked_at   TIMESTAMPTZ,
        view_count   INT NOT NULL DEFAULT 0,
        last_viewed  TIMESTAMPTZ
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS share_links_brief_idx
                    ON share_links (brief_id, created_at DESC)`);
  } catch (err: any) {
    logger.warn('share-link:schema_init_failed', { error: err.message });
  }
}

async function checkOwnership(briefId: string, userId: string): Promise<boolean> {
  const r = await db.query('SELECT id FROM briefs WHERE id = $1 AND user_id = $2', [briefId, userId])
    .catch(() => ({ rows: [] as any[] }));
  return r.rows.length > 0;
}

function publicUrl(req: NextRequest, token: string): string {
  // Prefer the request origin (works in dev, preview, and prod).
  const origin = req.headers.get('origin')
              || req.headers.get('referer')?.split('/').slice(0, 3).join('/')
              || `https://${req.headers.get('host') ?? 'prism-fluo.vercel.app'}`;
  return `${origin}/share/${token}`;
}

async function fetchActiveLink(briefId: string): Promise<any | null> {
  const r = await db.query(
    `SELECT token, brief_id, created_at, expires_at, revoked_at, view_count, last_viewed
       FROM share_links
      WHERE brief_id = $1 AND revoked_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [briefId],
  ).catch(() => ({ rows: [] as any[] }));
  return r.rows[0] ?? null;
}

// ── GET ────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkOwnership(id, session.userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const link = await fetchActiveLink(id);
  if (!link) return NextResponse.json({ link: null });
  return NextResponse.json({
    link: {
      token:      link.token,
      url:        publicUrl(req, link.token),
      createdAt:  link.created_at,
      expiresAt:  link.expires_at,
      viewCount:  link.view_count,
      lastViewed: link.last_viewed,
    },
  });
}

// ── POST (create or return existing) ───────────────────────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkOwnership(id, session.userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Idempotent: if there's an active link, return it instead of creating noise.
  const existing = await fetchActiveLink(id);
  if (existing) {
    return NextResponse.json({
      link: {
        token:      existing.token,
        url:        publicUrl(req, existing.token),
        createdAt:  existing.created_at,
        expiresAt:  existing.expires_at,
        viewCount:  existing.view_count,
        lastViewed: existing.last_viewed,
      },
      reused: true,
    });
  }

  const body = await req.json().catch(() => ({}));
  const expiresInDays = Math.max(1, Math.min(Number(body?.expiresInDays) || 90, 365));
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  // 32-char URL-safe token. crypto.randomBytes is plenty (collision probability ~0).
  const token = crypto.randomBytes(24).toString('base64url');

  await db.query(
    `INSERT INTO share_links (token, brief_id, created_by, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [token, id, session.userId, expiresAt.toISOString()],
  );

  audit({
    kind: 'share.create',
    userId:    session.userId,
    userEmail: session.email,
    targetType: 'brief',
    targetId:   id,
    ...reqMeta(req),
    metadata: { token, expiresInDays },
  }).catch(() => {});

  return NextResponse.json({
    link: {
      token,
      url:        publicUrl(req, token),
      createdAt:  new Date().toISOString(),
      expiresAt:  expiresAt.toISOString(),
      viewCount:  0,
      lastViewed: null,
    },
    reused: false,
  });
}

// ── DELETE (revoke) ────────────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkOwnership(id, session.userId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const active = await fetchActiveLink(id);
  if (!active) return NextResponse.json({ ok: true, revoked: false });

  await db.query(
    `UPDATE share_links SET revoked_at = NOW() WHERE token = $1`,
    [active.token],
  );

  audit({
    kind: 'share.revoke',
    userId:    session.userId,
    userEmail: session.email,
    targetType: 'brief',
    targetId:   id,
    ...reqMeta(req),
    metadata: { token: active.token },
  }).catch(() => {});

  return NextResponse.json({ ok: true, revoked: true });
}
