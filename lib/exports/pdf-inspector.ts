/**
 * lib/exports/pdf-inspector.ts
 *
 * Inspects a PDF without pulling a heavy parser dep. PDF is a structured
 * binary text format — for our sanity checks we only need:
 *   • Magic header (%PDF-) at byte 0
 *   • EOF marker (%%EOF) within last 1024 bytes
 *   • /Type /Page entries → page count
 *   • At least one /Font reference (= text is actually rendered)
 *   • Approximate text stream presence (BT … ET text-block markers)
 *   • Title / Subject metadata
 *
 * Catches: zero-page PDFs, header-only PDFs, image-only PDFs masquerading
 * as text PDFs, corrupt buffers.
 *
 * Note: this is intentionally NOT a full PDF text extractor. For deep
 * content cross-reference we'd need pdfjs-dist (~1 MB). The cards check
 * lives in dual-agent-pdf.ts and falls back gracefully when text isn't
 * extractable.
 */

export type IssueSeverity = 'blocker' | 'major' | 'minor';
export interface PdfIssue {
  page?:    number;
  kind:
    | 'bad-header' | 'bad-eof' | 'no-pages' | 'page-count-low'
    | 'no-fonts' | 'no-text-streams'
    | 'missing-metadata' | 'tiny-file'
    | 'parse-error';
  severity:  IssueSeverity;
  detail:    string;
  evidence?: string;
  recoverable?: boolean;
}

export interface PdfReport {
  ok:            boolean;
  pageCount:     number;
  hasTextStreams: boolean;
  hasFonts:       boolean;
  sizeBytes:      number;
  issues:         PdfIssue[];
  worstSeverity:  IssueSeverity | null;
  elapsedMs:      number;
}

export interface PdfInspectOpts {
  /** Minimum acceptable page count. Defaults to 1; for analyses with many
   *  insights, the caller can require more. */
  minPages?: number;
  /** Source cards — when provided, the inspector pulls text streams and
   *  cross-references for dropped high-conviction insights. */
  sourceCards?: Array<{ title: string; conviction?: number }>;
}

export async function inspectPdf(buffer: Buffer, opts: PdfInspectOpts = {}): Promise<PdfReport> {
  const t0 = Date.now();
  const issues: PdfIssue[] = [];
  const minPages = opts.minPages ?? 1;

  // ── Header / EOF / size sanity ──────────────────────────────
  if (buffer.length < 1024) {
    issues.push({ kind: 'tiny-file', severity: 'blocker', detail: `PDF is only ${buffer.length} bytes — far below the ~2 KB minimum for any valid document.` });
  }
  const headerStr = buffer.slice(0, 8).toString('ascii');
  if (!headerStr.startsWith('%PDF-')) {
    issues.push({ kind: 'bad-header', severity: 'blocker', detail: `Missing %PDF- magic header. First bytes: ${JSON.stringify(headerStr)}` });
    return {
      ok: false, pageCount: 0, hasTextStreams: false, hasFonts: false,
      sizeBytes: buffer.length, issues,
      worstSeverity: 'blocker', elapsedMs: Date.now() - t0,
    };
  }
  const tailStr = buffer.slice(Math.max(0, buffer.length - 1024)).toString('latin1');
  if (!tailStr.includes('%%EOF')) {
    issues.push({ kind: 'bad-eof', severity: 'blocker', detail: 'Missing %%EOF marker in last 1 KB — PDF may be truncated.' });
  }

  // Convert buffer to a scannable string. Latin1 preserves byte values
  // so regex like /\/Type\s*\/Page/ work consistently on the raw bytes.
  const bytes = buffer.toString('latin1');

  // ── Page count ──────────────────────────────────────────────
  // Match /Type /Page (with optional whitespace) but NOT /Type /Pages
  const pageMatches = bytes.match(/\/Type\s*\/Page(?!s)/g) || [];
  const pageCount = pageMatches.length;
  if (pageCount === 0) {
    issues.push({ kind: 'no-pages', severity: 'blocker', detail: 'PDF declares zero /Type /Page objects.' });
  } else if (pageCount < minPages) {
    issues.push({ kind: 'page-count-low', severity: 'major', detail: `Only ${pageCount} page(s) — caller expected at least ${minPages}.` });
  }

  // ── Fonts ────────────────────────────────────────────────────
  const hasFonts = /\/Font\b/.test(bytes);
  if (!hasFonts) {
    issues.push({ kind: 'no-fonts', severity: 'major', detail: 'No /Font references — PDF may be image-only or have unrendered text.' });
  }

  // ── Text streams (BT … ET blocks) ───────────────────────────
  // PDF text is wrapped in BT (begin text) / ET (end text) operators.
  const textBlocks = bytes.match(/\bBT\b[\s\S]{0,200}?\bET\b/g) || [];
  const hasTextStreams = textBlocks.length > 0;
  if (hasFonts && !hasTextStreams) {
    issues.push({ kind: 'no-text-streams', severity: 'major',
      detail: 'Fonts declared but no BT/ET text blocks found — text may not render.' });
  }

  // ── Metadata ─────────────────────────────────────────────────
  if (!/\/Title\s*\(/.test(bytes) && !/\/Title\s*</.test(bytes)) {
    issues.push({ kind: 'missing-metadata', severity: 'minor',
      detail: 'PDF has no /Title metadata — recipients will see "Untitled" in their reader.' });
  }

  // ── Content cross-reference (best-effort) ───────────────────
  // Decode the bytes as Latin1 to look for plain text occurrences. Won't
  // catch text inside compressed streams (most production PDFs), but it
  // catches the cases where the PDF generator embeds plain (uncompressed)
  // text streams — common for our pdfkit/pdfmake output.
  if (opts.sourceCards && opts.sourceCards.length > 0) {
    const high = opts.sourceCards
      .filter(c => (c.conviction ?? 0) >= 85)
      .sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));
    // Pull out parenthesised PDF strings as a heuristic text corpus.
    const corpus = (bytes.match(/\(([^()\\]{4,80})\)/g) || []).join(' ').toLowerCase();
    if (corpus.length > 200) {  // only run the check if we actually got SOME text
      let flagged = 0;
      for (const c of high) {
        const anchor = c.title.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(' ');
        if (!anchor) continue;
        if (!corpus.includes(anchor)) {
          issues.push({ kind: 'page-count-low' /* re-use, no dedicated kind */, severity: 'minor',
            detail: `High-conviction card "${c.title}" (conv ${c.conviction}) not found in PDF text.`,
            evidence: c.title });
          flagged++;
          if (flagged >= 5) break;
        }
      }
    }
  }

  const rank = { blocker: 3, major: 2, minor: 1 };
  let worst: IssueSeverity | null = null;
  for (const i of issues) if (!worst || rank[i.severity] > rank[worst]) worst = i.severity;

  return {
    ok: issues.filter(i => i.severity === 'blocker').length === 0,
    pageCount, hasTextStreams, hasFonts,
    sizeBytes: buffer.length, issues,
    worstSeverity: worst, elapsedMs: Date.now() - t0,
  };
}
