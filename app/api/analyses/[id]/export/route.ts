/**
 * GET /api/analyses/[id]/export?format=xlsx
 *
 * Streams the analysis results as an Excel workbook. Uses exceljs
 * (already a runtime dep). Owner-checked — 404 on mis-owned.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

function safeStr(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { rows } = await db.query(
    'SELECT id, sheet_name, filename, results_json, created_at FROM analyses WHERE id = $1 AND user_id = $2',
    [id, session.userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const analysis = rows[0];
  const results  = analysis.results_json || {};
  const charts   = Array.isArray(results.charts) ? results.charts : [];

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PRISM';
  wb.created = new Date();

  // Sheet 1 — one row per insight card
  const sheet = wb.addWorksheet('Insights', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: '#',              key: 'idx',         width: 4  },
    { header: 'Bucket',         key: 'bucket',      width: 14 },
    { header: 'Source',         key: 'source',      width: 18 },
    { header: 'Confidence',     key: 'conviction',  width: 12 },
    { header: 'Title',          key: 'title',       width: 60 },
    { header: 'Observation',    key: 'obs',         width: 80 },
    { header: 'Stat',           key: 'stat',        width: 50 },
    { header: 'Recommendation', key: 'rec',         width: 80 },
    { header: 'Chart Labels',   key: 'chartLabels', width: 50 },
    { header: 'Chart Values',   key: 'chartValues', width: 50 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2FF' } };

  charts.forEach((c: any, i: number) => {
    const labels = c.computedChartData?.labels ?? c.chartLabels ?? [];
    const data   = c.computedChartData?.datasets?.[0]?.data ?? c.chartValues ?? [];
    sheet.addRow({
      idx:         i + 1,
      bucket:      c.bucket ?? '',
      source:      c.toolLabel ?? c.source ?? '',
      conviction:  c.conviction ? `${c.conviction}%` : '',
      title:       safeStr(c.title),
      obs:         safeStr(c.obs),
      stat:        safeStr(c.stat),
      rec:         safeStr(c.rec),
      chartLabels: Array.isArray(labels) ? labels.map(String).join(' | ') : '',
      chartValues: Array.isArray(data)   ? data.map(String).join(' | ')   : '',
    });
  });
  sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum > 1) row.alignment = { wrapText: true, vertical: 'top' };
  });

  // Sheet 2 — meta
  const meta = wb.addWorksheet('Meta');
  meta.columns = [
    { header: 'Field', key: 'k', width: 20 },
    { header: 'Value', key: 'v', width: 80 },
  ];
  meta.getRow(1).font = { bold: true };
  meta.addRows([
    { k: 'Title',          v: analysis.sheet_name ?? '' },
    { k: 'Source File(s)', v: analysis.filename ?? '' },
    { k: 'Generated',      v: new Date(analysis.created_at).toISOString() },
    { k: 'Insight Count',  v: charts.length },
    { k: 'Domain',         v: results?.meta?.domain ?? '' },
    { k: 'Sources',        v: Array.isArray(results?.meta?.sources) ? results.meta.sources.join(', ') : '' },
  ]);

  const buf = await wb.xlsx.writeBuffer();
  const safeName = (analysis.sheet_name || 'prism-insights').replace(/[^a-z0-9-]+/gi, '_').slice(0, 60);

  return new NextResponse(buf as any, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}.xlsx"`,
      'Cache-Control':       'no-store',
    },
  });
}
