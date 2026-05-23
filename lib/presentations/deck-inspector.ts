/**
 * lib/presentations/deck-inspector.ts
 *
 * The Visual / Structural Agent — second voice in the dual-agent download
 * verification system.
 *
 * Cracks open the generated PPTX (which is a ZIP of XML files), walks every
 * slide + every embedded chart + every shape, and checks:
 *
 *   STRUCTURE
 *     • Slide count matches template's min/max/ideal
 *     • Charts present where template requires them
 *     • Expected slide flow (title → summary → insight → recommendation)
 *     • No empty / placeholder / truncated titles
 *
 *   VISUAL QUALITY (the new pass)
 *     • Brand palette: chart fills include the template's expected colours
 *     • Font sizes: title and body text within template's declared bands
 *     • Bounding boxes: text length doesn't exceed shape dimensions
 *       (catches overflow without needing to render)
 *     • Chart axis label content (not just presence) — labels aren't ""/"N/A"
 *     • Inter-chart palette consistency
 *
 *   CONTENT INTEGRITY (cross-checked with the source analysis)
 *     • Every analysis card with conviction >= 85 appears as a slide
 *       (no high-conviction insights silently dropped by the generator)
 *
 * Pure rules — no LLM cost. Target: ≤ 500ms for a typical 20-slide deck.
 */

import JSZip from 'jszip';
import { ruleFor, classifySlide, type TemplateRule } from './template-rules';

export type IssueSeverity = 'blocker' | 'major' | 'minor';

export interface InspectorIssue {
  slide?:    number;
  kind:
    | 'empty-title' | 'placeholder-text' | 'truncated-title'
    | 'chart-no-data' | 'chart-no-labels' | 'chart-bad-axis-label'
    | 'mixed-palette' | 'palette-off-brand'
    | 'font-too-small' | 'font-too-large' | 'font-inconsistent'
    | 'text-overflow'
    | 'slide-count-low' | 'slide-count-high'
    | 'no-charts' | 'flow-out-of-order'
    | 'dropped-high-conviction-insight'
    | 'image-missing-alt' | 'low-contrast'
    | 'parse-error';
  severity:  IssueSeverity;
  detail:    string;
  evidence?: string;
  /** True if this finding is auto-recoverable via /regenerate. The
   *  orchestrator uses this to decide whether to attempt auto-heal. */
  recoverable?: boolean;
}

export interface InspectorReport {
  ok:            boolean;
  templateName:  string | null;
  templateMatched: boolean;
  slideCount:    number;
  chartCount:    number;
  tableCount:    number;
  imageCount:    number;
  issues:        InspectorIssue[];
  worstSeverity: IssueSeverity | null;
  elapsedMs:     number;
}

const PLACEHOLDER_RE = [
  /^click to add (?:title|text|sub-?title)/i,
  /^add (?:a |your )?title/i,
  /^lorem ipsum/i, /^todo\b/i, /^placeholder/i,
  /^\[.*?\]$/,
];

// ── Tiny XML helpers (cheap regex — good enough for our shape) ──
function textFromXml(xml: string): string[] {
  const out: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const t = (m[1] || '').trim();
    if (t) out.push(t);
  }
  return out;
}
function isPlaceholder(t: string): boolean { return PLACEHOLDER_RE.some(re => re.test(t)); }
function looksTruncated(t: string): boolean {
  const trimmed = t.trim();
  if (!trimmed || /[.!?…)]$/.test(trimmed)) return false;
  if (/,\s*$/.test(trimmed)) return true;
  if (/\b(?:is|the|and|with|of|to|in|on|at|for|by|but|not just|and just|because)\s*$/i.test(trimmed)) return true;
  return false;
}

/** PPTX uses EMU (914400 EMU = 1 inch). Pull all `<p:sp>` shapes plus their
 *  text + a:rPr font sizes + xfrm dimensions for the overflow check. */
