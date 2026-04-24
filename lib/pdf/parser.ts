/**
 * lib/pdf/parser.ts
 * Extracts tabular data from PDF files using pdf-parse.
 * Falls back to line-by-line text parsing.
 */

export interface PdfRow {
  uploadId: string;
  sheetName: string;
  toolType: 'pdf_extract';
  rowData: Record<string, any>;
}

export async function parsePdf(
  uploadId: string,
  filename: string,
  buffer: Buffer
): Promise<{ sheetName: string; rows: PdfRow[] }[]> {
  let pdfParse: any;
  try {
    pdfParse = (await import('pdf-parse')).default;
  } catch {
    console.warn('[PDF] pdf-parse not available');
    return [];
  }

  const data = await pdfParse(buffer);
  const text = data.text || '';
  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);

  if (lines.length < 3) return [];

  // Try to detect tabular structure by finding a consistent delimiter
  const sheetName = filename.replace(/\.pdf$/i, '') || 'PDF Data';
  const rows = parseTextTable(uploadId, sheetName, lines);

  return rows.length > 0 ? [{ sheetName, rows }] : [];
}

function parseTextTable(uploadId: string, sheetName: string, lines: string[]): PdfRow[] {
  // Find lines with consistent column structure (split by 2+ spaces or tabs)
  const separator = /\t|  {2,}/;

  // Find potential header line
  let headerIdx = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(20, lines.length); i++) {
    const parts = lines[i].split(separator).map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      headers = parts;
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    // Fallback: treat each line as a single "text" row
    return lines.slice(0, 200).map(line => ({
      uploadId, sheetName, toolType: 'pdf_extract' as const,
      rowData: { text: line }
    }));
  }

  const result: PdfRow[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const parts = lines[i].split(separator).map(p => p.trim());
    if (parts.length < 2) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => { if (h) obj[h] = parts[idx] ?? null; });
    result.push({ uploadId, sheetName, toolType: 'pdf_extract', rowData: obj });
  }
  return result;
}
