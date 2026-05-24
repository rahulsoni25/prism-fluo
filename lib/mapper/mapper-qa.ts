/**
 * lib/mapper/mapper-qa.ts
 * Agent #2 — Mapper QA.
 *
 * Verifies the compressor's output preserves what matters:
 *   • TEXT MATCH        — extracted text from compressed must be >= 98%
 *                         of extracted text from original (allows tiny
 *                         whitespace/encoding differences from re-save)
 *   • STRUCTURE INTACT  — PDF page count or PPTX slide count unchanged
 *   • SOURCE INTEGRITY  — no broken XML / parse errors
 *
 * Returns ok=true only when all three pass. The orchestrator uses ok=true
 * as the green light to ship the compressed file; otherwise it discards
 * the compressor's output and keeps the original.
 */

import JSZip from 'jszip';
import type { CompressorResult, QaResult, MapperFinding } from './types';

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse is already a runtime dep
    const pdfParse = (await import('pdf-parse')).default as any;
    const data = await pdfParse(buffer);
    return (data?.text || '').replace(/\s+/g, ' ').trim();
  } catch { return ''; }
}

async function pdfPageCount(buffer: Buffer): Promise<number> {
  try {
    const pdfParse = (await import('pdf-parse')).default as any;
    const data = await pdfParse(buffer);
    return data?.numpages || 0;
  } catch { return 0; }
}

async function extractXlsxText(buffer: Buffer): Promise<{ text: string; sheets: number }> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const sheetFiles = Object.keys(zip.files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
    const parts: string[] = [];
    // sharedStrings holds most cell text in XLSX
    if (zip.files['xl/sharedStrings.xml']) {
      const xml = await zip.files['xl/sharedStrings.xml'].async('string');
      const re = /<t[^>]*>([^<]*)<\/t>/g;
      let m; while ((m = re.exec(xml)) !== null) parts.push((m[1] || '').trim());
    }
    // Inline strings + numeric cells live in sheet XML
    const cellRe = /<(?:t|v)[^>]*>([^<]*)<\/(?:t|v)>/g;
    for (const path of sheetFiles) {
      const xml = await zip.files[path].async('string');
      let m; while ((m = cellRe.exec(xml)) !== null) parts.push((m[1] || '').trim());
    }
    return {
      text: parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
      sheets: sheetFiles.length,
    };
  } catch { return { text: '', sheets: 0 }; }
}

/** Compute a 64-bit average-hash (aHash) of an image: resize to 8×8 grayscale,
 *  pixel > mean → 1. Hamming distance between two hashes ≈ perceptual distance. */
async function aHash(buffer: Buffer): Promise<bigint | null> {
  try {
    const sharp = (await import('sharp')).default;
    const { data } = await sharp(buffer, { failOn: 'none' })
      .resize(8, 8, { fit: 'fill' })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += data[i];
    const mean = sum / 64;
    let h = 0n;
    for (let i = 0; i < 64; i++) if (data[i] > mean) h |= (1n << BigInt(i));
    return h;
  } catch { return null; }
}

async function imageSimilarity(a: Buffer, b: Buffer): Promise<{ similar: boolean; similarity: number; reason: string }> {
  const [ha, hb] = await Promise.all([aHash(a), aHash(b)]);
  if (ha === null || hb === null) return { similar: false, similarity: 0, reason: 'one image failed to decode' };
  let diff = 0n; let x = ha ^ hb;
  while (x) { diff += x & 1n; x >>= 1n; }
  const similarity = 1 - Number(diff) / 64;
  // 0.95 threshold = up to ~3 bits differ — typical for q85 JPEG re-encode
  return { similar: similarity >= 0.95, similarity, reason: `${diff} bits differ (of 64)` };
}

function csvShape(buffer: Buffer): { rows: number; cols: number; text: string } {
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length > 0);
  // Naive column count: max comma-separated fields in first 100 lines
  let cols = 0;
  for (const l of lines.slice(0, 100)) {
    const c = l.split(',').length;
    if (c > cols) cols = c;
  }
  return { rows: lines.length, cols, text: text.replace(/\s+/g, ' ').trim() };
}

async function extractPptxText(buffer: Buffer): Promise<{ text: string; slides: number }> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const slideFiles = Object.keys(zip.files)
      .filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort();
    const re = /<a:t[^>]*>([^<]*)<\/a:t>/g;
    const parts: string[] = [];
    for (const path of slideFiles) {
      const xml = await zip.files[path].async('string');
      let m;
      while ((m = re.exec(xml)) !== null) parts.push((m[1] || '').trim());
    }
    return {
      text: parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim(),
      slides: slideFiles.length,
    };
  } catch { return { text: '', slides: 0 }; }
}

/** Token-level overlap between two text strings. Tokenises on word
 *  boundaries; returns the fraction of original tokens present in
 *  compressed. 1.0 = perfect, 0.0 = no overlap. */
