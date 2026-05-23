/**
 * GET /api/analyses/[id]/export/preflight?format=xlsx|pdf
 *
 * Pre-flight + dual-agent verification for the Excel + PDF exports.
 * Same response shape as the presentation preflight so the client helper
 * is format-agnostic.
 *
 * Excel: streams the workbook from /api/analyses/[id]/export?format=xlsx,
 *        buffers in memory, runs the dual-agent.
 * PDF:   we don't have a stored PDF (it's generated on demand). The route
 *        calls the export endpoint in-process to materialise the buffer,
 *        then runs the dual-agent on it. Slower (~2-4s for PDF gen) but
 *        catches the same defects.
 *
 * If verdict.ready → 200 with download URL.
 * If verdict.block → 200 ready:false with detailed reasoning.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/server';
import { dualAgentVerifyExport, type ExportFormat } from '@/lib/exports/dual-agent-export';
import { db } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function materialiseExcel(req: NextRequest, id: string): Promise<Buffer | null> {
  const host = req.headers.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  try {
    const r = await fetch(`${proto}://${host}/api/analyses/${id}/export?format=xlsx`, {
      headers: { cookie: req.headers.get('cookie') || '' },
    });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
  } catch { return null; }
}

async function materialisePdf(req: NextRequest, id: string): Promise<Buffer | null> {
  const host = req.headers.get('host') ?? 'localhost:3000';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  try {
    const r = await fetch(`${proto}://${host}/api/insights/export-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: req.headers.get('cookie') || '' },
      body: JSON.stringify({ analysisId: id }),
    });
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    return Buffer.from(ab);
  } catch { return null; }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const t0 = Date.now();
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, status: 401, error: 'Unauthenticated' }, { status: 401 });

  const format = (req.nextUrl.searchParams.get('format') || 'xlsx').toLowerCase() as ExportFormat;
  if (format !== 'xlsx' && format !== 'pdf') {
    return NextResponse.json({ ok: false, error: 'format must be xlsx or pdf' }, { status: 400 });
  }

  // Confirm read access to the analysis
  const { rows } = await db.query(
    'SELECT id FROM analyses WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)',
    [id, session.userId],
  );
  if (rows.length === 0) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  // Materialise the export
  const buffer = format === 'xlsx' ? await materialiseExcel(req, id) : await materialisePdf(req, id);
  if (!buffer) {
    return NextResponse.json({
      ok: true, ready: false, reason: 'export-failed',
      detail: `Could not materialise ${format} export — the underlying generator returned an error.`,
      elapsedMs: Date.now() - t0,
    });
  }

  const verdict = await dualAgentVerifyExport(buffer, format, id, {
    minPages: format === 'pdf' ? 2 : undefined,  // PDFs should have ≥ 2 pages
  });

  const insp = verdict.inspector;
  const inspectorByKind: Record<string, { blocker: number; major: number; minor: number }> = {};
  for (const i of insp.issues) {
    if (!inspectorByKind[i.kind]) inspectorByKind[i.kind] = { blocker: 0, major: 0, minor: 0 };
    inspectorByKind[i.kind][i.severity]++;
  }

  const baseDualAgent = {
    format,
    inspectorBlockers: insp.issues.filter(i => i.severity === 'blocker').length,
    inspectorMajors:   insp.issues.filter(i => i.severity === 'major').length,
    contentBlockers:   verdict.content?.summary?.bySeverity?.blocker ?? 0,
    contentMajors:     verdict.content?.summary?.bySeverity?.major ?? 0,
    recoverableBlockers: verdict.recoverableBlockers,
    inspectorByKind,
    contentNote: verdict.contentNote,
    sizeBytes: buffer.length,
    ...(format === 'xlsx' ? {
      sheetCount: (insp as any).sheetCount,
      rowCount:   (insp as any).rowCount,
      formulaErrors: (insp as any).formulaErrors,
    } : {
      pageCount: (insp as any).pageCount,
      hasTextStreams: (insp as any).hasTextStreams,
      hasFonts:       (insp as any).hasFonts,
    }),
  };

  if (!verdict.ready) {
    const blockers = [
      ...insp.issues.filter(i => i.severity === 'blocker').map(i => `[inspector/${i.kind}] ${i.detail}`),
      ...(verdict.content?.cards ?? [])
        .flatMap(c => c.findings.filter(f => f.verdict === 'confirmed' && f.severity === 'blocker'))
        .map(f => `[content/${f.agent}/${f.field}] ${f.issue}`),
    ].slice(0, 8);
    return NextResponse.json({
      ok: true, ready: false,
      reason: verdict.action === 'ask' ? 'review-needed' : 'verification-failed',
      detail: verdict.reasoning,
      action: verdict.action, confidence: verdict.confidence,
      dualAgent: { ...baseDualAgent, sample: blockers },
      elapsedMs: Date.now() - t0,
    });
  }

  // Ready — return success with the download URL for the client to fetch
  const downloadUrl = format === 'xlsx'
    ? `/api/analyses/${id}/export?format=xlsx`
    : `/api/insights/export-pdf`;  // POST endpoint — client must POST analysisId

  return NextResponse.json({
    ok: true, ready: true,
    action: verdict.action, confidence: verdict.confidence, reasoning: verdict.reasoning,
    downloadUrl, downloadMethod: format === 'pdf' ? 'POST' : 'GET',
    filename: `analysis-${id.slice(0, 8)}.${format}`,
    dualAgent: baseDualAgent,
    elapsedMs: Date.now() - t0,
  });
}
