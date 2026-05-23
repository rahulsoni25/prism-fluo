/**
 * lib/exports/excel-inspector.ts
 *
 * XLSX is a ZIP of XML — same shape as PPTX. We crack it open and check:
 *   • Sheet count > 0
 *   • Each sheet has a non-empty header row + at least one data row
 *   • No formula errors leaking through (#REF!, #N/A, #VALUE!, #DIV/0!, #NAME?, #NUM!, #NULL!)
 *   • Sharedstrings actually contains text (not all blanks)
 *   • No suspiciously short sheets (< 3 rows = probably a stub)
 *   • Content-vs-source cross-reference: every high-conviction insight
 *     card should appear in the workbook somewhere
 *
 * Pure rules, no LLM, ~200ms for a typical workbook.
 */

import JSZip from 'jszip';

export type IssueSeverity = 'blocker' | 'major' | 'minor';
export interface ExcelIssue {
  sheet?:   string;
  kind:
    | 'no-sheets' | 'empty-sheet' | 'no-headers' | 'header-blank-cell'
    | 'formula-error' | 'all-strings-blank' | 'sheet-too-short'
    | 'dropped-high-conviction-insight'
    | 'parse-error';
  severity:  IssueSeverity;
  detail:    string;
  evidence?: string;
  recoverable?: boolean;
}

export interface ExcelReport {
  ok:            boolean;
  sheetCount:    number;
  rowCount:      number;
  formulaErrors: number;
  issues:        ExcelIssue[];
  worstSeverity: IssueSeverity | null;
  elapsedMs:     number;
}

export interface ExcelInspectOpts {
  /** Source analysis cards — for the dropped-insight cross-reference. */
  sourceCards?: Array<{ title: string; conviction?: number }>;
}

const FORMULA_ERROR_VALUES = ['#REF!', '#N/A', '#VALUE!', '#DIV/0!', '#NAME?', '#NUM!', '#NULL!'];

