import type { Worksheet } from 'exceljs';

export interface KonnectRow {
  uploadId: string;
  sheetName: string;
  toolType: 'konnect_insights';
  rowData: Record<string, any>;
}

export function parseKonnect(
  uploadId: string,
  sheetName: string,
  worksheet: Worksheet
): KonnectRow[] {
  const allRows: any[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    allRows.push(row.values as any[]);
  });

  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i] as any[];
    const rowStr = row.map(c => String(c ?? '')).join(' ').toLowerCase();
    if (rowStr.includes('mention') || rowStr.includes('sentiment')) {
      headers = row.map(c => String(c ?? '').trim());
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const result: KonnectRow[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] as any[];
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx] ?? null; });
    if (Object.values(obj).every(v => v == null || v === '')) continue;
    result.push({ uploadId, sheetName, toolType: 'konnect_insights', rowData: obj });
  }
  return result;
}
