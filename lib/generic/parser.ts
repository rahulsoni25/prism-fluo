import type { Worksheet } from 'exceljs';

export interface GenericRow {
  uploadId: string;
  sheetName: string;
  toolType: 'generic';
  rowData: Record<string, any>;
}

export function parseGenericSheet(
  uploadId: string,
  sheetName: string,
  worksheet: Worksheet
): GenericRow[] {
  const allRows: any[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    allRows.push(row.values as any[]);
  });
  if (allRows.length < 2) return [];

  // Find header row: first row with ≥2 non-empty cells
  // (was >3 — too strict for narrow exports like Helium10 Niche)
  let headerIdx = 0;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i] as any[];
    const filled = row.filter(c => c != null && String(c).trim().length > 0);
    if (filled.length >= 2) {
      headers = row.map(c => String(c ?? '').trim());
      headerIdx = i;
      break;
    }
  }
  if (headers.length === 0) return [];

  const result: GenericRow[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] as any[];
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx] ?? null; });
    if (Object.values(obj).filter(v => v != null && v !== '').length < 2) continue;
    result.push({ uploadId, sheetName, toolType: 'generic', rowData: obj });
  }
  return result;
}
