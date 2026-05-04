/**
 * lib/uploads/handler.ts
 *
 * Handles Excel (.xlsx/.xls), CSV, and PDF file uploads.
 * Detects format (GWI, Keywords, Helium10, Google Trends, Konnect, Generic)
 * and stores parsed data in the appropriate DB tables.
 *
 * All inserts run inside a single transaction.
 */

import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import type { PoolClient } from 'pg';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

import { isGwiTimeSpentFormat } from '@/lib/gwi/detector';
import { tidyGwiTimeSpent }     from '@/lib/gwi/parser';
import { gwiDefaultChartSpecs } from '@/lib/gwi/charts';

import { isKeywordPlan }           from '@/lib/keywords/detector';
import { tidyKeywordPlan }         from '@/lib/keywords/parser';
import { keywordDefaultChartSpecs } from '@/lib/keywords/charts';

import { isHelium10Format, detectH10Variant } from '@/lib/helium10/detector';
import { parseHelium10 }                      from '@/lib/helium10/parser';

import { isGoogleTrendsFormat } from '@/lib/trends/detector';
import { parseGoogleTrends }    from '@/lib/trends/parser';

import { isKonnectFormat } from '@/lib/konnect/detector';
import { parseKonnect }    from '@/lib/konnect/parser';

import { parseGenericSheet } from '@/lib/generic/parser';
import { parsePdf }          from '@/lib/pdf/parser';

import type { UploadSummary, SheetMeta, SheetType } from '@/types/dataset';

// ── Bulk insert helpers ───────────────────────────────────────

async function bulkInsertGwi(
  client: PoolClient,
  rows: Awaited<ReturnType<typeof tidyGwiTimeSpent>>
) {
  if (rows.length === 0) return;
  const uploadIds     = rows.map(r => r.uploadId);
  const sheetNames    = rows.map(r => r.sheetName);
  const questionNames = rows.map(r => r.questionName);
  const questionMsgs  = rows.map(r => r.questionMessage);
  const timeBuckets   = rows.map(r => r.timeBucket);
  const audiences     = rows.map(r => r.audience);
  const audiencePcts  = rows.map(r => r.audiencePct ?? null);
  const dataPointPcts = rows.map(r => r.dataPointPct ?? null);
  const universes     = rows.map(r => r.universe ?? null);
  const indexScores   = rows.map(r => r.index ?? null);
  const responses     = rows.map(r => r.responses ?? null);

  await client.query(
    `INSERT INTO gwi_time_spent
       (upload_id, sheet_name, question_name, question_message,
        time_bucket, audience, audience_pct, data_point_pct,
        universe, index_score, responses)
     SELECT * FROM UNNEST(
       $1::uuid[], $2::text[], $3::text[], $4::text[],
       $5::text[], $6::text[], $7::numeric[], $8::numeric[],
       $9::numeric[], $10::numeric[], $11::numeric[]
     ) AS t(upload_id, sheet_name, question_name, question_message,
            time_bucket, audience, audience_pct, data_point_pct,
            universe, index_score, responses)`,
    [uploadIds, sheetNames, questionNames, questionMsgs,
     timeBuckets, audiences, audiencePcts, dataPointPcts,
     universes, indexScores, responses]
  );
}

async function bulkInsertKeywords(
  client: PoolClient,
  rows: Awaited<ReturnType<typeof tidyKeywordPlan>>
) {
  if (rows.length === 0) return;
  const uploadIds    = rows.map(r => r.uploadId);
  const sheetNames   = rows.map(r => r.sheetName);
  const keywords     = rows.map(r => r.keyword);
  const searches     = rows.map(r => r.avgMonthlySearches ?? null);
  const competitions = rows.map(r => r.competition ?? null);
  const compIndexed  = rows.map(r => r.competitionIndexed ?? null);
  const bidLows      = rows.map(r => r.bidLow ?? null);
  const bidHighs     = rows.map(r => r.bidHigh ?? null);
  const tiers        = rows.map(r => r.tier);
  const brands       = rows.map(r => r.brand ?? null);
  const categories   = rows.map(r => r.categories ?? null);
  const priceIntents = rows.map(r => r.isPriceIntent ?? false);

  await client.query(
    `INSERT INTO keywords
       (upload_id, sheet_name, keyword, avg_monthly_searches, competition,
        competition_indexed, bid_low, bid_high, tier, brand, categories, is_price_intent)
     SELECT * FROM UNNEST(
       $1::uuid[], $2::text[], $3::text[], $4::numeric[],
       $5::text[], $6::numeric[], $7::numeric[], $8::numeric[],
       $9::text[], $10::text[], $11::text[], $12::boolean[]
     ) AS t(upload_id, sheet_name, keyword, avg_monthly_searches, competition,
            competition_indexed, bid_low, bid_high, tier, brand, categories, is_price_intent)`,
    [uploadIds, sheetNames, keywords, searches, competitions,
     compIndexed, bidLows, bidHighs, tiers, brands, categories, priceIntents]
  );
}