function extractShapes(xml: string): Array<{ text: string; sz: number[]; cx?: number; cy?: number }> {
  const shapes: Array<{ text: string; sz: number[]; cx?: number; cy?: number }> = [];
  // Split on <p:sp> boundaries. Cheap, not strictly DOM-correct, but works
  // for the shapes the pptxgenjs generator emits.
  const parts = xml.split(/<p:sp[\s>]/);
  for (let i = 1; i < parts.length; i++) {
    const body = parts[i];
    const text = textFromXml(body).join(' ');
    if (!text) continue;
    const sizes: number[] = [];
    const szRe = /<a:rPr[^>]*\ssz="(\d+)"/g;
    let m;
    while ((m = szRe.exec(body)) !== null) sizes.push(Number(m[1]));
    const xfrm = body.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
    const cx = xfrm ? Number(xfrm[1]) : undefined;
    const cy = xfrm ? Number(xfrm[2]) : undefined;
    shapes.push({ text, sz: sizes, cx, cy });
  }
  return shapes;
}

function paletteHexes(xml: string): string[] {
  const out: string[] = [];
  const re = /<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/g;
  let m;
  while ((m = re.exec(xml)) !== null) out.push(m[1].toLowerCase());
  return out;
}

/** Rough text-fits-in-box estimate. Conservative — we err on the side of
 *  NOT flagging unless overflow is highly likely. EMU width per char at
 *  font size sz (100ths of a point): ~sz * 70 (empirical for sans-serif). */
function likelyOverflows(text: string, sz: number, cx?: number, cy?: number): boolean {
  if (!cx || !cy || !sz || sz < 800) return false;
  const charsPerLine = Math.floor(cx / (sz * 70));
  if (charsPerLine <= 0) return false;
  const linesNeeded = Math.ceil(text.length / charsPerLine);
  const lineHeightEmu = sz * 140;
  const linesFit = Math.floor(cy / lineHeightEmu);
  return linesNeeded > linesFit && linesNeeded >= 3;
}

export interface InspectOpts {
  templateName?: string | null;
  /** Optional source analysis cards — enables the "high-conviction
   *  insight dropped" check. Each card needs at least { title, conviction }. */
  sourceCards?: Array<{ title: string; conviction?: number }>;
}

