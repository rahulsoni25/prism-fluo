/**
 * lib/mapper/client-council.ts
 *
 * Lightweight BROWSER-SIDE Mapper Council. Wraps the client compressor
 * with a structural QA pass + grade so the browser refuses to upload a
 * bad compression and falls back to the original.
 *
 * Why structural-only (no text-match check)?
 *   The server's mapper-qa uses pdf-parse for text extraction. pdf-parse
 *   pulls in Node-only APIs and doesn't run cleanly in browsers. Adding
 *   pdfjs-dist (the browser PDF parser) would add ~400 KB to the bundle
 *   for marginal value — the server still runs the full text-match check
 *   after upload, so this layer's job is just to catch GROSS corruption
 *   before the user wastes bandwidth on a bad file.
 *
 * Grade function:
 *   10 = compression succeeded + structure intact
 *    7 = compression succeeded + size reduced but QA found a minor issue
 *    0 = QA blocker — discard compressed, ship original
 *   (no grade for skipped files; treated as a pass-through)
 */

import { compressClientSide, type ClientCompressResult } from './compressor-client';

export interface ClientCouncilVerdict {
  /** The file to actually upload — compressed if it passed QA, original otherwise. */
  file: File;
  /** 0–10. Only present when compression was attempted. */
  grade: number | null;
  /** True iff grade ≥ 8 (or compression was skipped → trivially ready). */
  ready: boolean;
  /** True iff the file going up is smaller than the file that came in. */
  reduced: boolean;
  originalBytes:    number;
  finalBytes:       number;
  strategy:         string;
  /** Plain-language descriptions of any QA failure. */
  blockers:         string[];
  /** Mirrors compressor strategy summary (for upload log). */
  reason:           string;
}

// ── QA helpers (browser-safe) ───────────────────────────────────────────

async function pdfPageCount(buf: Uint8Array): Promise<number | null> {
  try {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(buf, { updateMetadata: false });
    return doc.getPageCount();
  } catch { return null; }
}

async function zipFileCountMatching(buf: Uint8Array, regex: RegExp): Promise<number | null> {
  try {
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buf);
    return Object.keys(zip.files).filter(p => regex.test(p)).length;
  } catch { return null; }
}

function csvShape(buf: Uint8Array): { rows: number; cols: number } {
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length > 0);
  let cols = 0;
  for (const l of lines.slice(0, 100)) {
    const c = l.split(',').length;
    if (c > cols) cols = c;
  }
  return { rows: lines.length, cols };
}

// ── QA core ─────────────────────────────────────────────────────────────

async function runQa(
  original: Uint8Array,
  compressed: Uint8Array,
  filename: string,
): Promise<{ ok: boolean; blockers: string[] }> {
  const blockers: string[] = [];
  const lower = filename.toLowerCase();

  if (lower.endsWith('.pdf')) {
    const [orig, comp] = await Promise.all([pdfPageCount(original), pdfPageCount(compressed)]);
    if (orig === null || comp === null) {
      blockers.push('PDF re-parse failed — cannot verify integrity');
    } else if (orig !== comp) {
      blockers.push(`Page count changed: ${orig} → ${comp}`);
    }
  } else if (lower.endsWith('.pptx')) {
    const [orig, comp] = await Promise.all([
      zipFileCountMatching(original,   /^ppt\/slides\/slide\d+\.xml$/),
      zipFileCountMatching(compressed, /^ppt\/slides\/slide\d+\.xml$/),
    ]);
    if (orig === null || comp === null) {
      blockers.push('PPTX re-parse failed — cannot verify integrity');
    } else if (orig !== comp) {
      blockers.push(`Slide count changed: ${orig} → ${comp}`);
    } else if (comp === 0) {
      blockers.push('Compressed PPTX has 0 slides');
    }
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const [orig, comp] = await Promise.all([
      zipFileCountMatching(original,   /^xl\/worksheets\/sheet\d+\.xml$/),
      zipFileCountMatching(compressed, /^xl\/worksheets\/sheet\d+\.xml$/),
    ]);
    if (orig === null || comp === null) {
      blockers.push('XLSX re-parse failed — cannot verify integrity');
    } else if (orig !== comp) {
      blockers.push(`Sheet count changed: ${orig} → ${comp}`);
    } else if (comp === 0) {
      blockers.push('Compressed XLSX has 0 sheets');
    }
  } else if (lower.endsWith('.csv')) {
    const o = csvShape(original);
    const c = csvShape(compressed);
    // Row delta ≤ 1 allowed (trailing blank line removal); col count must match
    if (Math.abs(o.rows - c.rows) > 1 || o.cols !== c.cols) {
      blockers.push(`CSV shape changed: ${o.rows}×${o.cols} → ${c.rows}×${c.cols}`);
    }
  }
  return { ok: blockers.length === 0, blockers };
}

// ── Public council entry ────────────────────────────────────────────────

export async function runClientCouncil(file: File): Promise<ClientCouncilVerdict> {
  // 1. Compress
  let result: ClientCompressResult;
  try {
    result = await compressClientSide(file);
  } catch (err: any) {
    return {
      file, grade: null, ready: true, reduced: false,
      originalBytes: file.size, finalBytes: file.size,
      strategy: 'compress-error', blockers: [],
      reason: `Compression error fell back to original: ${err?.message ?? err}`,
    };
  }

  // 2. If skipped or no reduction → nothing to QA, just pass through
  if (!result.reduced) {
    return {
      file: result.file, grade: null, ready: true, reduced: false,
      originalBytes: result.originalBytes, finalBytes: result.compressedBytes,
      strategy: result.strategy, blockers: [],
      reason: result.strategy,
    };
  }

  // 3. QA the compressed bytes against the original
  let qa: { ok: boolean; blockers: string[] };
  try {
    const origBuf = new Uint8Array(await file.arrayBuffer());
    const compBuf = new Uint8Array(await result.file.arrayBuffer());
    qa = await runQa(origBuf, compBuf, file.name);
  } catch (err: any) {
    // If QA itself crashed, play safe — ship original
    return {
      file, grade: 0, ready: false, reduced: false,
      originalBytes: result.originalBytes, finalBytes: file.size,
      strategy: result.strategy, blockers: [`QA crashed: ${err?.message ?? err}`],
      reason: 'qa-crash:fell-back-to-original',
    };
  }

  // 4. Grade + verdict
  if (!qa.ok) {
    return {
      file, grade: 0, ready: false, reduced: false,
      originalBytes: result.originalBytes, finalBytes: file.size,
      strategy: result.strategy, blockers: qa.blockers,
      reason: 'qa-blocker:fell-back-to-original',
    };
  }

  return {
    file: result.file, grade: 10, ready: true, reduced: true,
    originalBytes: result.originalBytes, finalBytes: result.compressedBytes,
    strategy: result.strategy, blockers: [],
    reason: result.strategy,
  };
}
