import type { Worksheet } from 'exceljs';

export interface H10Row {
  uploadId: string;
  sheetName: string;
  toolType: string;
  rowData: Record<string, any>;
}

export function parseHelium10(
  uploadId: string,
  sheetName: string,
  worksheet: Worksheet,
  variant: string
): H10Row[] {
  const allRows: any[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    allRows.push(row.values as any[]);
  });

  // Find header row
  let headerIdx = -1;
  let headers: string[] = [];
  for (let i = 0; i < Math.min(10, allRows.length); i++) {
    const row = allRows[i] as any[];
    const filled = row.filter(c => c != null && String(c).trim().length > 0);
    if (filled.length >= 4) {
      headers = row.map(c => String(c ?? '').trim());
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return [];

  const result: H10Row[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] as any[];
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = row[idx] ?? null;
    });
    // Skip empty rows
    if (Object.values(obj).every(v => v == null || v === '')) continue;
    result.push({ uploadId, sheetName, toolType: `helium10_${variant}`, rowData: obj });
  }
  return result;
}
