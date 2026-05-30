/**
 * GET /api/share/[token]
 *
 * Public, no-auth endpoint that resolves a share token to the underlying
 * brief + its latest analysis. Used by /share/[token] (the public viewer).
 *
 * Security:
 *   - Token must exist AND not be revoked AND not be expired
 *   - Returns ONLY the data needed to render the report — no upload IDs,
 *     no user IDs, no internal model paths
 *   - Increments view_count (cheap, async)
 *   - Logs every view as audit `share.view` so the brief owner can see
 *     "your client opened this 4 times this week" in the admin trail
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { audit, reqMeta } from '@/lib/audit';
import { relabelAnalysisCharts } from '@/lib/insights/relabel';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 });
  }

  // 1. Resolve token → brief
  const tr = await db.query(
    `SELECT brief_id, expires_at, revoked_at
       FROM share_links WHERE token = $1`,
    [token],
  ).catch(() => ({ rows: [] as any[] }));
  const link = tr.rows[0];
  if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 });
  if (link.revoked_at) return NextResponse.json({ error: 'Link revoked' }, { status: 410 });
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  // 2. Fetch the brief + the latest analysis (same shape as /insights uses)
  const br = await db.query(
    `SELECT id, brand, category, objective, audience_labels, created_at
       FROM briefs WHERE id = $1`,
    [link.brief_id],
  ).catch(() => ({ rows: [] as any[] }));
  const brief = br.rows[0];
  if (!brief) return NextResponse.json({ error: 'Brief not found' }, { status: 404 });

  const ar = await db.query(
    `SELECT id, filename, sheet_name, results_json, created_at
       FROM analyses WHERE brief_id = $1
       ORDER BY created_at DESC LIMIT 1`,
    [link.brief_id],
  ).catch(() => ({ rows: [] as any[] }));
  const analysis = ar.rows[0];

  // 3. Apply per-brief audience-label substitution before returning
  let results = analysis?.results_json ?? null;
  if (results && brief.audience_labels && Object.keys(brief.audience_labels).length > 0) {
    try { results = relabelAnalysisCharts(results, brief.audience_labels); } catch {}
  }

  // 4. Bump view_count (best-effort, async)
  db.query(
    `UPDATE share_links SET view_count = view_count + 1, last_viewed = NOW() WHERE token = $1`,
    [token],
  ).catch(() => {});

  // 5. Audit the visit (anonymous — no userId, but we capture IP/UA)
  audit({
    kind: 'share.view',
    targetType: 'brief',
    targetId:   String(brief.id),
    ...reqMeta(req),
    metadata: { token },
  }).catch(() => {});

  return NextResponse.json({
    brief: {
      id:        brief.id,
      brand:     brief.brand,
      category:  brief.category,
      objective: brief.objective,
      createdAt: brief.created_at,
    },
    analysis: analysis ? {
      filename:    analysis.filename,
      sheet_name:  analysis.sheet_name,
      results_json: results,
      createdAt:   analysis.created_at,
    } : null,
    poweredBy: 'PRISM Council',
  });
}
