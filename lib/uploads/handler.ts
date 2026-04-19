import ExcelJS from 'exceljs';
import { db } from '@/lib/db/client';
import { isGwiTimeSpentFormat } from '@/lib/gwi/detector';
import { tidyGwiTimeSpent } from '@/lib/gwi/parser';
import { gwiDefaultChartSpecs } from '@/lib/gwi/charts';
import { isKeywordPlan } from '@/lib/keywords/detector';
import { tidyKeywordPlan } from '@/lib/keywords/parser';
import { keywordDefaultChartSpecs } from '@/lib/keywords/charts';
import type { UploadSummary, SheetMeta, SheetType } from '@/types/dataset';

export async function handleUpload(buffer: Buffer, filename: string): Promise<UploadSummary> {
  const uploadId = crypto.randomUUID();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  // 1. Record the upload
  await db.query('INSERT INTO uploads (id, filename) VALUES ($1, $2)', [uploadId, filename]);

  const sheetsMeta: SheetMeta[] = [];

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name;
    
    // Extract first 20 rows for detection
    const sampleRows: any[] = [];
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= 20) sampleRows.push(row.values);
    });

    if (sampleRows.length === 0) continue;

    const col0 = sampleRows.map(r => String(r[1] || ''));
    
    // Find header row for detection
    let headers: string[] = [];
    for (const row of sampleRows) {
      if (row.filter((c: any) => c).length > 2) {
        headers = row.map((c: any) => String(c || ''));
        break;
      }
    }

    let type: SheetType = 'generic_table';
    let meta: Partial<SheetMeta> = { sheetName, type };

    if (isGwiTimeSpentFormat(col0, headers)) {
      type = 'gwi_time_spent';
      const rows = tidyGwiTimeSpent(uploadId, sheetName, worksheet);
      if (rows.length > 0) {
        // Bulk Insert into gwi_time_spent
        // Antigravity optimization: Use a single transaction or prepared statement logic
        for (const r of rows) {
          await db.query(
            `INSERT INTO gwi_time_spent 
             (upload_id, sheet_name, question_name, question_message, time_bucket, audience, audience_pct, data_point_pct, universe, index_score, responses)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [uploadId, sheetName, r.questionName, r.questionMessage, r.timeBucket, r.audience, r.audiencePct, r.dataPointPct, r.universe, r.index, r.responses]
          );
        }
        meta = {
          sheetName,
          type,
          question: rows[0].questionName,
          description: rows[0].questionMessage,
          chartSpecs: gwiDefaultChartSpecs(rows[0].questionName)
        };
      }
    } else if (isKeywordPlan(headers)) {
      type = 'keyword_plan';
      const rows = tidyKeywordPlan(uploadId, sheetName, worksheet);
      if (rows.length > 0) {
        for (const r of rows) {
          await db.query(
            `INSERT INTO keywords 
             (upload_id, sheet_name, keyword, avg_monthly_searches, competition, competition_indexed, bid_low, bid_high, tier, brand, categories, is_price_intent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [uploadId, r.sheetName, r.keyword, r.avgMonthlySearches, r.competition, r.competitionIndexed, r.bidLow, r.bidHigh, r.tier, r.brand, r.categories, r.isPriceIntent]
          );
        }
        meta = {
          sheetName,
          type,
          chartSpecs: keywordDefaultChartSpecs()
        };
      }
    }

    if (type !== 'generic_table') {
      sheetsMeta.push(meta as SheetMeta);
    }
  }

  return { uploadId, sheets: sheetsMeta };
}
