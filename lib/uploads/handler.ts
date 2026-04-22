import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { db } from '@/lib/db/client';
import { isGwiTimeSpentFormat } from '@/lib/gwi/detector';
import { tidyGwiTimeSpent } from '@/lib/gwi/parser';
import { gwiDefaultChartSpecs } from '@/lib/gwi/charts';
import { isKeywordPlan } from '@/lib/keywords/detector';
import { tidyKeywordPlan } from '@/lib/keywords/parser';
import { keywordDefaultChartSpecs } from '@/lib/keywords/charts';
import type { UploadSummary, SheetMeta, SheetType } from '@/types/dataset';

export async function handleUpload(buffer: any, filename: string, sessionId: string | null = null): Promise<UploadSummary> {
  const uploadId = crypto.randomUUID();
  const activeSessionId = sessionId || crypto.randomUUID();
  
  // 0. Ensure session exists (idempotent)
  await db.query('INSERT OR IGNORE INTO sessions (id, name) VALUES ($1, $2)', [activeSessionId, `Strategic Brief: ${filename}`]);


  const isCsv = filename.toLowerCase().endsWith('.csv');
  
  let worksheets: any[] = [];
  if (isCsv) {
    // CSV Path
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    // Create a mock worksheet object compatible with the existing logic
    worksheets.push({
      name: sheetName,
      eachRow: (options: any, callback: any) => {
        rows.forEach((r: any, i: number) => {
          callback({ values: [null, ...r], number: i + 1 }, i + 1);
        });
      },
      rowCount: rows.length
    });
  } else {
    // XLSX Path
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    worksheets = workbook.worksheets;
  }
  
  // 1. Record the upload
  await db.query('INSERT INTO uploads (id, session_id, filename) VALUES ($1, $2, $3)', [uploadId, activeSessionId, filename]);


  const sheetsMeta: SheetMeta[] = [];

  for (const worksheet of worksheets) {
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
        // BULK INSERT — single transaction, prepared statement (100x faster)
        const allParams = rows.map(r => [
          uploadId, sheetName, r.questionName, r.questionMessage, r.timeBucket, 
          r.audience, r.audiencePct, r.dataPointPct, r.universe, r.index, r.responses
        ]);
        await db.bulkInsert(
          `INSERT INTO gwi_time_spent 
           (upload_id, sheet_name, question_name, question_message, time_bucket, audience, audience_pct, data_point_pct, universe, index_score, responses)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          allParams
        );
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
        // BULK INSERT — single transaction, prepared statement (100x faster)
        const allParams = rows.map(r => [
          uploadId, r.sheetName, r.keyword, r.avgMonthlySearches, r.competition, 
          r.competitionIndexed, r.bidLow, r.bidHigh, r.tier, r.brand, r.categories, r.isPriceIntent
        ]);
        await db.bulkInsert(
          `INSERT INTO keywords 
           (upload_id, sheet_name, keyword, avg_monthly_searches, competition, competition_indexed, bid_low, bid_high, tier, brand, categories, is_price_intent)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          allParams
        );
        meta = {
          sheetName,
          type,
          chartSpecs: keywordDefaultChartSpecs()
        };
      }
    }

    if (type !== 'generic_table') {
      sheetsMeta.push(meta as SheetMeta);
      
      // -- SEMANTIC LAYER INTEGRATION --
      try {
        const { inferSchema, classifyDataset } = await import('@/lib/inference');
        
        // Convert worksheet rows to objects for inference
        const rowsForInference = [];
        const h = headers;
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber > 1 && rowNumber <= 100) {
            const obj = {};
            h.forEach((header, i) => { obj[header] = row.values[i+1]; });
            rowsForInference.push(obj);
          }
        });

        const schema = inferSchema(rowsForInference);
        const semantic = classifyDataset(rowsForInference, schema);
        
        await db.query(
          `INSERT INTO datasets 
           (dataset_id, upload_id, sheet_name, source, topic, geography, period, metric_type, grain, primary_keys, entities)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            `${uploadId}:${sheetName}`, 
            uploadId, 
            sheetName, 
            semantic.source, 
            semantic.topic, 
            semantic.geography, 
            semantic.period, 
            semantic.metricType, 
            semantic.grain, 
            JSON.stringify(semantic.primaryKeys),
            JSON.stringify(semantic.entities)
          ]
        );
      } catch (err) {
        console.error('⚠️ Semantic metadata error:', err.message);
      }
    } else {
      // Register generic tables in datasets too for synthesis
      try {
        const { inferSchema, classifyDataset } = await import('@/lib/inference');

        // Collect rows for inference (same logic as the known-type branch)
        const rowsForInference: any[] = [];
        const h = headers;
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber > 1 && rowNumber <= 100) {
            const obj: any = {};
            h.forEach((header, i) => { obj[header] = row.values[i+1]; });
            rowsForInference.push(obj);
          }
        });

        if (rowsForInference.length === 0) continue;

        const schema = inferSchema(rowsForInference);
        const semantic = classifyDataset(rowsForInference, schema);
        await db.query(
          `INSERT INTO datasets 
           (dataset_id, upload_id, sheet_name, source, topic, geography, period, metric_type, grain, primary_keys, entities)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            `${uploadId}:${sheetName}`, uploadId, sheetName, semantic.source, semantic.topic, 
            semantic.geography, semantic.period, semantic.metricType, semantic.grain, 
            JSON.stringify(semantic.primaryKeys), JSON.stringify(semantic.entities)
          ]
        );

        // Store ALL rows in generic_data for LLM profiling
        const allGenericRows: any[] = [];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber > 1) {
            const rowObj: any = {};
            h.forEach((header, i) => { rowObj[header] = row.values[i+1]; });
            allGenericRows.push([uploadId, sheetName, rowNumber, JSON.stringify(rowObj)]);
          }
        });
        if (allGenericRows.length > 0) {
          await db.bulkInsert(
            `INSERT INTO generic_data (upload_id, sheet_name, row_index, row_data) VALUES ($1, $2, $3, $4)`,
            allGenericRows
          );
        }

        sheetsMeta.push({ sheetName, type: 'generic_table' } as SheetMeta);
      } catch (e: any) {
        console.error('Generic Table Storage Error:', e.message);
      }
    }
  }

  return { uploadId, sheets: sheetsMeta };
}
