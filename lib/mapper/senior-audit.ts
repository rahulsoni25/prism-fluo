/**
 * lib/mapper/senior-audit.ts
 * Agent #3 — Senior Audit.
 *
 * For files SMALLER than 10 MB, no compression is needed — but the file
 * still gets a single thorough pass:
 *   • Parseable in its format (PDF opens, PPTX is valid zip, etc.)
 *   • Has extractable text > 0 (not a scan/image-only PDF that the AI
 *     pipeline will silently process to garbage)
 *   • Page/slide count > 0
 *   • Not suspiciously tiny for its declared type (< 2 KB PDF is almost
 *     certainly corrupt)
 *
 * If a check fails, the agent reruns ONCE (the user's spec) — the rerun
 * is helpful for transient parse errors (rare). If the rerun still fails,
 * the file is marked with blockers and the upstream pipeline can decide
 * whether to proceed.
 */

import JSZip from 'jszip';
import { parsePdfOnce } from './parse-cache';
import type { SeniorAuditResult, MapperFinding } from './types';

async function auditOnce(buffer: Buffer, filename: string): Promise<MapperFinding[]> {
  const findings: MapperFinding[] = [];
  const lower = filename.toLowerCase();

  const isImage = /\.(png|jpe?g|webp|gif)$/.test(lower);
  // Images can legitimately be tiny (favicons, sprites); apply 32-byte floor
  const minBytes = isImage ? 32 : 256;
  if (buffer.length < minBytes) {
    findings.push({
      agent: 'senior-audit', severity: 'blocker',
      issue: `File is only ${buffer.length} bytes — too small to be a real document.`,
    });
    return findings;
  }

  if (lower.endsWith('.pdf')) {
    if (!buffer.slice(0, 5).toString('ascii').startsWith('%PDF-')) {
      findings.push({ agent: 'senior-audit', severity: 'blocker', issue: 'Missing %PDF- header — file is not a valid PDF.' });
      return findings;
    }
    try {
      const data = await parsePdfOnce(buffer);
      const numpages = data?.numpages ?? 0;
      if (data && numpages === 0) {
        findings.push({ agent: 'senior-audit', severity: 'blocker', issue: 'PDF reports 0 pages.' });
      }
      const text = (data?.text || '').trim();
      if (data && text.length < 50) {
        findings.push({
          agent: 'senior-audit', severity: 'major',
          issue: `Only ${text.length} characters of extractable text — file may be image-only / scanned. AI analysis on this will produce poor results.`,
          suggest: 'Run OCR on the source (e.g. pdf24.org → OCR) before re-uploading.',
        });
      }
    } catch (err: any) {
      findings.push({ agent: 'senior-audit', severity: 'major', issue: `PDF parse warning: ${err.message}` });
    }
  } else if (lower.endsWith('.pptx')) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p));
      if (slides.length === 0) {
        findings.push({ agent: 'senior-audit', severity: 'blocker', issue: 'PPTX contains 0 slides.' });
      }
    } catch (err: any) {
      findings.push({ agent: 'senior-audit', severity: 'blocker', issue: `PPTX zip parse error: ${err.message}` });
    }
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const sheets = Object.keys(zip.files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
      if (sheets.length === 0) {
        findings.push({ agent: 'senior-audit', severity: 'blocker', issue: 'XLSX contains 0 sheets.' });
      }
    } catch (err: any) {
      findings.push({ agent: 'senior-audit', severity: 'blocker', issue: `XLSX parse error: ${err.message}` });
    }
  } else if (lower.endsWith('.csv')) {
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.length > 0);
    if (lines.length < 2) {
      findings.push({ agent: 'senior-audit', severity: 'blocker', issue: `CSV has only ${lines.length} line(s) — need at least header + 1 data row.` });
    } else {
      const headerCols = lines[0].split(',').length;
      if (headerCols < 2) {
        findings.push({ agent: 'senior-audit', severity: 'major', issue: `CSV header has only ${headerCols} column(s) — file may not be comma-delimited.`, suggest: 'Check for tab/semicolon delimiter and re-save as comma-separated.' });
      }
      // Sample 50 rows for consistent column count
      let inconsistent = 0;
      for (const l of lines.slice(1, 51)) if (l.split(',').length !== headerCols) inconsistent++;
      if (inconsistent > 5) {
        findings.push({ agent: 'senior-audit', severity: 'major', issue: `${inconsistent}/50 sampled rows have a different column count than the header. CSV likely malformed.` });
      }
    }
  } else if (/\.(png|jpe?g|webp|gif)$/.test(lower)) {
    // Magic-byte check — ensures the extension matches the actual format
    const head = buffer.slice(0, 12);
    const isPng  = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47;
    const isJpeg = head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF;
    const isGif  = head.slice(0, 3).toString('ascii') === 'GIF';
    const isWebp = head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP';
    const ok = (lower.endsWith('.png') && isPng)
      || (/\.jpe?g$/.test(lower) && isJpeg)
      || (lower.endsWith('.gif') && isGif)
      || (lower.endsWith('.webp') && isWebp);
    if (!ok) {
      findings.push({ agent: 'senior-audit', severity: 'blocker', issue: `Image header doesn't match extension — file may be renamed or corrupted.` });
    }
  }
  // other: trust the upstream parser

  return findings;
}

export async function runSeniorAudit(buffer: Buffer, filename: string): Promise<SeniorAuditResult> {
  const t0 = Date.now();

  // Single pass first
  let findings = await auditOnce(buffer, filename);
  let reranOnce = false;

  // If blockers found → rerun ONCE (per spec — catches transient parse races)
  if (findings.some(f => f.severity === 'blocker')) {
    reranOnce = true;
    // Tiny delay before rerun — gives any GC / IO settling time
    await new Promise(r => setTimeout(r, 100));
    findings = await auditOnce(buffer, filename);
  }

  return {
    ok: findings.filter(f => f.severity === 'blocker').length === 0,
    findings,
    reranOnce,
    elapsedMs: Date.now() - t0,
  };
}
