/**
 * GET /api/briefs/[id]/combined-rows
 *
 * Returns the pooled tool_data rows across every NON-SUPERSEDED upload of
 * the brief — the bridge piece for the brief-merge Tier 2 behavior
 * (see docs/PENDING-DECISIONS.md → "multi-upload-per-brief").
 *
 * The upload page calls this after a 2nd-or-later upload lands on a brief
 * with multiple active sources, then POSTs the combined rows to
 * /api/ai/analyze-data so the resulting analysis reflects ALL uploaded
 * data, not just the latest file.
 *
 * Response shape:
 *   {
 *     briefId, activeUploads: [{ id, filename, sourceType }],
 *     rows: [...],
 *     totalRows, sheets: [{ sheetName, fromUpload }]
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: briefId } = await ctx.params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Ownership check + brief existence
  const briefRows = await db.query(
    'SELECT id FROM briefs WHERE id = $1 AND user_id = $2',
    [briefId, session.userId],
  ).catch(() => ({ rows: [] }));
  if (briefRows.rows.length === 0) {
    return NextResponse.json({ error: 'Brief not found' }, { status: 404 });
  }

  // All currently-active (non-superseded) uploads on this brief
  const upRes = await db.query(
    `SELECT id, filename, source_type, created_at
       FROM uploads
      WHERE brief_id = $1
        AND superseded_by IS NULL
      ORDER BY created_at ASC`,
    [briefId],
  );
  const activeUploads = upRes.rows.map((r: any) => ({
    id:         r.id,
    filename:   r.filename,
    sourceType: r.source_type ?? 'unknown',
    createdAt:  r.created_at,
  }));

  if (activeUploads.length === 0) {
    return NextResponse.json({
      briefId, activeUploads: [], rows: [], totalRows: 0, sheets: [],
    });
  }

  // Pool tool_data rows across all active uploads
  const uploadIds = activeUploads.map(u => u.id);
  const dataRes = await db.query(
    `SELECT upload_id, sheet_name, tool_type, row_data
       FROM tool_data
      WHERE upload_id = ANY($1::uuid[])
      ORDER BY upload_id, sheet_name`,
    [uploadIds],
  ).catch(() => ({ rows: [] as any[] }));

  const rows: any[] = [];
  const sheetSet = new Map<string, string>(); // sheetName → uploadId (first occurrence)
  const sourceMeta = new Map<string, string>(); // uploadId → filename
  for (const u of activeUploads) sourceMeta.set(u.id, u.filename);

  for (const r of dataRes.rows) {
    // Tag each row with provenance so downstream analyzers can attribute
    rows.push({
      ...((r.row_data && typeof r.row_data === 'object') ? r.row_data : { value: r.row_data }),
      __sourceUploadId: r.upload_id,
      __sourceFile:     sourceMeta.get(r.upload_id) ?? '(unknown)',
      __sourceSheet:    r.sheet_name,
      __sourceTool:     r.tool_type,
    });
    if (!sheetSet.has(r.sheet_name)) sheetSet.set(r.sheet_name, r.upload_id);
  }

  return NextResponse.json({
    briefId,
    activeUploads,
    rows,
    totalRows: rows.length,
    sheets: Array.from(sheetSet.entries()).map(([sheetName, fromUpload]) => ({
      sheetName,
      fromUpload,
      fromFile: sourceMeta.get(fromUpload) ?? '(unknown)',
    })),
  });
}
