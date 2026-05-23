/**
 * lib/exports/safe-export.js
 *
 * Client helper: pre-flight + dual-agent verify + trigger download for
 * Excel or PDF exports of an analysis. Same verdict contract as
 * lib/presentations/safe-download.js so the UI patterns are identical.
 *
 * Usage:
 *   import { safeExport } from '@/lib/exports/safe-export';
 *   const verdict = await safeExport(analysisId, 'xlsx', {
 *     onStatus: setStatusText,
 *   });
 *   if (verdict.kind === 'downloaded') ...
 *   if (verdict.kind === 'verification-blocked') ...
 */

const PREFLIGHT_TIMEOUT_MS = 30000; // longer than PPT because PDF gen is slow

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

export async function safeExport(analysisId, format, opts = {}) {
  const { onStatus = () => {} } = opts;
  if (format !== 'xlsx' && format !== 'pdf') {
    return { kind: 'error', message: `Unsupported format: ${format}` };
  }

  onStatus(`Checking ${format.toUpperCase()} export…`);
  let verdict;
  try {
    const r = await withTimeout(
      fetch(`/api/analyses/${analysisId}/export/preflight?format=${format}`),
      PREFLIGHT_TIMEOUT_MS,
      'preflight',
    );
    verdict = await r.json();
  } catch (err) {
    return { kind: 'error', message: `Preflight failed: ${err.message}` };
  }

  if (verdict.ok === false) {
    return { kind: 'error', message: verdict.error || 'Preflight rejected.' };
  }

  if (!verdict.ready) {
    if (verdict.reason === 'verification-failed' || verdict.reason === 'review-needed') {
      onStatus(`Dual-agent verdict: ${verdict.action || 'blocked'} (${verdict.confidence || 0}% conf)`);
      return {
        kind: 'verification-blocked',
        action: verdict.action,
        confidence: verdict.confidence,
        detail: verdict.detail,
        dualAgent: verdict.dualAgent,
      };
    }
    return { kind: 'regenerate', detail: verdict.detail || 'Export could not be generated.' };
  }

  // ── Trigger download ───────────────────────────────────
  const da = verdict.dualAgent || {};
  const sizeKb = (da.sizeBytes / 1024).toFixed(0);
  const stats = format === 'xlsx'
    ? `${da.sheetCount} sheets, ${da.rowCount} rows`
    : `${da.pageCount} pages`;
  const majors = (da.inspectorMajors || 0) + (da.contentMajors || 0);
  onStatus(majors > 0
    ? `Verified ✓ (${stats}, ${majors} minor warnings) — downloading…`
    : `Verified ✓ (${stats}, ${sizeKb} KB) — downloading…`);

  try {
    if (verdict.downloadMethod === 'POST') {
      // PDF route is a POST — we need to fetch + create blob URL
      const r = await fetch(verdict.downloadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysisId }),
      });
      if (!r.ok) throw new Error(`Download fetch failed: HTTP ${r.status}`);
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = verdict.filename || `analysis.${format}`;
      a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      // GET route — anchor click streams directly
      const a = document.createElement('a');
      a.href = verdict.downloadUrl; a.download = verdict.filename || `analysis.${format}`;
      a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
    }
  } catch (err) {
    return { kind: 'error', message: `Download failed: ${err.message}` };
  }

  return {
    kind: 'downloaded',
    filename: verdict.filename,
    format,
    confidence: verdict.confidence,
  };
}
