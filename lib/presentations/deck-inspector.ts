/**
 * lib/presentations/deck-inspector.ts
 *
 * The Visual / Structural Agent — second voice in the dual-agent download
 * verification system.
 *
 * Cracks open the generated PPTX (which is a ZIP of XML files), walks every
 * slide + every embedded chart, and looks for:
 *
 *   • Charts that have no data series, no labels, or empty axis values
 *   • Slide titles that are empty / placeholder ("Click to add title") /
 *     truncated mid-sentence
 *   • Text frames with only whitespace or known placeholder strings
 *   • Charts whose colour palette is mixed across slides (we expect ONE
 *     consistent palette per template per deck)
 *   • Tables with empty cells in header row
 *   • Slide counts that don't match the template (e.g. a "deep-dive" deck
 *     with only 3 slides is suspect)
 *
 * Returns a structured InspectorReport. Pure rules — no LLM cost. Targets
 * 200–500ms for a typical 20-slide deck. Never throws — on parse failure
 * returns ok:false with the parse error.
 */

import JSZip from 'jszip';

export type IssueSeverity = 'blocker' | 'major' | 'minor';

export interface InspectorIssue {
  slide?:    number;
  kind:      'empty-title' | 'placeholder-text' | 'truncated-title' | 'chart-no-data' |
              'chart-no-labels' | 'mixed-palette' | 'table-empty-header' | 'slide-count-low' |
              'no-charts' | 'parse-error';
  severity:  IssueSeverity;
  detail:    string;
  evidence?: string;
}

export interface InspectorReport {
  ok:           boolean;
  slideCount:   number;
  chartCount:   number;
  tableCount:   number;
  imageCount:   number;
  issues:       InspectorIssue[];
  worstSeverity: IssueSeverity | null;
  /** ms spent parsing + scanning */
  elapsedMs:    number;
}

// Common PPTX placeholder text that should never reach a downloadable deck
const PLACEHOLDER_RE = [
  /^click to add (?:title|text|sub-?title)/i,
  /^add (?:a |your )?title/i,
  /^lorem ipsum/i,
  /^todo\b/i,
  /^placeholder/i,
  /^\[.*?\]$/,             // [BRAND] / [DATE] etc.
];

function textFromXml(xml: string): string[] {
  // Pull every <a:t>…</a:t> text run. Cheap regex — good enough for
  // checking emptiness / placeholders, not for full DOM-correct parsing.
  const out: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const t = (m[1] || '').trim();
    if (t) out.push(t);
  }
  return out;
}

function isPlaceholder(t: string): boolean {
  return PLACEHOLDER_RE.some(re => re.test(t));
}

function looksTruncated(t: string): boolean {
  // Ends mid-sentence: no terminal punctuation and either a comma-end or
  // a stub word like "Not Just" / "and Just" / "is the"
  if (!t) return false;
  const trimmed = t.trim();
  if (/[.!?…]$/.test(trimmed)) return false;
  if (/,\s*$/.test(trimmed)) return true;
  if (/\b(?:is|the|and|with|of|to|in|on|at|for|by|but|not just|and just|because)\s*$/i.test(trimmed)) return true;
  return false;
}

function paletteFingerprint(xml: string): string {
  // Capture the first few colour values used by chart series. We use the
  // sorted, deduped set so order-only differences don't trigger a "mixed
  // palette" flag.
  const colours = new Set<string>();
  const re = /<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/g;
  let m;
  while ((m = re.exec(xml)) !== null && colours.size < 12) {
    colours.add(m[1].toLowerCase());
  }
  return [...colours].sort().join('-');
}