export async function inspectDeck(buffer: Buffer, opts: InspectOpts = {}): Promise<InspectorReport> {
  const t0 = Date.now();
  const issues: InspectorIssue[] = [];
  const rule = ruleFor(opts.templateName);
  const templateMatched = rule !== ruleFor(null);

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err: any) {
    return {
      ok: false, templateName: opts.templateName ?? null, templateMatched,
      slideCount: 0, chartCount: 0, tableCount: 0, imageCount: 0,
      worstSeverity: 'blocker',
      issues: [{ kind: 'parse-error', severity: 'blocker', detail: `Could not open PPTX: ${err.message}` }],
      elapsedMs: Date.now() - t0,
    };
  }

  const slideFiles = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => {
    const an = Number(a.match(/(\d+)/)?.[1] || 0);
    const bn = Number(b.match(/(\d+)/)?.[1] || 0);
    return an - bn;
  });
  const chartFiles = Object.keys(zip.files).filter(p => /^ppt\/charts\/chart\d+\.xml$/.test(p));
  const imageFiles = Object.keys(zip.files).filter(p => /^ppt\/media\//.test(p));

  const slideCount = slideFiles.length;
  const chartCount = chartFiles.length;
  const imageCount = imageFiles.length;

  // ── Template structural rules ───────────────────────────────
  if (slideCount < rule.slideCount.min) {
    issues.push({ kind: 'slide-count-low', severity: 'major',
      detail: `${slideCount} slides — template "${opts.templateName || 'default'}" expects ${rule.slideCount.min}–${rule.slideCount.max} (ideal ${rule.slideCount.ideal}).` });
  }
  if (slideCount > rule.slideCount.max) {
    issues.push({ kind: 'slide-count-high', severity: 'minor',
      detail: `${slideCount} slides — exceeds template max of ${rule.slideCount.max}.` });
  }
  if (rule.requireCharts && chartCount === 0) {
    issues.push({ kind: 'no-charts', severity: 'major',
      detail: `Template "${opts.templateName}" requires charts but the deck has none.` });
  }
  if (slideCount === 0) {
    issues.push({ kind: 'parse-error', severity: 'blocker', detail: 'PPTX contains 0 slides.' });
  }

  // ── Accessibility helpers ────────────────────────────────────
  // Pull <p:pic> elements + their <p:nvPicPr><p:cNvPr descr="…"/>
  // attribute. Missing/empty descr fails screen-readers.
  const checkAltText = (xml: string, slideNum: number) => {
    const picRe = /<p:pic\b[\s\S]*?<\/p:pic>/g;
    let m;
    while ((m = picRe.exec(xml)) !== null) {
      const block = m[0];
      const descrMatch = block.match(/<p:cNvPr[^>]*\sdescr="([^"]*)"/);
      const descr = descrMatch ? descrMatch[1].trim() : '';
      if (!descr) {
        issues.push({
          slide: slideNum, kind: 'image-missing-alt', severity: 'minor', recoverable: true,
          detail: `Image on slide ${slideNum} has no alt-text — fails screen-reader accessibility.`,
        });
        break; // one finding per slide
      }
    }
  };

  // Cheap contrast estimate: if a text-fill colour and the slide background
  // colour are both in the palette, flag if their luminance delta is < 0.3.
  const luminance = (hex: string) => {
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const lin = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const contrastRatio = (a: string, b: string) => {
    const la = luminance(a), lb = luminance(b);
    const [hi, lo] = la > lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
  };

  // ── Per-slide scan ───────────────────────────────────────────
  let tableCount = 0;
  const allTitleSizes: number[] = [];
  const allBodySizes: number[]  = [];
  const slideClassifications: Array<TemplateRule['expectedFlow'][number]> = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slideNum = i + 1;
    const xml = await zip.files[slideFiles[i]].async('string');
    if (/<a:tbl\b/.test(xml)) tableCount++;

    const texts = textFromXml(xml);
    const shapes = extractShapes(xml);
    const firstText = texts[0] || '';

    // Accessibility: alt text on images
    checkAltText(xml, slideNum);

    // Cheap contrast check: pull the first two distinct fills on the slide
    // and compute WCAG ratio. < 4.5 = AA fail for normal text.
    const fills = paletteHexes(xml);
    const distinctFills = [...new Set(fills)];
    if (distinctFills.length >= 2) {
      const ratio = contrastRatio(distinctFills[0], distinctFills[1]);
      if (ratio < 3.0) {
        issues.push({ slide: slideNum, kind: 'low-contrast', severity: 'minor', recoverable: false,
          detail: `Foreground/background contrast on slide ${slideNum} is ${ratio.toFixed(1)}:1 — below WCAG AA 4.5:1 minimum for normal text.` });
      }
    }

    // Empty / placeholder / truncated title
    if (!firstText && !/p:pic/.test(xml)) {
      issues.push({ slide: slideNum, kind: 'empty-title', severity: 'major', detail: 'Slide has no text and no image.' });
    } else if (firstText) {
      if (isPlaceholder(firstText)) issues.push({ slide: slideNum, kind: 'placeholder-text', severity: 'blocker', recoverable: true, detail: `Placeholder text in title: "${firstText}"`, evidence: firstText });
      else if (looksTruncated(firstText)) issues.push({ slide: slideNum, kind: 'truncated-title', severity: 'blocker', recoverable: true, detail: `Title appears truncated mid-sentence: "${firstText}"`, evidence: firstText });
    }
    for (const t of texts.slice(1)) {
      if (isPlaceholder(t)) { issues.push({ slide: slideNum, kind: 'placeholder-text', severity: 'major', detail: `Body text contains placeholder: "${t.slice(0, 60)}"`, evidence: t }); break; }
    }

    // Font sizes — emit AT MOST one font-too-small + one font-too-large per
    // slide so 30 axis labels on one slide don't flood the report. We track
    // sizes for the cross-deck consistency check separately.
    let flaggedSmall = false;
    let flaggedLarge = false;
    shapes.forEach((sh, idx) => {
      if (sh.sz.length === 0) return;
      // Skip tiny shapes (cx < 1 inch) — almost certainly axis/data labels
      // inside chart frames, not real content text. PPTX inlines those.
      if (sh.cx && sh.cx < 914400) {
        (idx === 0 ? allTitleSizes : allBodySizes).push(...sh.sz);
        return;
      }
      const targetMin = idx === 0 ? rule.titleSizeRange.min : rule.bodySizeRange.min;
      const targetMax = idx === 0 ? rule.titleSizeRange.max : rule.bodySizeRange.max;
      for (const sz of sh.sz) {
        if (sz < targetMin && !flaggedSmall) {
          issues.push({ slide: slideNum, kind: 'font-too-small', severity: 'minor', detail: `${idx === 0 ? 'Title' : 'Body'} font ${sz/100}pt is below template's ${targetMin/100}pt minimum.` });
          flaggedSmall = true;
        }
        if (sz > targetMax && !flaggedLarge) {
          issues.push({ slide: slideNum, kind: 'font-too-large', severity: 'minor', detail: `${idx === 0 ? 'Title' : 'Body'} font ${sz/100}pt is above template's ${targetMax/100}pt maximum.` });
          flaggedLarge = true;
        }
      }
      (idx === 0 ? allTitleSizes : allBodySizes).push(...sh.sz);

      // Text-overflow estimate
      const dominantSize = sh.sz[0];
      if (likelyOverflows(sh.text, dominantSize, sh.cx, sh.cy)) {
        issues.push({ slide: slideNum, kind: 'text-overflow', severity: 'major',
          detail: `Shape text (${sh.text.length} chars at ${dominantSize/100}pt) likely overflows its ${Math.round((sh.cx||0)/914400*100)/100}\" × ${Math.round((sh.cy||0)/914400*100)/100}\" frame.` });
      }
    });

    slideClassifications.push(classifySlide(firstText, texts, i, slideFiles.length));
  }

  // ── Font consistency across deck ──────────────────────────────
  const distinctTitleSizes = new Set(allTitleSizes);
  if (distinctTitleSizes.size > 3) {
    issues.push({ kind: 'font-inconsistent', severity: 'minor',
      detail: `${distinctTitleSizes.size} distinct title font sizes across deck — pick ≤ 2 for consistency.` });
  }

  // ── Slide flow check vs template ──────────────────────────────
  if (rule.expectedFlow.length > 0 && templateMatched) {
    for (let i = 0; i < Math.min(rule.expectedFlow.length, slideClassifications.length); i++) {
      const expected = rule.expectedFlow[i];
      const actual = slideClassifications[i];
      if (expected && actual && expected !== actual && actual !== 'insight') {
        issues.push({ slide: i + 1, kind: 'flow-out-of-order', severity: 'minor',
          detail: `Slide ${i + 1} reads as "${actual}" but the template expects "${expected}" at this position.` });
      }
    }
  }

  // ── Chart scan ─────────────────────────────────────────────────
  const allPalettes: string[][] = [];
  for (const chartPath of chartFiles) {
    const xml = await zip.files[chartPath].async('string');
    const valBlocks = xml.match(/<c:val>[\s\S]*?<\/c:val>/g) || [];
    const hasNumericData = valBlocks.some(b => /<c:v>\s*-?\d/.test(b));
    if (!hasNumericData) {
      issues.push({ kind: 'chart-no-data', severity: 'blocker', detail: `${chartPath.split('/').pop()} has no numeric data points.` });
    }
    const catBlocks = xml.match(/<c:cat>[\s\S]*?<\/c:cat>/g) || [];
    const catTexts: string[] = [];
    const catRe = /<c:v>([^<]+)<\/c:v>/g;
    let m;
    for (const cb of catBlocks) {
      catRe.lastIndex = 0;
      while ((m = catRe.exec(cb)) !== null) {
        const t = m[1].trim();
        if (t) catTexts.push(t);
      }
    }
    if (valBlocks.length > 0 && catTexts.length === 0) {
      issues.push({ kind: 'chart-no-labels', severity: 'major', detail: `${chartPath.split('/').pop()} has data but no category labels.` });
    }
    // Bad axis label content — empty-string-only, "N/A", numeric noise
    if (catTexts.length > 0 && catTexts.every(t => /^(n\/a|na|none|null|undefined|-)$/i.test(t))) {
      issues.push({ kind: 'chart-bad-axis-label', severity: 'major',
        detail: `${chartPath.split('/').pop()} labels are all placeholder values (${catTexts.slice(0, 3).join(', ')}).` });
    }
    allPalettes.push(paletteHexes(xml));
  }

  // ── Palette consistency + brand-palette check ─────────────────
  const usedHexes = new Set<string>();
  allPalettes.forEach(p => p.forEach(h => usedHexes.add(h)));
  const fingerprints = new Set(allPalettes.map(p => [...new Set(p)].sort().slice(0, 8).join('-')));
  if (fingerprints.size > 2 && fingerprints.size > 1) {
    issues.push({ kind: 'mixed-palette', severity: 'minor',
      detail: `${fingerprints.size} distinct chart palettes across the deck — pick one.` });
  }
  if (rule.brandPalette.length > 0 && allPalettes.length > 0) {
    const brandLower = rule.brandPalette.map(c => c.toLowerCase());
    const brandUsed = brandLower.filter(c => usedHexes.has(c)).length;
    const coverage = brandUsed / brandLower.length;
    if (coverage < 0.34) {
      issues.push({ kind: 'palette-off-brand', severity: 'major',
        detail: `Only ${brandUsed}/${brandLower.length} template brand colours appear in chart fills. Charts may not look on-brand.` });
    }
  }

  // ── Content-vs-deck cross-reference ───────────────────────────
  // Only enforced for COMPREHENSIVE templates (deep-dive). Executive
  // briefings intentionally summarise the top insights, so dropping
  // 100+ cards from a 142-card analysis is by design — not a defect.
  // For comprehensive templates we still cap at the top 5 missed to
  // avoid wall-of-text reports.
  if (opts.sourceCards && opts.sourceCards.length > 0 && rule.enforceComprehensive) {
    const slideTitles: string[] = [];
    for (let i = 0; i < slideFiles.length; i++) {
      const xml = await zip.files[slideFiles[i]].async('string');
      const ft = textFromXml(xml)[0] || '';
      slideTitles.push(ft.toLowerCase());
    }
    const corpus = slideTitles.join(' | ');
    const high = [...opts.sourceCards]
      .filter(c => (c.conviction ?? 0) >= 85)
      .sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));
    let flagged = 0;
    for (const c of high) {
      const anchor = c.title.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3).slice(0, 3).join(' ');
      if (!anchor) continue;
      if (!corpus.includes(anchor)) {
        issues.push({
          kind: 'dropped-high-conviction-insight',
          severity: 'major',
          detail: `High-conviction card "${c.title}" (conv ${c.conviction}) has no matching slide.`,
          evidence: c.title,
        });
        flagged++;
        if (flagged >= 5) break;
      }
    }
  }

  // ── Worst severity ────────────────────────────────────────────
  const rank = { blocker: 3, major: 2, minor: 1 };
  let worst: IssueSeverity | null = null;
  for (const i of issues) {
    if (!worst || rank[i.severity] > rank[worst]) worst = i.severity;
  }

  return {
    ok: issues.filter(i => i.severity === 'blocker').length === 0,
    templateName: opts.templateName ?? null,
    templateMatched,
    slideCount, chartCount, tableCount, imageCount,
    issues,
    worstSeverity: worst,
    elapsedMs: Date.now() - t0,
  };
}
