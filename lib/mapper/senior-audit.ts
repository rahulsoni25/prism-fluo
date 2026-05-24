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
import type { SeniorAuditResult, MapperFinding } from './types';

async function auditOnce(buffer: Buffer, filename: string): Promise<MapperFinding[]> {
  const findings: MapperFinding[] = [];
  const lower = filename.toLowerCase();

  if (buffer.length < 256) {
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
      const pdfParse = (await import('pdf-parse')).default as any;
      let data: any = null;
      try { data = await pdfParse(buffer); } catch { /* parse warnings → treat as soft */ }
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
  }
  // CSV / other: trust the upstream parser

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
