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
import { db, getPool } from '@/lib/db/client';
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

// ── Auto-migration (runs once per cold start) ─────────────────
// Ensures tool_data table and optional uploads columns exist even if
// init_db.mjs was never run against the production database.
// Uses a single fast existence-check then one batched SQL call so the
// overhead is at most 2 round-trips total, not 7.
let _migrationDone = false;
async function ensureSchema(): Promise<void> {
  if (_migrationDone) return;
  _migrationDone = true;

  // Fast pre-check: probe tool_data directly.
  // NOTE: information_schema returns empty through pgBouncer transaction pooler
  // so we use a direct SELECT probe instead.
  // IMPORTANT: db.query silently catches errors and returns { rows:[], rowCount:0, fields:[] }
  // so we cannot rely on rowCount (it's 0 both when table exists with LIMIT 0 AND when there's an error).
  // Instead we check fields.length — on a successful query fields has at least 1 entry;
  // on a silently-caught error the fallback returns fields:[].
  const check = await db.query(`SELECT 1 AS ok FROM tool_data LIMIT 0`);
  if (check.fields && check.fields.length > 0) return; // table exists, schema is up to date

  // Run independent column additions in parallel (no FK deps between them)
  await Promise.allSettled([
    db.query(`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES users(id)   ON DELETE CASCADE`),
    db.query(`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS brief_id   UUID REFERENCES briefs(id)  ON DELETE SET NULL`),
    db.query(`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS sla_hours  INTEGER`),
    db.query(`ALTER TABLE uploads ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP WITH TIME ZONE`),
  ]);

  // Create tool_data (depends on uploads existing — must run after ALTER TABLE above)
  await db.query(`
    CREATE TABLE IF NOT EXISTS tool_data (
      id          SERIAL PRIMARY KEY,
      upload_id   UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
      sheet_name  TEXT NOT NULL,
      tool_type   TEXT NOT NULL DEFAULT 'generic',
      row_data    JSONB NOT NULL,
      created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Indexes can run in parallel after table exists
  await Promise.allSettled([
    db.query(`CREATE INDEX IF NOT EXISTS idx_tool_data_upload       ON tool_data(upload_id)`),
    db.query(`CREATE INDEX IF NOT EXISTS idx_tool_data_upload_sheet ON tool_data(upload_id, sheet_name)`),
  ]);

  logger.info('upload:schema_migrated');
}

// ── Bulk insert helpers ───────────────────────────────────────
// These functions use getPool().query() directly so that errors THROW
// instead of being silently swallowed by the db.query() wrapper.
// The caller (handleExcelUpload) must wrap calls in try/catch if partial
// failures are acceptable — for now we let errors propagate so they are
// visible in logs.

async function bulkInsertGwi(
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

  await getPool().query(
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

  await getPool().query(
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
    // Sanitise each rowData value: replace undefined/NaN/Infinity with null so
    // JSON.stringify always produces valid JSONB-castable strings.
    const rowDatas = chunk.map(r => JSON.stringify(r.rowData, (_k, v) => {
      if (v === undefined || (typeof v === 'number' && !isFinite(v))) return null;
      return v;
    }));
    await getPool().query(
      `INSERT INTO tool_data (upload_id, sheet_name, tool_type, row_data)
       SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::jsonb[])
       AS t(upload_id, sheet_name, tool_type, row_data)`,
      [uploadIds, sheetNames, toolTypes, rowDatas]
    );
  }
}

// ── GWI Core detector & parser ───────────────────────────────
// GWI Core exports (Attitude & Lifestyle, Messaging Apps, TV & Streaming,
// Internet Usage, etc.) use a 2-row compound header:
//   Row N  : ["","","Audience %","Data point %","Universe","Index","Responses"]
//   Row N+1: ["Short Label Question","Attributes","Segment","Segment",...]
// parseGenericSheet picks Row N as headers (first row with ≥2 non-empty cells),
// causing "Short Label Question" and "Attributes" to be dropped, which breaks
// Gemini's ability to group insights by question.
// This dedicated parser merges both header rows to produce:
//   { "Short Label Question": "...", "Attributes": "...", "Audience %": 59.9, ... }

function detectGwiCoreHeaderRows(allRows: any[][]): { columnRowIdx: number } | null {
  for (let i = 0; i < Math.min(12, allRows.length); i++) {
    const vals = (allRows[i] || []).map((v: any) => String(v ?? '').trim().toLowerCase());
    const hasQuestion = vals.some(v =>
      v === 'short label question' || v === 'question name' || v === 'question');
    const hasAttribs  = vals.some(v => v === 'attributes' || v === 'attribute');
    if (hasQuestion && hasAttribs) return { columnRowIdx: i };
  }
  return null;
}

function parseGwiCore(
  uploadId: string,
  sheetName: string,
  worksheet: ExcelJS.Worksheet
): Array<{ uploadId: string; sheetName: string; toolType: string; rowData: Record<string, any> }> {
  const allRows: any[][] = [];
  worksheet.eachRow({ includeEmpty: false }, row => allRows.push(row.values as any[]));

  const detected = detectGwiCoreHeaderRows(allRows);
  if (!detected) return [];

  const { columnRowIdx } = detected;
  const columnRow = (allRows[columnRowIdx] || []) as any[];  // Short Label Question, Attributes, Segment...
  const metricRow = columnRowIdx > 0 ? (allRows[columnRowIdx - 1] || []) as any[] : []; // Audience %, ...

  // Build merged column names:
  //   - If metricRow[idx] has a value (Audience %, Data point %, ...) → use it
  //   - Else use columnRow[idx] (Short Label Question, Attributes)
  const headers = columnRow.map((v: any, idx: number) => {
    const metric = String(metricRow[idx] ?? '').trim();
    const col    = String(v ?? '').trim();
    return metric || col; // metric names take priority for cols 3+
  });

  const result: Array<{ uploadId: string; sheetName: string; toolType: string; rowData: Record<string, any> }> = [];
  for (let i = columnRowIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    const obj: Record<string, any> = {};
    headers.forEach((h: string, idx: number) => {
      if (!h) return;
      const raw = row[idx];
      // Convert ExcelJS special objects (RichText, Hyperlink) to plain values
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        if ('richText' in raw) { obj[h] = (raw as any).richText?.map((r: any) => r.text).join('') ?? null; return; }
        if ('text' in raw)     { obj[h] = (raw as any).text ?? null; return; }
        if ('result' in raw)   { obj[h] = (raw as any).result ?? null; return; }
      }
      obj[h] = raw ?? null;
    });
    const nonEmpty = Object.values(obj).filter(v => v != null && v !== '').length;
    if (nonEmpty < 2) continue;
    result.push({ uploadId, sheetName, toolType: 'gwi_core', rowData: obj });
  }
  return result;
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
 * Decode a CSV/TSV buffer to a UTF-8 string.
 * Handles UTF-8 BOM (EF BB BF) and UTF-16 LE BOM (FF FE).
 */
function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    // UTF-16 LE — strip 2-byte BOM then decode
    return buffer.slice(2).toString('utf16le');
  }
  // UTF-8 (strip optional BOM ﻿)
  return buffer.toString('utf-8').replace(/^﻿/, '');
}

/**
 * Detect whether text is tab- or comma-separated.
 * Checks up to the first 10 non-empty lines and picks whichever
 * delimiter appears more frequently across those lines.
 * Handles files with metadata rows before the real header (e.g. Google
 * Keyword Planner exports that start with a title and date-range row).
 */
function detectDelimiter(text: string): string {
  const lines = text.split('\n').filter(l => l.trim().length > 0).slice(0, 10);
  let tabs = 0, commas = 0;
  for (const line of lines) {
    tabs   += (line.match(/\t/g) ?? []).length;
    commas += (line.match(/,/g)  ?? []).length;
  }
  return tabs > commas ? '\t' : ',';
}

/**
 * Parse a CSV/TSV buffer as plain text.
 * Handles UTF-8 BOM, UTF-16 LE BOM, Windows line endings, tab-separated files,
 * and metadata rows before the actual header (e.g. Google Keyword Planner exports).
 * Returns an array of row objects keyed by header names.
 */
function parseRawCsv(buffer: Buffer): Array<Record<string, string>> {
  const text  = decodeCsvBuffer(buffer).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Detect delimiter by scanning up to 10 lines (handles metadata rows before real header)
  const delim = detectDelimiter(text);

  const splitLine = (line: string): string[] => {
    if (delim === '\t') return line.split('\t').map(v => v.replace(/^"|"$/g, '').trim());
    // Comma-split with quoted-field support
    const result: string[] = [];
    let cur = '';
    let inQ  = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (ch === '"') {
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

  // Find actual header row: first row that has ≥2 non-empty values after splitting
  // (skips metadata rows like "Keyword Stats 2026-04-29…" or date-range lines)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(6, lines.length); i++) {
    const vals = splitLine(lines[i]);
    if (vals.filter(Boolean).length >= 2) { headerIdx = i; break; }
  }

  const headers = splitLine(lines[headerIdx]).map(h => h.replace(/^"|"$/g, '').trim());
  if (headers.filter(Boolean).length < 2) return [];

  return lines.slice(headerIdx + 1).map(line => {
    const vals = splitLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (h) obj[h] = (vals[i] ?? '').replace(/^"|"$/g, '').trim(); });
    return obj;
  }).filter(obj => Object.values(obj).some(v => v !== ''));
}

// ── Excel/CSV handler ────────────────────────────────────────

async function handleExcelUpload(
  buffer: Buffer,
  filename: string,
  uploadId: string
): Promise<SheetMeta[]> {
  const workbook = new ExcelJS.Workbook();

  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'csv') {
    // Decode UTF-16 LE or strip UTF-8 BOM, then detect delimiter.
    // ExcelJS needs a UTF-8 buffer + explicit delimiter or it silently garbles the data.
    const decoded   = decodeCsvBuffer(buffer);
    const delimiter = detectDelimiter(decoded);
    const cleanBuf  = Buffer.from(decoded, 'utf-8');
    try {
      await workbook.csv.read(Readable.from(cleanBuf), {
        parserOptions: { delimiter },
      });
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

    // ── Read all rows once for GWI Core detection ─────────────────────────
    const allRowsForDetect: any[][] = [];
    worksheet.eachRow({ includeEmpty: false }, row => {
      if (allRowsForDetect.length < 15) allRowsForDetect.push(row.values as any[]);
    });
    const gwiCoreInfo = detectGwiCoreHeaderRows(allRowsForDetect);

    if (gwiCoreInfo) {
      // ── GWI Core (Attitude & Lifestyle, Messaging Apps, etc.) ──
      // Has compound 2-row header: metric names (Audience %, ...) above
      // column names (Short Label Question, Attributes, ...)
      type = 'generic_table';
      const rows = parseGwiCore(uploadId, sheetName, worksheet);
      if (rows.length > 0) {
        await bulkInsertToolData(rows);
        meta = {
          sheetName, type,
          question:    `GWI — ${sheetName}`,
          description: `${rows.length} rows from GWI Core export`,
        };
        logger.info('upload:gwi_core_sheet', { sheetName, rows: rows.length });
      }

    } else if (isGwiTimeSpentFormat(col0, headers)) {
      // ── GWI Time Spent ──
      type = 'gwi_time_spent';
      const rows = tidyGwiTimeSpent(uploadId, sheetName, worksheet);
      if (rows.length > 0) {
        await bulkInsertGwi(rows);
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
        await bulkInsertKeywords(rows);
        meta = { sheetName, type, chartSpecs: keywordDefaultChartSpecs() };
        logger.info('upload:kw_sheet', { sheetName, rows: rows.length });
      }

    } else if (isHelium10Format(headers)) {
      // ── Helium10 ──
      type = 'generic_table';
      const variant = detectH10Variant(headers);
      const rows = parseHelium10(uploadId, sheetName, worksheet, variant);
      if (rows.length > 0) {
        await bulkInsertToolData(rows);
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
        await bulkInsertToolData(rows);
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
        await bulkInsertToolData(rows);
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
        await bulkInsertToolData(rows);
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
      try { await bulkInsertToolData(toolRows); } catch { /* best-effort */ }
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
  buffer: Buffer,
  filename: string,
  uploadId: string
): Promise<SheetMeta[]> {
  const sheets = await parsePdf(uploadId, filename, buffer);
  const sheetsMeta: SheetMeta[] = [];

  for (const { sheetName, rows } of sheets) {
    if (rows.length === 0) continue;
    await bulkInsertToolData(rows);
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

  // Ensure schema is up to date before any DB operations
  await ensureSchema();

  const sheetsMeta: SheetMeta[] = [];

  // Calculate SLA due time if slaHours is provided
  let slaDueAt: Date | null = null;
  if (slaHours && slaHours > 0) {
    slaDueAt = new Date(Date.now() + slaHours * 3600000);
  }

  // ── 1. Insert uploads record FIRST so bulk inserts can satisfy FK ─
  // tool_data, gwi_time_spent, keywords all reference uploads(id).
  // We try the full INSERT (with optional columns) first.  If it returns
  // rowCount=0 (db.query silently caught a "column does not exist" error
  // because the migration hasn't run yet), fall back to the minimal INSERT
  // that works on every schema version, then UPDATE optional columns.
  const fullIns = await db.query(
    `INSERT INTO uploads (id, filename, brief_id, user_id, sla_hours, sla_due_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO NOTHING`,
    [uploadId, filename, briefId ?? null, userId ?? null, slaHours ?? null, slaDueAt ?? null]
  );

  if (!fullIns.rowCount) {
    // Minimal INSERT — works even on the original schema (id + filename only)
    await db.query(
      `INSERT INTO uploads (id, filename) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [uploadId, filename]
    );
    // Best-effort UPDATE of optional columns (silently skipped if cols missing)
    await db.query(
      `UPDATE uploads SET user_id = $2, brief_id = $3 WHERE id = $1`,
      [uploadId, userId ?? null, briefId ?? null]
    );
    logger.warn('upload:fallback_minimal_insert', { uploadId, filename });
  }

  // ── 2. Now parse + bulk insert (FK is satisfied) ─────────────────
  if (ext === 'pdf') {
    const sheets = await handlePdfUpload(buffer, filename, uploadId);
    sheetsMeta.push(...sheets);
  } else {
    const sheets = await handleExcelUpload(buffer, filename, uploadId);
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