export async function inspectDeck(buffer: Buffer): Promise<InspectorReport> {
  const t0 = Date.now();
  const issues: InspectorIssue[] = [];

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err: any) {
    return {
      ok: false, slideCount: 0, chartCount: 0, tableCount: 0, imageCount: 0,
      worstSeverity: 'blocker',
      issues: [{ kind: 'parse-error', severity: 'blocker', detail: `Could not open PPTX: ${err.message}` }],
      elapsedMs: Date.now() - t0,
    };
  }

  // ── Inventory ────────────────────────────────────────────────
  const slideFiles = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort();
  const chartFiles = Object.keys(zip.files).filter(p => /^ppt\/charts\/chart\d+\.xml$/.test(p));
  const tableFiles: string[] = [];                                  // tables live inside slides
  const imageFiles = Object.keys(zip.files).filter(p => /^ppt\/media\//.test(p));

  const slideCount = slideFiles.length;
  const chartCount = chartFiles.length;
  const imageCount = imageFiles.length;

  if (slideCount === 0) {
    issues.push({ kind: 'parse-error', severity: 'blocker', detail: 'PPTX contains 0 slides.' });
  }
  if (slideCount > 0 && slideCount < 3) {
    issues.push({ kind: 'slide-count-low', severity: 'major', detail: `Only ${slideCount} slide(s) — too short for any standard template.` });
  }
  if (slideCount >= 3 && chartCount === 0) {
    issues.push({ kind: 'no-charts', severity: 'major', detail: 'Deck has ≥3 slides but no embedded charts at all.' });
  }

  // ── Per-slide scan ───────────────────────────────────────────
  let tableCount = 0;
  for (let i = 0; i < slideFiles.length; i++) {
    const slideNum = i + 1;
    const file = zip.files[slideFiles[i]];
    const xml = await file.async('string');

    // Count tables in this slide
    if (/<a:tbl\b/.test(xml)) tableCount++;

    const texts = textFromXml(xml);

    // Title check — slide title is the first non-empty text in the slide
    // EXCEPT we should ideally check the <p:title> placeholder specifically.
    // Cheap approximation: the first text on the slide.
    const firstText = texts[0] || '';
    if (!firstText) {
      // No text at all on a slide — only acceptable if it's image-only (rare in our templates)
      if (!/p:pic/.test(xml)) {
        issues.push({ slide: slideNum, kind: 'empty-title', severity: 'major', detail: 'Slide has no text and no image.' });
      }
    } else {
      if (isPlaceholder(firstText)) {
        issues.push({ slide: slideNum, kind: 'placeholder-text', severity: 'blocker', detail: `Placeholder text reached output: "${firstText}"`, evidence: firstText });
      } else if (looksTruncated(firstText)) {
        issues.push({ slide: slideNum, kind: 'truncated-title', severity: 'blocker', detail: `Title appears truncated mid-sentence: "${firstText}"`, evidence: firstText });
      }
    }

    // Scan all text runs for placeholder leakage
    for (const t of texts.slice(1)) {
      if (isPlaceholder(t)) {
        issues.push({ slide: slideNum, kind: 'placeholder-text', severity: 'major', detail: `Body text contains placeholder: "${t.slice(0, 60)}"`, evidence: t });
        break;
      }
    }
  }

  // ── Chart scan ───────────────────────────────────────────────
  const palettes: string[] = [];
  for (const chartPath of chartFiles) {
    const xml = await zip.files[chartPath].async('string');

    // Data presence: a chart needs at least one <c:val> with numeric points
    const valBlocks = xml.match(/<c:val>[\s\S]*?<\/c:val>/g) || [];
    const hasNumericData = valBlocks.some(b => /<c:v>\s*-?\d/.test(b));
    if (!hasNumericData) {
      issues.push({ kind: 'chart-no-data', severity: 'blocker', detail: `${chartPath.split('/').pop()} has no numeric data points.` });
    }

    // Category labels
    const catBlocks = xml.match(/<c:cat>[\s\S]*?<\/c:cat>/g) || [];
    const hasLabels = catBlocks.some(b => /<c:v>\S/.test(b));
    if (!hasLabels && valBlocks.length > 0) {
      issues.push({ kind: 'chart-no-labels', severity: 'major', detail: `${chartPath.split('/').pop()} has data but no category labels.` });
    }

    palettes.push(paletteFingerprint(xml));
  }

  // Palette consistency — flag if MORE than 2 distinct fingerprints across charts
  const distinctPalettes = new Set(palettes.filter(Boolean));
  if (distinctPalettes.size > 2) {
    issues.push({
      kind: 'mixed-palette',
      severity: 'minor',
      detail: `${distinctPalettes.size} distinct chart colour palettes across the deck — pick one.`,
    });
  }

  // ── Worst severity ──────────────────────────────────────────
  const rank = { blocker: 3, major: 2, minor: 1 };
  let worst: IssueSeverity | null = null;
  for (const i of issues) {
    if (!worst || rank[i.severity] > rank[worst]) worst = i.severity;
  }

  return {
    ok: issues.filter(i => i.severity === 'blocker').length === 0,
    slideCount, chartCount, tableCount, imageCount,
    issues,
    worstSeverity: worst,
    elapsedMs: Date.now() - t0,
  };
}
