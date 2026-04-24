import type { Worksheet } from 'exceljs';

export interface TrendsRow {
  uploadId: string;
  sheetName: string;
  toolType: 'google_trends';
  rowData: Record<string, any>;
}

export function parseGoogleTrends(
  uploadId: string,
  sheetName: string,
  worksheet: Worksheet
): TrendsRow[] {
  const allRows: any[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    allRows.push(row.values as any[]);
  });

  // Skip metadata rows until we find the real header (starts with date/week)
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(20, allRows.length); i++) {
    const row = allRows[i] as any[];
    const rowStr = row.map(c => String(c ?? '')).join(' ').toLowerCase();
    if (rowStr.match(/week|date|\d{4}-\d{2}-\d{2}/)) {
      headers = row.map(c => String(c ?? '').trim());
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const result: TrendsRow[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] as any[];
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = row[idx] ?? null;
    });
    if (Object.values(obj).every(v => v == null || v === '')) continue;
    result.push({ uploadId, sheetName, toolType: 'google_trends', rowData: obj });
  }
  return result;
}