export async function inspectExcel(buffer: Buffer, opts: ExcelInspectOpts = {}): Promise<ExcelReport> {
  const t0 = Date.now();
  const issues: ExcelIssue[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err: any) {
    return {
      ok: false, sheetCount: 0, rowCount: 0, formulaErrors: 0,
      issues: [{ kind: 'parse-error', severity: 'blocker', detail: `Could not open XLSX: ${err.message}` }],
      worstSeverity: 'blocker', elapsedMs: Date.now() - t0,
    };
  }

  const sheetFiles = Object.keys(zip.files)
    .filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
    .sort((a, b) => {
      const an = Number(a.match(/(\d+)/)?.[1] || 0);
      const bn = Number(b.match(/(\d+)/)?.[1] || 0);
      return an - bn;
    });

  // Get sheet names from workbook.xml
  const sheetNames: Record<string, string> = {};
  const workbookXml = await zip.files['xl/workbook.xml']?.async('string').catch(() => '');
  if (workbookXml) {
    const re = /<sheet\s+name="([^"]+)"[^>]*\sr:id="(rId\d+)"/g;
    let m;
    while ((m = re.exec(workbookXml)) !== null) sheetNames[m[2]] = m[1];
  }

  // Pull all sharedStrings for cross-reference
  const ssXml = await zip.files['xl/sharedStrings.xml']?.async('string').catch(() => '');
  const allStrings: string[] = [];
  if (ssXml) {
    const re = /<t(?:\s[^>]*)?>([^<]*)<\/t>/g;
    let m;
    while ((m = re.exec(ssXml)) !== null) {
      const t = (m[1] || '').trim();
      if (t) allStrings.push(t);
    }
    if (allStrings.length === 0 && /count="\d/.test(ssXml)) {
      issues.push({ kind: 'all-strings-blank', severity: 'major',
        detail: 'sharedStrings.xml is empty — workbook has no text content at all.' });
    }
  }

  // ── Sheet-level checks ─────────────────────────────────────
  const sheetCount = sheetFiles.length;
  if (sheetCount === 0) {
    issues.push({ kind: 'no-sheets', severity: 'blocker', detail: 'Workbook has zero sheets.' });
  }

  let totalRows = 0;
  let totalFormulaErrors = 0;

  for (let i = 0; i < sheetFiles.length; i++) {
    const path = sheetFiles[i];
    const xml = await zip.files[path].async('string');
    const sheetLabel = `sheet${i + 1}`;

    // Row count — count <row …> elements
    const rowMatches = xml.match(/<row\b/g) || [];
    const rowCount = rowMatches.length;
    totalRows += rowCount;

    if (rowCount === 0) {
      issues.push({ sheet: sheetLabel, kind: 'empty-sheet', severity: 'major', detail: `${sheetLabel} has 0 rows.`, recoverable: true });
      continue;
    }
    if (rowCount < 3) {
      issues.push({ sheet: sheetLabel, kind: 'sheet-too-short', severity: 'minor',
        detail: `${sheetLabel} has only ${rowCount} row(s) — probably a stub.` });
    }

    // Formula errors — look for <c t="e"><v>#REF!</v> etc.
    for (const err of FORMULA_ERROR_VALUES) {
      const escaped = err.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`<c\\s[^>]*\\st="e"[^>]*>\\s*<v>${escaped}</v>`, 'g');
      const matches = xml.match(re) || [];
      if (matches.length > 0) {
        totalFormulaErrors += matches.length;
        issues.push({ sheet: sheetLabel, kind: 'formula-error', severity: 'blocker',
          detail: `${matches.length} cell(s) in ${sheetLabel} contain ${err}.`,
          evidence: err, recoverable: true });
      }
    }

    // Header row check — first <row> should have non-empty cells
    const firstRow = xml.match(/<row[\s>][\s\S]*?<\/row>/)?.[0] || '';
    const headerCells = firstRow.match(/<c\s[^>]*>(?:[\s\S]*?)<\/c>/g) || [];
    if (rowCount > 0 && headerCells.length === 0) {
      issues.push({ sheet: sheetLabel, kind: 'no-headers', severity: 'major',
        detail: `${sheetLabel} first row has no cells — missing headers.` });
    }
    // Blank cells in header row (cells with no value)
    const blankHeaderCells = headerCells.filter(c => !/<v>[^<]+<\/v>/.test(c) && !/<is>/.test(c)).length;
    if (blankHeaderCells > 0 && headerCells.length > 1) {
      issues.push({ sheet: sheetLabel, kind: 'header-blank-cell', severity: 'minor',
        detail: `${sheetLabel} has ${blankHeaderCells} blank header cell(s).` });
    }
  }

  // ── Content cross-reference ─────────────────────────────────
  if (opts.sourceCards && opts.sourceCards.length > 0 && allStrings.length > 0) {
    const corpus = allStrings.join(' | ').toLowerCase();
    const high = opts.sourceCards
      .filter(c => (c.conviction ?? 0) >= 85)
      .sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));
    let flagged = 0;
    for (const c of high) {
      const anchor = c.title.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(' ');
      if (!anchor) continue;
      if (!corpus.includes(anchor)) {
        issues.push({ kind: 'dropped-high-conviction-insight', severity: 'major',
          detail: `High-conviction card "${c.title}" (conv ${c.conviction}) not in workbook text.`,
          evidence: c.title });
        flagged++;
        if (flagged >= 5) break;
      }
    }
  }

  const rank = { blocker: 3, major: 2, minor: 1 };
  let worst: IssueSeverity | null = null;
  for (const i of issues) if (!worst || rank[i.severity] > rank[worst]) worst = i.severity;

  return {
    ok: issues.filter(i => i.severity === 'blocker').length === 0,
    sheetCount, rowCount: totalRows, formulaErrors: totalFormulaErrors,
    issues, worstSeverity: worst,
    elapsedMs: Date.now() - t0,
  };
}
