/**
 * /api/briefs/[id]/audience-labels
 *
 *   GET  → returns { detected: string[], labels: { original: display } }
 *           where `detected` is the distinct GWI audience names found in
 *           the brief's non-superseded uploads.
 *
 *   POST → { labels: { original: display } } saves the user's mapping.
 *
 * Substitution happens at render time on the client + during PPTX export
 * — see lib/insights/relabel.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

let _schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  _schemaReady = true;
  try {
    await db.query(`ALTER TABLE briefs ADD COLUMN IF NOT EXISTS audience_labels JSONB DEFAULT '{}'::jsonb`);
  } catch (err: any) {
    logger.warn('audience-labels:schema_init_failed', { error: err.message });
  }
}

async function checkOwnership(briefId: string, userId: string): Promise<boolean> {
  const r = await db.query('SELECT id FROM briefs WHERE id = $1 AND user_id = $2', [briefId, userId])
    .catch(() => ({ rows: [] as any[] }));
  return r.rows.length > 0;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkOwnership(id, session.userId))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 1. Saved labels
  const saveRes = await db.query('SELECT audience_labels FROM briefs WHERE id = $1', [id])
    .catch(() => ({ rows: [{ audience_labels: {} }] }));
  const labels = saveRes.rows[0]?.audience_labels ?? {};

  // 2. Auto-detect from non-superseded uploads' GWI audience column
  const upRes = await db.query(
    `SELECT id FROM uploads WHERE brief_id = $1 AND superseded_by IS NULL`,
    [id],
  ).catch(() => ({ rows: [] as any[] }));
  const uploadIds = upRes.rows.map((r: any) => r.id);

  let detected: string[] = [];
  if (uploadIds.length > 0) {
    const audRes = await db.query(
      `SELECT DISTINCT audience FROM gwi_time_spent
        WHERE upload_id = ANY($1::uuid[]) AND audience IS NOT NULL`,
      [uploadIds],
    ).catch(() => ({ rows: [] as any[] }));
    detected = audRes.rows.map((r: any) => String(r.audience)).filter(Boolean).sort();
  }

  return NextResponse.json({ detected, labels });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await ensureSchema();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  if (!(await checkOwnership(id, session.userId))) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const labels = (body && typeof body.labels === 'object' && body.labels !== null) ? body.labels : {};
  // Sanitize: drop empty values, cap each label at 80 chars
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(labels)) {
    const key = String(k).slice(0, 60);
    const val = String(v ?? '').slice(0, 80).trim();
    if (key && val) clean[key] = val;
  }

  await db.query(
    `UPDATE briefs SET audience_labels = $1::jsonb WHERE id = $2`,
    [JSON.stringify(clean), id],
  ).catch(err => logger.warn('audience-labels:save_failed', { id, error: err.message }));

  return NextResponse.json({ labels: clean });
}
