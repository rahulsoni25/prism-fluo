/**
 * lib/uploads/handler.ts
 *
 * Performance fix: replaced row-by-row INSERTs (1 query per row) with
 * UNNEST-based bulk inserts (1 query per table per sheet).
 * For a 500-row GWI file × 5 audiences = 2 500 rows → was 2 500 round trips,
 * now 1 round trip. Expected speedup: 20-100×.
 *
 * All inserts for a single upload run inside one transaction so the DB is
 * never left in a partially-written state.
 */

import ExcelJS from 'exceljs';
import type { PoolClient } from 'pg';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { isGwiTimeSpentFormat } from '@/lib/gwi/detector';
import { tidyGwiTimeSpent } from '@/lib/gwi/parser';
import { gwiDefaultChartSpecs } from '@/lib/gwi/charts';
import { isKeywordPlan } from '@/lib/keywords/detector';
import { tidyKeywordPlan } from '@/lib/keywords/parser';
import { keywordDefaultChartSpecs } from '@/lib/keywords/charts';
import type { UploadSummary, SheetMeta, SheetType } from '@/types/dataset';

// ── Bulk insert helpers ───────────────────────────────────────

async function bulkInsertGwi(
  client: PoolClient,
  rows: Awaited<ReturnType<typeof tidyGwiTimeSpent>>
) {
  if (rows.length === 0) return;

  // Build parallel arrays — one value per column
  const uploadIds       = rows.map(r => r.uploadId);
  const sheetNames      = rows.map(r => r.sheetName);
  const questionNames   = rows.map(r => r.questionName);
  const questionMsgs    = rows.map(r => r.questionMessage);
  const timeBuckets     = rows.map(r => r.timeBucket);
  const audiences       = rows.map(r => r.audience);
  const audiencePcts    = rows.map(r => r.audiencePct ?? null);
  const dataPointPcts   = rows.map(r => r.dataPointPct ?? null);
  const universes       = rows.map(r => r.universe ?? null);
  const indexScores     = rows.map(r => r.index ?? null);
  const responses       = rows.map(r => r.responses ?? null);

  await client.query(
    `INSERT INTO gwi_time_spent
       (upload_id, sheet_name, question_name, question_message,
        time_bucket, audience, audience_pct, data_point_pct,
        universe, index_score, responses)
     SELECT * FROM UNNEST(
       $1::uuid[],  $2::text[],  $3::text[],  $4::text[],
       $5::text[],  $6::text[],  $7::numeric[], $8::numeric[],
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

  const uploadIds     = rows.map(r => r.uploadId);
  const sheetNames    = rows.map(r => r.sheetName);
  const keywords      = rows.map(r => r.keyword);
  const searches      = rows.map(r => r.avgMonthlySearches ?? null);
  const competitions  = rows.map(r => r.competition ?? null);
  const compIndexed   = rows.map(r => r.competitionIndexed ?? null);
  const bidLows       = rows.map(r => r.bidLow ?? null);
  const bidHighs      = rows.map(r => r.bidHigh ?? null);
  const tiers         = rows.map(r => r.tier);
  const brands        = rows.map(r => r.brand ?? null);
  const categories    = rows.map(r => r.categories ?? null);
  const priceIntents  = rows.map(r => r.isPriceIntent ?? false);

  await client.query(
    `INSERT INTO keywords
       (upload_id, sheet_name, keyword, avg_monthly_searches, competition,
        competition_indexed, bid_low, bid_high, tier, brand, categories, is_price_intent)
     SELECT * FROM UNNEST(
       $1::uuid[],   $2::text[],    $3::text[],    $4::numeric[],
       $5::text[],   $6::numeric[], $7::numeric[],  $8::numeric[],
       $9::text[],   $10::text[],   $11::text[],    $12::boolean[]
     ) AS t(upload_id, sheet_name, keyword, avg_monthly_searches, competition,
            competition_indexed, bid_low, bid_high, tier, brand, categories, is_price_intent)`,
    [uploadIds, sheetNames, keywords, searches, competitions,
     compIndexed, bidLows, bidHighs, tiers, brands, categories, priceIntents]
  );
}

// ── Main handler ─────────────────────────────────────────────

export async function handleUpload(
  buffer: Uint8Array,
  filename: string
): Promise<UploadSummary> {
  const t0 = Date.now();
  const uploadId = crypto.randomUUID();

  const workbook = new ExcelJS.Workbook();
  // Re-wrap as plain Buffer so ExcelJS (which uses older Node types) accepts it
  await workbook.xlsx.load(Buffer.from(buffer));

  const sheetsMeta: SheetMeta[] = [];

  await db.transaction(async (client) => {
    // 1. Register the upload
    await client.query(
      'INSERT INTO uploads (id, filename) VALUES ($1, $2)',
      [uploadId, filename]
    );

    for (const worksheet of workbook.worksheets) {
      const sheetName = worksheet.name;

      // Extract first 20 rows for type detection
      const sampleRows: ExcelJS.CellValue[][] = [];
      worksheet.eachRow({ includeEmpty: false }, (_row, rowNumber) => {
        if (rowNumber <= 20) sampleRows.push(_row.values as ExcelJS.CellValue[]);
      });

      if (sampleRows.length === 0) continue;

      const col0 = sampleRows.map(r => String((r as any[])[1] || ''));

      // Find first row with >2 non-empty cells as the header candidate
      let headers: string[] = [];
      for (const row of sampleRows) {
        const r = row as any[];
        if (r.filter(Boolean).length > 2) {
          headers = r.map(c => String(c ?? ''));
          break;
        }
      }

      let type: SheetType = 'generic_table';
      let meta: Partial<SheetMeta> = { sheetName, type };

      if (isGwiTimeSpentFormat(col0, headers)) {
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
        type = 'keyword_plan';
        const rows = tidyKeywordPlan(uploadId, sheetName, worksheet);
        if (rows.length > 0) {
          await bulkInsertKeywords(client, rows);
          meta = {
            sheetName, type,
            chartSpecs: keywordDefaultChartSpecs(),
          };
          logger.info('upload:kw_sheet', { sheetName, rows: rows.length });
        }
      }

      if (type !== 'generic_table') {
        sheetsMeta.push(meta as SheetMeta);
      }
    }
  });

  logger.info('upload:done', {
    uploadId, filename, sheets: sheetsMeta.length, ms: Date.now() - t0,
  });

  return { uploadId, sheets: sheetsMeta };
}