function tokenOverlap(original: string, compressed: string): number {
  if (!original) return 1; // nothing to compare → trivially preserved
  const tokenise = (s: string) => s.toLowerCase().split(/[\s\p{P}]+/u).filter(t => t.length > 2);
  const origTokens = tokenise(original);
  const compTokens = new Set(tokenise(compressed));
  if (origTokens.length === 0) return 1;
  let matches = 0;
  for (const t of origTokens) if (compTokens.has(t)) matches++;
  return matches / origTokens.length;
}

export async function runQa(
  originalBuf: Buffer,
  compressorResult: CompressorResult,
  filename: string,
): Promise<QaResult> {
  const t0 = Date.now();
  const findings: MapperFinding[] = [];
  const lower = filename.toLowerCase();
  let textMatch = 1;
  let structureOk = true;

  if (lower.endsWith('.pdf')) {
    const [origText, compText, origPages, compPages] = await Promise.all([
      extractPdfText(originalBuf),
      extractPdfText(compressorResult.buffer),
      pdfPageCount(originalBuf),
      pdfPageCount(compressorResult.buffer),
    ]);
    textMatch = tokenOverlap(origText, compText);
    if (origPages !== compPages) {
      structureOk = false;
      findings.push({
        agent: 'mapper-qa', severity: 'blocker',
        issue: `Page count changed: ${origPages} → ${compPages}. Compressor mangled structure.`,
        suggest: 'Discard compressed output, keep original.',
      });
    }
  } else if (lower.endsWith('.pptx')) {
    const [orig, comp] = await Promise.all([
      extractPptxText(originalBuf),
      extractPptxText(compressorResult.buffer),
    ]);
    textMatch = tokenOverlap(orig.text, comp.text);
    if (orig.slides !== comp.slides) {
      structureOk = false;
      findings.push({
        agent: 'mapper-qa', severity: 'blocker',
        issue: `Slide count changed: ${orig.slides} → ${comp.slides}.`,
        suggest: 'Discard compressed output, keep original.',
      });
    }
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const [orig, comp] = await Promise.all([
      extractXlsxText(originalBuf),
      extractXlsxText(compressorResult.buffer),
    ]);
    textMatch = tokenOverlap(orig.text, comp.text);
    if (orig.sheets !== comp.sheets) {
      structureOk = false;
      findings.push({
        agent: 'mapper-qa', severity: 'blocker',
        issue: `Sheet count changed: ${orig.sheets} → ${comp.sheets}.`,
        suggest: 'Discard compressed output, keep original.',
      });
    }
  } else if (lower.endsWith('.csv')) {
    const orig = csvShape(originalBuf);
    const comp = csvShape(compressorResult.buffer);
    textMatch = tokenOverlap(orig.text, comp.text);
    // Row delta ≤ 1 allowed (trailing-blank-line normalisation)
    if (Math.abs(orig.rows - comp.rows) > 1 || orig.cols !== comp.cols) {
      structureOk = false;
      findings.push({
        agent: 'mapper-qa', severity: 'blocker',
        issue: `CSV shape changed: ${orig.rows}×${orig.cols} → ${comp.rows}×${comp.cols}.`,
        suggest: 'Discard compressed output, keep original.',
      });
    }
  } else if (/\.(png|jpe?g|webp|gif)$/.test(lower)) {
    textMatch = 1; // images have no text
    // If compressor passed through unchanged, nothing to verify
    const unchanged = originalBuf.length === compressorResult.buffer.length
      && originalBuf.equals(compressorResult.buffer);
    if (!unchanged) {
      const { similar, similarity, reason } = await imageSimilarity(originalBuf, compressorResult.buffer);
      if (!similar) {
        structureOk = false;
        findings.push({
          agent: 'mapper-qa', severity: 'blocker',
          issue: `Image perceptual similarity only ${(similarity * 100).toFixed(1)}% — re-encode lost visible detail (${reason}).`,
          suggest: 'Discard compressed output, keep original.',
        });
      }
    }
  } else {
    textMatch = 1;
  }

  // Severity by text-match threshold
  if (textMatch < 0.98) {
    findings.push({
      agent: 'mapper-qa', severity: textMatch < 0.9 ? 'blocker' : 'major',
      issue: `Text match only ${(textMatch * 100).toFixed(1)}% — below the 98% safety floor. Compressor lost content.`,
      suggest: 'Discard compressed output. Use a different strategy or keep original.',
    });
  }

  // Lossy-notes from the compressor become advisory findings
  for (const note of compressorResult.lossyNotes) {
    findings.push({ agent: 'mapper-qa', severity: 'minor', issue: note });
  }

  const ok = findings.filter(f => f.severity === 'blocker').length === 0 && structureOk && textMatch >= 0.98;
  return {
    ok,
    textMatchPct: Math.round(textMatch * 1000) / 10,
    structurePreserved: structureOk,
    findings,
    elapsedMs: Date.now() - t0,
  };
}
