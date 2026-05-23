/**
 * lib/presentations/safe-download.js
 *
 * Wraps the raw presentation download with a pre-flight + auto-heal step.
 *
 * Usage from any client component:
 *   import { safeDownloadPresentation } from '@/lib/presentations/safe-download';
 *   const verdict = await safeDownloadPresentation(presentationId, {
 *     onStatus: (msg) => setStatusText(msg),
 *   });
 *   if (verdict.kind === 'downloaded') ...
 *   if (verdict.kind === 'regenerate') ...
 *
 * The helper itself never throws — it always returns one of three verdicts:
 *   { kind: 'downloaded', filename, sizeBytes, elapsedMs, pass }
 *   { kind: 'regenerate', detail }
 *   { kind: 'error',      message }
 *
 * Total time-to-decision budget: ~4 seconds (1s preflight fast + 3s heal).
 */

const PREFLIGHT_TIMEOUT_MS = 4500;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

export async function safeDownloadPresentation(presentationId, opts = {}) {
  const { onStatus = () => {} } = opts;

  // ── 1. Preflight ───────────────────────────────────────
  onStatus('Checking file…');
  let verdict;
  try {
    const r = await withTimeout(
      fetch(`/api/presentations/${presentationId}/preflight`),
      PREFLIGHT_TIMEOUT_MS,
      'preflight',
    );
    verdict = await r.json();
  } catch (err) {
    return { kind: 'error', message: `Preflight check failed: ${err.message}` };
  }

  if (verdict.ok === false || verdict.reason === 'not-found') {
    return { kind: 'error', message: verdict.error || verdict.detail || 'Presentation not found.' };
  }

  if (!verdict.ready) {
    if (verdict.reason === 'verification-failed' || verdict.reason === 'review-needed') {
      onStatus(`Dual-agent verdict: ${verdict.action || 'blocked'} (${verdict.confidence || 0}% conf)`);
      return {
        kind: 'verification-blocked',
        action: verdict.action,
        confidence: verdict.confidence,
        detail: verdict.detail || 'Visual or content agent found blocker-level issues.',
        dualAgent: verdict.dualAgent,
      };
    }
    onStatus(`Issue detected: ${verdict.reason} — regenerate needed.`);
    return { kind: 'regenerate', detail: verdict.detail || 'File is missing or corrupt — rebuild required.' };
  }

  // ── 2. Trigger download ───────────────────────────────
  // If dual-agent ran, include the slide/chart count in the status so
  // the user knows what was checked.
  const da = verdict.dualAgent;
  if (da) {
    const majors = (da.visualMajors || 0) + (da.contentMajors || 0);
    onStatus(majors > 0
      ? `Verified ✓ (${da.slideCount} slides, ${da.chartCount} charts, ${majors} minor warnings) — downloading…`
      : `Verified ✓ (${da.slideCount} slides, ${da.chartCount} charts) — downloading…`);
  } else {
    onStatus(verdict.pass === 'heal'
      ? `Recovered in ${verdict.elapsedMs}ms — downloading…`
      : `Verified (${(verdict.sizeBytes / 1024).toFixed(0)} KB) — downloading…`);
  }

  try {
    // Use a hidden anchor click — most browser-friendly + lets the browser
    // negotiate the streaming response from the API directly without an
    // in-memory blob round-trip (which would double memory for large files).
    const a = document.createElement('a');
    a.href = `/api/presentations/${presentationId}/download`;
    a.download = verdict.filename || 'presentation.pptx';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    return { kind: 'error', message: `Download trigger failed: ${err.message}` };
  }

  return {
    kind:      'downloaded',
    filename:  verdict.filename,
    sizeBytes: verdict.sizeBytes,
    elapsedMs: verdict.elapsedMs,
    pass:      verdict.pass,
  };
}