async function bulkInsertToolData(
  client: PoolClient,
  rows: Array<{ uploadId: string; sheetName: string; toolType: string; rowData: Record<string, any> }>
) {
  if (rows.length === 0) return;
  // Batch in chunks of 500 to avoid parameter limits
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const uploadIds  = chunk.map(r => r.uploadId);
    const sheetNames = chunk.map(r => r.sheetName);
    const toolTypes  = chunk.map(r => r.toolType);
    const rowDatas   = chunk.map(r => JSON.stringify(r.rowData));
    await client.query(
      `INSERT INTO tool_data (upload_id, sheet_name, tool_type, row_data)
       SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::jsonb[])
       AS t(upload_id, sheet_name, tool_type, row_data)`,
      [uploadIds, sheetNames, toolTypes, rowDatas]
    );
  }
}

// ── Tool type label helper ───────────────────────────────────

function toolLabel(toolType: string): string {
  const MAP: Record<string, string> = {
    helium10_cerebro:  'Helium10 Cerebro',
    helium10_magnet:   'Helium10 Magnet',
    helium10_blackbox: 'Helium10 Black Box',
    helium10_generic:  'Helium10',
    google_trends:     'Google Trends',
    konnect_insights:  'Konnect Insights',
    pdf_extract:       'PDF Data',
    generic:           'Data',
  };
  return MAP[toolType] || 'Data';
}

// ── Raw CSV text parser (fallback when ExcelJS fails) ────────
/**
 * Parse a CSV buffer as plain text.
 * Handles UTF-8 BOM, Windows line endings, and quoted commas.
 * Returns an array of row objects keyed by header names.
 */
function parseRawCsv(buffer: Buffer): Array<Record<string, string>> {
  // Strip UTF-8 BOM (﻿) and normalise line endings
  const text  = buffer.toString('utf-8').replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQ  = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') {
        // Handle escaped quotes ("")
        if (inQ && line[ci + 1] === '"') { cur += '"'; ci++; }
        else { inQ = !inQ; }
      } else if (ch === ',' && !inQ) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = splitLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  if (headers.filter(Boolean).length < 2) return [];

  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '').trim(); });
    return obj;
  }).filter(obj => Object.values(obj).some(v => v !== ''));
}

// ── Excel/CSV handler ────────────────────────────────────────

