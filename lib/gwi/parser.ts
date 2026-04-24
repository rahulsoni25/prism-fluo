import type { Worksheet } from 'exceljs';
import type { GwiTimeSpentRow } from '@/types/gwi';

export function extractMainQuestion(col0: string[]): {
  questionName: string;
  questionMessage: string;
} {
  const q = col0.find(v => v && v.toLowerCase().includes('time spent')) || 'Time Spent Analysis';
  const msg = col0.find(v => v && v.toLowerCase().includes('this question combines data')) || '';
  return { questionName: q.trim(), questionMessage: msg.trim() };
}

export function tidyGwiTimeSpent(
  uploadId: string,
  sheetName: string,
  worksheet: Worksheet
): GwiTimeSpentRow[] {
  const rows: any[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    rows.push(row.values);
  });

  // 1. Identify Header Row (Metric Labels)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const rowStr = (rows[i] || []).join(' ').toLowerCase();
    if (rowStr.includes('audience %') && rowStr.includes('data point %')) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return [];

  const headers = rows[headerIdx] as any[];
  const audiences = rows[headerIdx - 1] as any[] || [];
  const col0Values = rows.map(r => String(r[1] || ''));
  const { questionName, questionMessage } = extractMainQuestion(col0Values);

  // 2. Identify Metric Clusters
  const metricBlocks: { audience: string; cols: Record<string, number> }[] = [];
  let currentAudience = 'Total';

  for (let c = 1; c < headers.length; c++) {
    const h = String(headers[c] || '').toLowerCase();
    const a = String(audiences[c] || '').trim();
    if (a && a.length > 1) currentAudience = a;

    if (h.includes('audience %')) {
      metricBlocks.push({ audience: currentAudience, cols: { audiencePct: c } });
    } else if (metricBlocks.length > 0) {
      const last = metricBlocks[metricBlocks.length - 1];
      if (h.includes('data point %')) last.cols.dataPointPct = c;
      if (h.includes('universe')) last.cols.universe = c;
      if (h.includes('index')) last.cols.index = c;
      if (h.includes('responses')) last.cols.responses = c;
    }
  }

  // 3. Find Attribute and Short Label columns
  // FIX: `findIndex` returns -1 (truthy) when not found and 0 (falsy) when found at index 0.
  // Using `|| fallback` was broken for both cases. Use a proper ternary.
  const _attrIdx  = headers.findIndex(h => String(h || '').toLowerCase().includes('attributes'));
  const _labelIdx = headers.findIndex(h => String(h || '').toLowerCase().includes('short label'));
  const attrCol   = _attrIdx  !== -1 ? _attrIdx  : 1;
  const labelCol  = _labelIdx !== -1 ? _labelIdx : 2;

  // 4. Extract Data Rows
  const tidy: GwiTimeSpentRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const attribute = String(row[attrCol] || '').trim();
    if (!attribute || attribute.toLowerCase().includes('base')) continue;

    metricBlocks.forEach(block => {
      tidy.push({
        uploadId,
        sheetName,
        questionName,
        questionMessage,
        timeBucket: attribute,
        audience: block.audience,
        audiencePct: parseFloat(row[block.cols.audiencePct]) || null,
        dataPointPct: parseFloat(row[block.cols.dataPointPct]) || null,
        universe: parseFloat(row[block.cols.universe]) || null,
        index: parseFloat(row[block.cols.index]) || null,
        responses: parseFloat(row[block.cols.responses]) || null,
      });
    });
  }

  return tidy;
}