async function handleExcelUpload(
  client: PoolClient,
  buffer: Buffer,
  filename: string,
  uploadId: string
): Promise<SheetMeta[]> {
  const workbook = new ExcelJS.Workbook();

  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'csv') {
    // Strip BOM before handing to ExcelJS — BOM confuses the CSV reader
    const cleanBuf = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
      ? buffer.subarray(3)
      : buffer;
    try {
      await workbook.csv.read(Readable.from(cleanBuf));
    } catch (csvErr) {
      logger.warn('upload:exceljs_csv_failed', { filename, error: (csvErr as Error).message });
      // Fall through — workbook will have 0 worksheets → raw CSV fallback kicks in
    }
  } else {
    await workbook.xlsx.load(buffer);
  }

  const sheetsMeta: SheetMeta[] = [];

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name;

    const sampleRows: ExcelJS.CellValue[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
      if (rowNumber <= 20) sampleRows.push(_row.values as ExcelJS.CellValue[]);
    });
    if (sampleRows.length === 0) continue;

    const col0    = sampleRows.map(r => String((r as any[])[1] || ''));
    let headers: string[] = [];
    for (const row of sampleRows) {
      const r = row as any[];
      if (r.filter(Boolean).length >= 2) {
        headers = r.map(c => String(c ?? ''));
        break;
      }
    }

    let type: SheetType = 'generic_table';
    let meta: Partial<SheetMeta> = { sheetName, type };

    if (isGwiTimeSpentFormat(col0, headers)) {
      // ── GWI ──
      type = 'gwi_time_spent';
      const rows = tidyGwiTimeSpent(uploadId, sheetName, worksheet);
      if (rows.length > 0) {
        await bulkInsertGwi(client, rows);
        meta = {
          sheetName, type,
          question:    rows[0].questionName,
          description: rows[0].questionMessage,
          chartSpecs:  gwiDefaultChartSpecs(rows[0].questionName),
        };
        logger.info('upload:gwi_sheet', { sheetName, rows: rows.length });
      }

    } else if (isKeywordPlan(headers)) {
      // ── Keywords ──
      type = 'keyword_plan';
      const rows = tidyKeywordPlan(uploadId, sheetName, worksheet);
      if (rows.length > 0) {
        await bulkInsertKeywords(client, rows);
        meta = { sheetName, type, chartSpecs: keywordDefaultChartSpecs() };
        logger.info('upload:kw_sheet', { sheetName, rows: rows.length });
      }

    } else if (isHelium10Format(headers)) {
      // ── Helium10 ──
      type = 'generic_table';
      const variant = detectH10Variant(headers);
      const rows = parseHelium10(uploadId, sheetName, worksheet, variant);
      if (rows.length > 0) {
        await bulkInsertToolData(client, rows);
        meta = {
          sheetName, type,
          question:    `${toolLabel(`helium10_${variant}`)} — ${sheetName}`,
          description: `${rows.length} rows from Helium10 ${variant} export`,
        };
        logger.info('upload:h10_sheet', { sheetName, variant, rows: rows.length });
      }

    } else if (isGoogleTrendsFormat(col0, headers)) {
      // ── Google Trends ──
      type = 'generic_table';
      const rows = parseGoogleTrends(uploadId, sheetName, worksheet);
      if (rows.length > 0) {
        await bulkInsertToolData(client, rows);
        meta = {
          sheetName, type,
          question:    `Google Trends — ${sheetName}`,
          description: `${rows.length} data points from Google Trends export`,
        };
        logger.info('upload:trends_sheet', { sheetName, rows: rows.length });
      }

    } else if (isKonnectFormat(headers)) {
      // ── Konnect Insights ──
      type = 'generic_table';
      const rows = parseKonnect(uploadId, sheetName, worksheet);
      if (rows.length > 0) {
        await bulkInsertToolData(client, rows);
        meta = {
          sheetName, type,
          question:    `Konnect Insights — ${sheetName}`,
          description: `${rows.length} rows from Konnect export`,
        };
        logger.info('upload:konnect_sheet', { sheetName, rows: rows.length });
      }

    } else if (headers.length > 0) {
      // ── Generic fallback — store any tabular data ──
      type = 'generic_table';
      const rows = parseGenericSheet(uploadId, sheetName, worksheet);
      if (rows.length > 0) {
        await bulkInsertToolData(client, rows);
        meta = {
          sheetName, type,
          question:    sheetName,
          description: `${rows.length} rows of tabular data`,
        };
        logger.info('upload:generic_sheet', { sheetName, rows: rows.length });
      }
    }

    // Include sheet if it has a meaningful question label set by any of the
    // parsers above, OR if it's still type 'generic_table' but had ≥1 row
    // (meta.question is set by all branches when rows > 0).
    if (meta.question) {
      sheetsMeta.push(meta as SheetMeta);
    }
  }

  // ── Raw CSV fallback ─────────────────────────────────────────
  // When ExcelJS returns 0 usable worksheets (BOM/encoding/delimiter issues),
  // parse the CSV as plain text so Gemini can still analyse it.
  if (sheetsMeta.length === 0 && ext === 'csv') {
    logger.info('upload:raw_csv_fallback', { filename });
    const rawRows = parseRawCsv(buffer);
    if (rawRows.length > 0) {
      const toolRows = rawRows.map(rowData => ({
        uploadId,
        sheetName: filename,
        toolType:  'generic' as const,
        rowData,
      }));
      try { await bulkInsertToolData(client, toolRows); } catch { /* best-effort */ }
      sheetsMeta.push({
        sheetName:   filename,
        type:        'generic_table',
        question:    filename.replace(/\.[^.]+$/, ''),
        description: `${rawRows.length} rows from ${filename}`,
      } as SheetMeta);
      logger.info('upload:raw_csv_fallback_ok', { filename, rows: rawRows.length });
    }
  }

  return sheetsMeta;
}

// ── PDF handler ──────────────────────────────────────────────

async function handlePdfUpload(
  client: PoolClient,
  buffer: Buffer,
  filename: string,
  uploadId: string
): Promise<SheetMeta[]> {
  const sheets = await parsePdf(uploadId, filename, buffer);
  const sheetsMeta: SheetMeta[] = [];

  for (const { sheetName, rows } of sheets) {
    if (rows.length === 0) continue;
    await bulkInsertToolData(client, rows);
    sheetsMeta.push({
      sheetName,
      type: 'generic_table',
      question: `PDF — ${sheetName}`,
      description: `${rows.length} rows extracted from PDF`,
    } as SheetMeta);
    logger.info('upload:pdf_sheet', { sheetName, rows: rows.length });
  }

  return sheetsMeta;
}

// ── Main handler ─────────────────────────────────────────────

export async function handleUpload(
  buffer: Buffer,
  filename: string,
  briefId?: string | null,
  userId?: string | null,
  slaHours?: number | null,
): Promise<UploadSummary> {
  const t0       = Date.now();
  const uploadId = crypto.randomUUID();
  const ext      = filename.split('.').pop()?.toLowerCase() ?? '';

  const sheetsMeta: SheetMeta[] = [];

  // Calculate SLA due time if slaHours is provided
  let slaDueAt: Date | null = null;
  if (slaHours && slaHours > 0) {
    slaDueAt = new Date(Date.now() + slaHours * 3600000);
  }

  // ── 1. Insert uploads record FIRST so bulk inserts can satisfy FK ─
  // tool_data, gwi_time_spent, keywords all reference uploads(id).
  // If we parse first and insert uploads after, the FK constraint fires
  // and db.query swallows the error silently — data is lost.
  await db.query(
    'INSERT INTO uploads (id, filename, brief_id, user_id, sla_hours, sla_due_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [uploadId, filename, briefId ?? null, userId ?? null, slaHours ?? null, slaDueAt ?? null]
  );

  // ── 2. Now parse + bulk insert (FK is satisfied) ─────────────────
  if (ext === 'pdf') {
    const sheets = await handlePdfUpload(db as any, buffer, filename, uploadId);
    sheetsMeta.push(...sheets);
  } else {
    const sheets = await handleExcelUpload(db as any, buffer, filename, uploadId);
    sheetsMeta.push(...sheets);
  }

  // ── 3. Update brief status if linked to a brief ───────────────────
  if (briefId) {
    const params: any[] = [briefId];
    let where = `id = $1 AND status = 'waiting_for_data'`;
    if (userId) { params.push(userId); where += ` AND user_id = $${params.length}`; }
    await db.query(`UPDATE briefs SET status = 'processing' WHERE ${where}`, params);
  }

  // ── Last-resort raw text ─────────────────────────────────────
  // If structured parsing still returned nothing, include the raw file text so
  // the upload page can route it directly to Gemini text/PDF analysis.
  let rawText: string | undefined;
  if (sheetsMeta.length === 0) {
    if (ext === 'csv' || ext === 'xlsx' || ext === 'xls') {
      // For CSV just decode; for Excel convert to CSV-like text via ExcelJS
      if (ext === 'csv') {
        rawText = buffer.toString('utf-8').replace(/^﻿/, '').slice(0, 40000);
      } else {
        // Best-effort: read all cells as tab-separated text
        try {
          const wb2 = new ExcelJS.Workbook();
          await wb2.xlsx.load(buffer);
          const lines: string[] = [];
          wb2.worksheets.forEach(ws => {
            ws.eachRow({ includeEmpty: false }, row => {
              lines.push((row.values as any[]).slice(1).map(c => String(c ?? '')).join('\t'));
            });
          });
          rawText = lines.slice(0, 2000).join('\n');
        } catch { /* ignore */ }
      }
    }
    logger.warn('upload:no_structured_sheets', { filename, hasRawText: !!rawText });
  }

  logger.info('upload:done', {
    uploadId, filename, briefId: briefId ?? null, sheets: sheetsMeta.length, ms: Date.now() - t0,
  });

  return { uploadId, sheets: sheetsMeta, rawText };
}
