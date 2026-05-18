/**
 * PRISM Agency-Grade PPTX Generator
 *
 * Produces a single, fully-populated client-ready deck organised around the
 * four PRISM pillars: Content · Commerce · Communication · Culture.
 *
 * Slide order
 * ───────────
 *  1. Cover (title, brief name, date)
 *  2. Agenda (4 pillars overview)
 *  3–N. For each non-empty pillar:
 *        a. Section divider slide
 *        b. One insight slide per insight card (hook + observation + recommendation + stat)
 *        c. "So What / Recommendations" summary slide
 *  Last. Closing / What's Next
 *
 * Canvas: LAYOUT_WIDE (13.33 × 7.5 inches — 16:9)
 */

import PptxGenJS from 'pptxgenjs';
import { getTemplate } from './templates';

// ─── Canvas ──────────────────────────────────────────────────────────────────
const W  = 13.33;
const H  = 7.5;
const ML = 0.60;   // left margin
const MR = 0.50;   // right margin
const CW = W - ML - MR;

// ─── Typography ──────────────────────────────────────────────────────────────
const FH = 'Arial';    // heading / display
const FB = 'Calibri';  // body / UI

// ─── Data model ──────────────────────────────────────────────────────────────
export interface InsightCard {
  title:        string;   // hook / insight headline
  obs:          string;   // observation / finding
  rec:          string;   // recommendation
  stat?:        string;   // key statistic e.g. "4.2× higher engagement"
  source?:      string;   // data source label
  conviction?:  number;   // 0-100 confidence score
  // Native chart data — passed directly to prs.addChart()
  chartType?:   string;   // e.g. 'bar', 'hbar', 'doughnut', 'radar', ...
  chartLabels?: string[]; // category labels
  chartValues?: number[]; // primary series values
  chartValues2?:number[]; // secondary series (combo charts)
}

export interface PillarData {
  insights: InsightCard[];
}

export interface PresentationData {
  templateId:      string;
  briefName:       string;
  headline:        string;
  objective:       string;
  date?:           string;
  // 9-pillar structured data (populated from results_json.charts)
  content:         PillarData;
  commerce:        PillarData;
  communication:   PillarData;
  culture:         PillarData;
  channel?:        PillarData;
  media?:          PillarData;
  creative?:       PillarData;
  pricing?:        PillarData;
  search?:         PillarData;
  // Flat fallbacks (used for closing slide)
  observations:    string[];
  recommendations: string[];

  // ── NEW (Tier 1 PPT push) — carried from results_json.overview /
  //    results_json.nuggets / results_json.executiveSummary and from the
  //    linked brief row so the deck can show real synthesised content. ──
  brand?:            string;     // brief.brand
  category?:         string;     // brief.category
  audienceDescriptor?: string;   // "18-34 · Metro+T1/T2 · All Genders"
  audienceSnapshot?: string;     // 2-sentence character sketch from overview
  strategicRead?:    string;     // 90-130 word narrative paragraph
  nextMoves?:        string[];   // top 3 bucket-diverse actions
  briefFlavour?:     'LAUNCH' | 'DEFEND' | 'GROW' | null;
  competitors?:      string;     // raw comma list from brief
  categoryValue?:    string;     // "₹45,000 Cr"
  categoryCAGR?:     string;     // "4.1%"
  sourceCount?:      number;     // how many files / sheets fed the analysis
  sourceFiles?:      string[];   // labels for source attribution
  // Deterministic computed nuggets used by the Stats Snapshot slide
  nuggets?: {
    ask?:         { headline?: string; stat?: string; hoverLines?: string[] };
    keyword?:     { headline?: string; stat?: string; hoverLines?: string[] };
    helium10?:    { headline?: string; stat?: string; hoverLines?: string[] };
    competition?: { headline?: string; stat?: string; hoverLines?: string[] };
    cultural?:    { headline?: string; stat?: string; hoverLines?: string[] };
    trust?:       { headline?: string; stat?: string; hoverLines?: string[] };
  };
}

// ─── Pillar visual identity ───────────────────────────────────────────────────
interface PillarMeta {
  label:   string;
  icon:    string;
  color:   string;  // primary hex
  light:   string;  // very light bg hex
  dark:    string;  // deep dark hex for divider
}

const PILLARS: Record<string, PillarMeta> = {
  content:       { label: 'Content',       icon: '📝', color: '2563EB', light: 'EFF6FF', dark: '1E3A8A' },
  commerce:      { label: 'Commerce',      icon: '🛒', color: '059669', light: 'ECFDF5', dark: '064E3B' },
  communication: { label: 'Communication', icon: '📢', color: 'D97706', light: 'FFFBEB', dark: '78350F' },
  culture:       { label: 'Culture',       icon: '🌍', color: '7C3AED', light: 'F5F3FF', dark: '4C1D95' },
  channel:       { label: 'Channel',       icon: '📡', color: '0891B2', light: 'ECFEFF', dark: '164E63' },
  media:         { label: 'Media',         icon: '🎬', color: 'EA580C', light: 'FFF7ED', dark: '7C2D12' },
  creative:      { label: 'Creative',      icon: '🎨', color: 'C026D3', light: 'FDF4FF', dark: '701A75' },
  pricing:       { label: 'Pricing',       icon: '💰', color: 'DC2626', light: 'FEF2F2', dark: '7F1D1D' },
  search:        { label: 'Search',        icon: '🔍', color: '0D9488', light: 'F0FDFA', dark: '134E4A' },
};

const PILLAR_ORDER: Array<keyof typeof PILLARS> = ['content', 'commerce', 'communication', 'culture', 'channel', 'media', 'creative', 'pricing', 'search'];

// ─── Presentation-level palette ───────────────────────────────────────────────
interface Palette {
  dark: string;
  mid:  string;
  pri:  string;
  acc:  string;
  tl:   string;
}

const TEMPLATE_PALETTE: Record<string, Palette> = {
  executive_briefing: { dark:'0D1B2A', mid:'1A3655', pri:'1C6DD0', acc:'E8A020', tl:'7A9CC0' },
  client_pitch:       { dark:'0A0E27', mid:'1A2766', pri:'2563EB', acc:'F97316', tl:'7096C4' },
  deep_dive:          { dark:'1E1B4B', mid:'312E81', pri:'4F46E5', acc:'A78BFA', tl:'818CF8' },
  board_presentation: { dark:'0F172A', mid:'1E293B', pri:'334155', acc:'94A3B8', tl:'64748B' },
  team_update:        { dark:'2D1B69', mid:'4C1D95', pri:'7C3AED', acc:'C4B5FD', tl:'A78BFA' },
  investor_update:    { dark:'1A0505', mid:'7F1D1D', pri:'DC2626', acc:'FCA5A5', tl:'F87171' },
  quick_overview:     { dark:'001B33', mid:'0C4A6E', pri:'0891B2', acc:'38BDF8', tl:'7DD3FC' },
};

function getPal(tid: string): Palette {
  return TEMPLATE_PALETTE[tid] ?? TEMPLATE_PALETTE['executive_briefing'];
}

// ─── Drawing primitives ───────────────────────────────────────────────────────
function r(s: any, x: number, y: number, w: number, h: number, color: string) {
  s.addShape('rect', { x, y, w, h, fill: { color }, line: { type: 'none', width: 0 } });
}

function ln(s: any, x: number, y: number, w: number, color: string, pt = 0.75) {
  s.addShape('line', { x, y, w, h: 0, line: { color, width: pt } });
}

function t(s: any, text: string, x: number, y: number, w: number, h: number, o: Record<string, any>) {
  s.addText(text || '', { x, y, w, h, wrap: true, ...o });
}

function footer(s: any, no: number, brief: string, dark = false, lineColor = 'E2E8F0') {
  const c = dark ? 'FFFFFF60' : '94A3B8';
  ln(s, ML, H - 0.42, CW, dark ? 'FFFFFF20' : lineColor, 0.5);
  t(s, brief.toUpperCase(), ML, H - 0.38, 6, 0.25,
    { fontSize: 7.5, color: c, fontFace: FB, align: 'left', charSpacing: 1.5 });
  t(s, String(no), W - MR - 0.4, H - 0.38, 0.4, 0.25,
    { fontSize: 7.5, color: c, fontFace: FB, align: 'right' });
}

// ─── Slide 1: Cover (designer redesign — visual pass 1) ─────────────────────
// Composition: asymmetric. Left 2/3 = type-driven hero (eyebrow → big
// headline → byline). Right 1/3 = data context column (flavour badge,
// category badge, audience badge, source badge stacked vertically).
// Whitespace-forward. No emoji on the cover.
function slideCover(prs: any, d: PresentationData, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: 'FAFAFA' };  // soft off-white background

  // ── Left column — type-driven hero ─────────────────────────────────
  const heroX = 0.70;
  const heroW = W * 0.62;

  // Top accent — thin coloured strip, full width
  r(s, 0, 0, W, 0.08, p.pri);

  // Brand tag (small label in top-left)
  t(s, 'PRISM · INSIGHTS REPORT', heroX, 0.50, 4, 0.22,
    { fontSize: 8.5, color: '64748B', fontFace: FB, bold: true, charSpacing: 3.5 });

  // Brand name in small caps under the tag (if present)
  if (d.brand) {
    t(s, d.brand.toUpperCase(), heroX, 0.80, heroW, 0.32,
      { fontSize: 14, color: '0F172A', fontFace: FB, bold: true, charSpacing: 2 });
  }

  // Big headline — the only thing that should grab the eye
  const headlineText = d.headline || 'Strategic Insights';
  const headlineSize = headlineText.length > 90 ? 32 : headlineText.length > 60 ? 38 : 46;
  t(s, headlineText, heroX, 1.85, heroW, 3.6,
    { fontSize: headlineSize, color: '0F172A', fontFace: FH, bold: true, lineSpacingMultiple: 1.12, valign: 'top' });

  // Subtle divider
  ln(s, heroX, 5.85, 1.4, p.pri, 2.0);

  // Byline — brief name + date
  t(s, (d.briefName || 'Analysis Report'), heroX, 6.05, heroW, 0.30,
    { fontSize: 12.5, color: '334155', fontFace: FB, bold: true });
  const dateStr = d.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  t(s, dateStr, heroX, 6.42, heroW, 0.24,
    { fontSize: 10, color: '94A3B8', fontFace: FB });

  // ── Right column — context badges stacked vertically ──────────────
  const rightX = W - 4.10;
  const rightW = 3.40;

  // Flavour badge — bold, colour-coded, sits at top
  if (d.briefFlavour) {
    const flavourBg = { LAUNCH: '10B981', DEFEND: 'EF4444', GROW: 'F59E0B' }[d.briefFlavour] || p.pri;
    r(s, rightX, 0.55, rightW, 0.62, flavourBg);
    t(s, `${d.briefFlavour} BRIEF`, rightX, 0.72, rightW, 0.30,
      { fontSize: 14, color: 'FFFFFF', fontFace: FH, bold: true, align: 'center', charSpacing: 4 });
  }

  // Context cards — stacked vertically below the flavour badge
  type CtxCard = { eyebrow: string; value: string; sub?: string; color: string };
  const ctxCards: CtxCard[] = [];
  if (d.audienceDescriptor) ctxCards.push({ eyebrow: 'AUDIENCE',  value: d.audienceDescriptor, color: '0891B2' });
  if (d.categoryValue)      ctxCards.push({ eyebrow: 'CATEGORY',  value: d.categoryValue, sub: d.categoryCAGR ? `${d.categoryCAGR} CAGR` : (d.category || ''), color: '7C3AED' });
  if (d.sourceCount)        ctxCards.push({ eyebrow: 'SOURCES',   value: `${d.sourceCount} file${d.sourceCount > 1 ? 's' : ''}`, sub: 'analysed', color: '0D9488' });

  const cardY0 = d.briefFlavour ? 1.50 : 0.55;
  const cardH  = 1.20;
  const cardGap = 0.20;
  ctxCards.forEach((card, i) => {
    const y = cardY0 + i * (cardH + cardGap);
    // Card bg
    r(s, rightX, y, rightW, cardH, 'FFFFFF');
    // Left colour strip
    r(s, rightX, y, 0.10, cardH, card.color);
    // Eyebrow
    t(s, card.eyebrow, rightX + 0.30, y + 0.18, rightW - 0.40, 0.22,
      { fontSize: 8.5, color: card.color, fontFace: FB, bold: true, charSpacing: 2.5 });
    // Value (big)
    t(s, card.value, rightX + 0.30, y + 0.42, rightW - 0.40, 0.46,
      { fontSize: card.value.length > 25 ? 14 : 18, color: '0F172A', fontFace: FH, bold: true, valign: 'top', wrap: true });
    // Sub
    if (card.sub) {
      t(s, card.sub, rightX + 0.30, y + cardH - 0.32, rightW - 0.40, 0.24,
        { fontSize: 10, color: '64748B', fontFace: FB, italic: true });
    }
  });

  // ── Footer ribbon (subtle) ─────────────────────────────────────────
  ln(s, 0.70, H - 0.42, W - 1.4, 'E2E8F0', 0.5);
  t(s, 'CONFIDENTIAL · STRATEGIC USE ONLY', 0.70, H - 0.38, 6, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, bold: true, charSpacing: 3 });
  t(s, 'PAGE 01', W - MR - 1.0, H - 0.38, 1, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, align: 'right', charSpacing: 1.5 });

  // ── Speaker notes ──────────────────────────────────────────────────
  const notesParts = [
    d.brand && `Brand: ${d.brand}`,
    d.category && `Category: ${d.category}`,
    d.objective && `Objective: ${d.objective}`,
    d.audienceDescriptor && `Audience: ${d.audienceDescriptor}`,
    d.briefFlavour && `Brief flavour: ${d.briefFlavour}`,
    d.competitors && `Tracked competitors: ${d.competitors}`,
    d.categoryValue && `Category value: ${d.categoryValue}${d.categoryCAGR ? ' (' + d.categoryCAGR + ' CAGR)' : ''}`,
    d.sourceCount && `Source files: ${d.sourceCount}${d.sourceFiles?.length ? ' (' + d.sourceFiles.join(', ') + ')' : ''}`,
    '',
    'Open by reading the headline aloud, pause for 2 seconds. Then anchor the room: name the brand, the audience moment, and the brief flavour. Right-column cards are reference only — do not read them off the slide.',
  ].filter(Boolean).join('\n');
  if (notesParts) s.addNotes(notesParts);
}

// ─── Executive Summary slide (visual pass 5 — magazine pull-quote aesthetic)
// Sits between Cover and Stats Snapshot. Carries the Strategic Read
// paragraph (the only narrative connective tissue on the deck) + Audience
// Snapshot + top 3 Next Moves.
function slideExecutiveSummary(prs: any, d: PresentationData, p: Palette, slideNo: number) {
  const s = prs.addSlide();
  s.background = { color: 'FAFAFA' };

  // Thin top accent
  r(s, 0, 0, W, 0.08, p.pri);

  // Header
  t(s, 'EXECUTIVE SUMMARY', 0.70, 0.42, 6, 0.24,
    { fontSize: 9.5, color: '64748B', fontFace: FB, bold: true, charSpacing: 3.5 });
  // Use brief flavour as a visual cue if present, else fall back to headline
  const subTitle = d.briefFlavour ? `${d.briefFlavour} BRIEF · ${d.brand || ''}`.trim() : (d.briefName || 'Strategic Readout');
  t(s, subTitle, 0.70, 0.74, CW, 0.42,
    { fontSize: 22, color: '0F172A', fontFace: FH, bold: true });
  ln(s, 0.70, 1.28, 0.80, p.pri, 2.5);

  // Layout: left ~60% Strategic Read, right ~40% Next Moves
  const leftX  = 0.70;
  const leftW  = CW * 0.58;
  const rightX = leftX + leftW + 0.40;
  const rightW = W - rightX - 0.70;
  const bodyY  = 1.55;

  // ── LEFT: Strategic Read ──
  t(s, 'STRATEGIC READ', leftX, bodyY, leftW, 0.22,
    { fontSize: 9, color: '0891B2', fontFace: FB, bold: true, charSpacing: 3 });
  t(s, 'Synthesised from data', leftX + 2.0, bodyY + 0.02, 2.4, 0.20,
    { fontSize: 8, color: '94A3B8', fontFace: FB, italic: true });

  const readText = d.strategicRead?.trim() || d.audienceSnapshot?.trim() || d.objective?.trim() || '';
  t(s, readText || 'Strategic read not available for this analysis.',
    leftX, bodyY + 0.36, leftW, 4.0,
    {
      fontSize: 13.5, color: '1F2937', fontFace: FB,
      lineSpacingMultiple: 1.62, valign: 'top', wrap: true,
    });

  // Audience Snapshot (only if Strategic Read also present)
  if (d.strategicRead && d.audienceSnapshot) {
    const snapY = bodyY + 4.50;
    r(s, leftX, snapY, leftW, 0.96, 'FFFFFF');
    r(s, leftX, snapY, 0.05, 0.96, '7C3AED');  // edge accent
    t(s, 'AUDIENCE SNAPSHOT', leftX + 0.22, snapY + 0.14, 3, 0.20,
      { fontSize: 8.5, color: '7C3AED', fontFace: FB, bold: true, charSpacing: 2.5 });
    t(s, d.audienceSnapshot, leftX + 0.22, snapY + 0.36, leftW - 0.40, 0.56,
      { fontSize: 10.5, color: '475569', fontFace: FB, italic: true, lineSpacingMultiple: 1.42, wrap: true });
  }

  // ── RIGHT: Next Moves ──
  t(s, 'NEXT MOVES', rightX, bodyY, rightW, 0.22,
    { fontSize: 9, color: 'D97706', fontFace: FB, bold: true, charSpacing: 3 });
  t(s, 'Bucket-diverse', rightX + 1.7, bodyY + 0.02, 2.0, 0.20,
    { fontSize: 8, color: '94A3B8', fontFace: FB, italic: true });

  const moves = Array.isArray(d.nextMoves) && d.nextMoves.length > 0
    ? d.nextMoves
    : (Array.isArray(d.recommendations) ? d.recommendations.slice(0, 3) : []);

  const moveCardH = 1.42;
  const moveGap   = 0.20;
  moves.slice(0, 3).forEach((move, i) => {
    const y = bodyY + 0.36 + i * (moveCardH + moveGap);
    r(s, rightX, y, rightW, moveCardH, 'FFFFFF');
    // Large typographic number on left
    t(s, String(i + 1).padStart(2, '0'), rightX + 0.15, y + 0.15, 0.75, moveCardH - 0.30,
      { fontSize: 30, color: 'D97706', fontFace: FH, bold: true, valign: 'middle', align: 'left' });
    // Move text
    const moveText = move.length > 220 ? move.slice(0, 218) + '…' : move;
    t(s, moveText, rightX + 0.90, y + 0.16, rightW - 1.00, moveCardH - 0.30,
      { fontSize: 10.5, color: '1F2937', fontFace: FB, lineSpacingMultiple: 1.42, valign: 'top', wrap: true });
    // Bottom hairline for separation
    r(s, rightX, y + moveCardH - 0.01, rightW, 0.01, 'E2E8F0');
  });

  // Footer ribbon
  ln(s, 0.70, H - 0.42, W - 1.4, 'E2E8F0', 0.5);
  t(s, d.briefName.toUpperCase(), 0.70, H - 0.38, 8, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, bold: true, charSpacing: 2 });
  t(s, `PAGE ${String(slideNo).padStart(2, '0')}`, W - MR - 1, H - 0.38, 1, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, align: 'right', charSpacing: 1.5 });

  // Speaker notes
  const notes = [
    `Strategic Read (full):`,
    readText,
    '',
    d.audienceSnapshot && `Audience Snapshot: ${d.audienceSnapshot}`,
    '',
    'Top moves to land verbally:',
    ...moves.slice(0, 3).map((m, i) => `${i + 1}. ${m}`),
    '',
    'Delivery: open by reading the eyebrow ("Executive Summary"), then the headline. Pause. Read the Strategic Read paragraph slowly — that is the heart of this deck. The Next Moves on the right are the so-what; tie each one back to a phrase in the paragraph.',
  ].filter(Boolean).join('\n');
  s.addNotes(notes);
}

// ─── Tier 1 B: Stats Snapshot (visual pass 2 — hero big-number tiles) ──────
// Composition: title block top (4 lines breathing room), then 2×3 hero
// tile grid (or 3×2 depending on tile count). Each tile is a BIG number
// (~52pt) + a small contextual sub-line — McKinsey/BCG hero-stat aesthetic.
// Background stays soft off-white. Tiles are subtle (no heavy borders,
// just a fine top-stripe in tile colour + faint shadow via vert gradient).
function slideStatsSnapshot(prs: any, d: PresentationData, p: Palette, slideNo: number) {
  const s = prs.addSlide();
  s.background = { color: 'FAFAFA' };

  // Top accent strip (subtle, full width)
  r(s, 0, 0, W, 0.08, p.pri);

  // Header block — eyebrow + title + dek
  t(s, 'CATEGORY AT A GLANCE', 0.70, 0.40, 6, 0.24,
    { fontSize: 9.5, color: '64748B', fontFace: FB, bold: true, charSpacing: 3.5 });
  t(s, 'The numbers that frame this brief.', 0.70, 0.74, CW, 0.58,
    { fontSize: 28, color: '0F172A', fontFace: FH, bold: true });
  t(s, 'Every figure below is computed directly from the uploaded data — none invented or benchmarked from external sources.',
    0.70, 1.40, CW - 0.50, 0.30,
    { fontSize: 11, color: '64748B', fontFace: FB });

  // Thin coloured rule under the dek
  ln(s, 0.70, 1.78, 0.80, p.pri, 2.5);

  // ── Extract tile data from d.nuggets ──
  type Tile = { label: string; value: string; sub?: string; color: string };
  const tiles: Tile[] = [];
  const n = d.nuggets || {};

  // Helpers to pull the most-arresting number out of a nugget headline
  const firstPct  = (s: string) => { const m = s.match(/([+-]?\d+(?:\.\d+)?)\s*%/); return m ? `${m[1]}%` : null; };
  const firstHHI  = (s: string) => { const m = s.match(/HHI\s*(\d+)/i); return m ? `HHI ${m[1]}` : null; };
  const firstNum  = (s: string) => { const m = s.match(/([+-]?\d+(?:\.\d+)?\s*[KMBL]?)/); return m ? m[1].trim() : null; };

  if (n.keyword?.headline) {
    const yoy = n.keyword.headline.match(/([+-]?\d+(?:\.\d+)?)\s*%\s*YoY/i);
    const vol = n.keyword.headline.match(/(\d+(?:\.\d+)?\s*[KMB])\s*monthly/i);
    tiles.push({
      label: 'CATEGORY SEARCH',
      value: yoy ? `${Number(yoy[1]) > 0 ? '+' : ''}${yoy[1]}%` : (vol ? vol[1] : (firstPct(n.keyword.headline) || 'Strong')),
      sub:   yoy ? 'YoY · across the long tail' : (vol ? 'monthly queries · long tail' : 'category demand'),
      color: '0891B2',
    });
  }
  if (n.helium10?.headline) {
    const hhi = firstHHI(n.helium10.headline);
    const lead = firstPct(n.helium10.headline);
    tiles.push({
      label: 'SHELF CONCENTRATION',
      value: hhi || lead || 'Tracked',
      sub:   hhi ? (n.helium10.headline.toLowerCase().includes('highly') ? 'highly concentrated' : n.helium10.headline.toLowerCase().includes('moderately') ? 'moderately concentrated' : 'fragmented') : 'category leader',
      color: 'B91C1C',
    });
  }
  if (n.competition?.headline) {
    const sov = firstPct(n.competition.headline);
    const brandMatch = n.competition.headline.match(/^(\S+(?:\s+\S+)?)\s+(?:leads|owns|commands)/);
    tiles.push({
      label: 'BRAND POSITION',
      value: sov || 'Tracked',
      sub:   brandMatch ? `${brandMatch[1]} leads category search` : 'category search share',
      color: 'DC2626',
    });
  }
  if (n.trust?.headline) {
    const pct = firstPct(n.trust.headline);
    const unbrandedHigh = /\bunbranded\b/i.test(n.trust.headline);
    tiles.push({
      label: 'BRANDED MIX',
      value: pct || 'Mixed',
      sub:   unbrandedHigh ? 'searches are unbranded — trust-gap signal' : 'branded — established trust',
      color: '0D9488',
    });
  }
  if (n.cultural?.headline) {
    const theme = n.cultural.headline.match(/^"([^"]+)"/);
    const themeVol = n.cultural.headline.match(/(\d+\s*[KM])\s*monthly/i);
    tiles.push({
      label: 'CULTURAL CUE',
      value: theme ? `"${theme[1].slice(0, 16)}"` : (themeVol ? themeVol[1] : 'Tracked'),
      sub:   theme ? 'leading creative territory' : 'creative direction signal',
      color: '9333EA',
    });
  }
  if (d.categoryValue) {
    tiles.push({
      label: 'CATEGORY VALUE',
      value: d.categoryValue,
      sub:   d.categoryCAGR ? `${d.categoryCAGR} CAGR · ${(d.category || 'category').toLowerCase()}` : (d.category || ''),
      color: '7C3AED',
    });
  }

  // ── Render hero tile grid ──
  if (tiles.length === 0) {
    t(s, 'Upload more data sources to populate the snapshot.',
      0.70, 4.0, CW - 0.50, 0.5,
      { fontSize: 13, color: '94A3B8', fontFace: FB, italic: true, align: 'left' });
  } else {
    // Grid layout: prefer 3 cols. With 6 tiles → 3×2. With 5 → 3+2.
    // With 4 → 2×2. With 3 → 1×3. With 2 → 1×2. With 1 → 1×1.
    const cols = tiles.length >= 5 ? 3 : tiles.length >= 4 ? 2 : Math.min(3, tiles.length);
    const rows = Math.ceil(tiles.length / cols);
    const startY = 2.10;
    const availH = H - startY - 0.55;
    const gap = 0.22;
    const tileW = (W - 1.40 - gap * (cols - 1)) / cols;
    const tileH = Math.min(2.40, (availH - gap * (rows - 1)) / rows);

    tiles.forEach((tile, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 0.70 + col * (tileW + gap);
      const y = startY + row * (tileH + gap);

      // Hero tile composition
      r(s, x, y, tileW, tileH, 'FFFFFF');                  // card bg
      // Hairline top stripe in tile colour (no full coloured strip — keep it subtle)
      r(s, x, y, tileW, 0.04, tile.color);
      // Faint bottom shadow line for depth
      r(s, x, y + tileH - 0.01, tileW, 0.01, 'E2E8F0');

      // Eyebrow label
      t(s, tile.label, x + 0.32, y + 0.28, tileW - 0.50, 0.22,
        { fontSize: 8.5, color: tile.color, fontFace: FB, bold: true, charSpacing: 3 });

      // Hero number — large, dominant
      const numLen = tile.value.length;
      const numSize = numLen > 9 ? 30 : numLen > 6 ? 42 : numLen > 4 ? 50 : 58;
      t(s, tile.value, x + 0.30, y + 0.55, tileW - 0.50, tileH * 0.50,
        { fontSize: numSize, color: '0F172A', fontFace: FH, bold: true,
          align: 'left', valign: 'middle', lineSpacingMultiple: 1.0 });

      // Sub-context
      if (tile.sub) {
        t(s, tile.sub, x + 0.32, y + tileH - 0.58, tileW - 0.50, 0.46,
          { fontSize: 10, color: '475569', fontFace: FB,
            lineSpacingMultiple: 1.35, valign: 'top', wrap: true });
      }
    });
  }

  // Bottom footer ribbon
  ln(s, 0.70, H - 0.42, W - 1.4, 'E2E8F0', 0.5);
  t(s, `${d.briefName.toUpperCase()} · COMPUTED FROM SOURCE DATA`, 0.70, H - 0.38, 8, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, charSpacing: 1.5 });
  t(s, `PAGE ${String(slideNo).padStart(2, '0')}`, W - MR - 1, H - 0.38, 1, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, align: 'right', charSpacing: 1.5 });

  // Speaker notes
  const noteLines = [
    'Category at a Glance — every figure here is computed deterministically from the uploaded data (Pareto / HHI / weighted YoY / brand SOV). None invented or benchmarked from external sources.',
    '',
    ...tiles.map(tile => `• ${tile.label}: ${tile.value} — ${tile.sub || ''}`),
    '',
    'Delivery tip: walk left-to-right, top-to-bottom. Read the BIG number first, pause, then the sub-line. The hero numbers are the punch — the sub-lines are context.',
  ];
  s.addNotes(noteLines.join('\n'));
}

// ─── Slide: Agenda (visual pass 5 — match magazine aesthetic) ───────────
function slideAgenda(prs: any, d: PresentationData, p: Palette, data: PresentationData) {
  const s = prs.addSlide();
  s.background = { color: 'FAFAFA' };

  // Thin top accent
  r(s, 0, 0, W, 0.08, p.pri);

  t(s, 'AGENDA', 0.70, 0.42, 4, 0.24,
    { fontSize: 9.5, color: '64748B', fontFace: FB, bold: true, charSpacing: 3.5 });
  t(s, "What we'll cover.", 0.70, 0.74, CW, 0.58,
    { fontSize: 30, color: '0F172A', fontFace: FH, bold: true });
  ln(s, 0.70, 1.42, 0.80, p.pri, 2.5);

  // Only show pillars that actually have insights, capped at 5 so cards fit
  // on the 7.5-inch slide (card height 1.08 + gap 0.14 × 5 = ~6.1 inches used).
  const activePillars = PILLAR_ORDER.filter(key => {
    const pillar = data[key as keyof PresentationData] as PillarData | undefined;
    return (pillar?.insights?.length ?? 0) > 0;
  }).slice(0, 5);

  // Dynamically shrink cards when > 4 active pillars to fit the slide
  const count   = activePillars.length || 1;
  const maxH    = H - 1.68 - 0.45;           // usable height below heading
  const cardH   = Math.min(1.28, (maxH - (count - 1) * 0.14) / count);
  const cardGap = Math.min(0.18, (maxH - count * cardH) / Math.max(count - 1, 1));
  const startY  = 1.68;

  activePillars.forEach((key, i) => {
    const pm = PILLARS[key];
    const pillarInsights = (data[key as keyof PresentationData] as PillarData)?.insights ?? [];
    const y = startY + i * (cardH + cardGap);

    // Card BG: white, no zebra striping (cleaner look)
    r(s, 0.70, y, CW, cardH, 'FFFFFF');
    // Hairline bottom border for separation
    r(s, 0.70, y + cardH - 0.01, CW, 0.01, 'E2E8F0');

    // Pillar number — large typographic mark
    t(s, String(i + 1).padStart(2, '0'),
      0.70, y + cardH * 0.10, 0.90, cardH * 0.80,
      { fontSize: 36, color: pm.color, fontFace: FH, bold: true, valign: 'middle', align: 'left' });

    // Pillar name (no emoji — type-driven)
    t(s, pm.label, 1.85, y + cardH * 0.18, 3.4, cardH * 0.40,
      { fontSize: 18, color: '0F172A', fontFace: FH, bold: true });

    // Insight count + description
    t(s, `${pillarInsights.length} insight${pillarInsights.length !== 1 ? 's' : ''} · ${getPillarMeaning(pm.label.toLowerCase()).slice(0, 60)}`,
      1.85, y + cardH * 0.56, 3.4, cardH * 0.30,
      { fontSize: 10.5, color: '64748B', fontFace: FB });

    // First insight teaser — italic pull-quote style
    const firstTitle = pillarInsights[0]?.title || '';
    if (firstTitle) {
      const teaser = firstTitle.length > 80 ? firstTitle.slice(0, 80) + '…' : firstTitle;
      t(s, `"${teaser}"`, 5.50, y + cardH * 0.22, CW - 4.8, cardH * 0.55,
        { fontSize: 11.5, color: '475569', fontFace: FB, italic: true, valign: 'middle', wrap: true });
    }
  });

  // Footer ribbon (consistent with cover)
  ln(s, 0.70, H - 0.42, W - 1.4, 'E2E8F0', 0.5);
  t(s, d.briefName.toUpperCase(), 0.70, H - 0.38, 8, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, bold: true, charSpacing: 2 });
  t(s, 'PAGE 02', W - MR - 1, H - 0.38, 1, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, align: 'right', charSpacing: 1.5 });

  // Speaker notes — set context for the agenda walkthrough
  const totalInsights = activePillars.reduce((sum, key) => {
    const pillar = data[key as keyof PresentationData] as PillarData | undefined;
    return sum + (pillar?.insights?.length ?? 0);
  }, 0);
  const agendaNotes = [
    `We'll move through ${activePillars.length} pillar${activePillars.length !== 1 ? 's' : ''} covering ${totalInsights} total insights.`,
    '',
    'Pillar order:',
    ...activePillars.map((k, i) => `  ${i + 1}. ${PILLARS[k].label} — ${(data[k as keyof PresentationData] as PillarData)?.insights?.length ?? 0} insights`),
    '',
    'Delivery: read the agenda card-by-card. For each pillar, name it + the insight count + the teaser quote. Then move on. Don\'t dive into detail here — that\'s what the divider slides are for.',
  ].join('\n');
  s.addNotes(agendaNotes);
}

// ─── Section divider (visual pass 4 — magazine table-of-contents style) ───
// Composition: light off-white background (matches Cover + Stats Snapshot
// rhythm). Giant section number as a typographic mark, pillar name in
// black as the headline, single hairline rule, then a one-line dek
// explaining what's coming. No emoji. No solid colour fills.
function slideDivider(prs: any, pm: PillarMeta, insightCount: number, slideNo: number, d: PresentationData) {
  const s = prs.addSlide();
  s.background = { color: 'FAFAFA' };

  // Thin top accent strip in pillar colour (full-bleed, hairline)
  r(s, 0, 0, W, 0.08, pm.color);

  // Section number in pillar colour at very low opacity-equivalent (lighter hue)
  const lightHue = lightenHex(pm.color, 0.85);  // 85% lighter, almost ghost
  const idxNumber = String(PILLAR_ORDER.indexOf(pm.label.toLowerCase() as any) + 1).padStart(2, '0');
  t(s, idxNumber, 0.70, 0.80, 5, 4.0,
    { fontSize: 280, color: lightHue, fontFace: FH, bold: true, valign: 'middle', align: 'left' });

  // Right column — actual content sits over the ghost number
  const contentX = 0.70;
  const contentW = CW - 0.20;

  // Eyebrow — type-driven, no emoji
  t(s, 'SECTION', contentX, 1.85, 4, 0.22,
    { fontSize: 9, color: pm.color, fontFace: FB, bold: true, charSpacing: 3.5 });

  // Pillar name — magazine-cover scale
  t(s, pm.label, contentX, 2.20, contentW, 1.40,
    { fontSize: 72, color: '0F172A', fontFace: FH, bold: true, lineSpacingMultiple: 1.0 });

  // Hairline rule
  ln(s, contentX, 3.95, 0.80, pm.color, 2);

  // Single-line dek
  t(s, `${insightCount} insight${insightCount !== 1 ? 's' : ''} · ${getPillarMeaning(pm.label.toLowerCase())}`,
    contentX, 4.15, contentW, 0.34,
    { fontSize: 14, color: '475569', fontFace: FB });

  // Bottom strip with brief name + page
  ln(s, contentX, H - 0.42, W - 1.4, 'E2E8F0', 0.5);
  t(s, d.briefName.toUpperCase(), contentX, H - 0.38, 8, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, bold: true, charSpacing: 2 });
  t(s, `PAGE ${String(slideNo).padStart(2, '0')}`, W - MR - 1, H - 0.38, 1, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, align: 'right', charSpacing: 1.5 });

  // Speaker notes
  s.addNotes([
    `Section divider: ${pm.label} (${insightCount} insight${insightCount !== 1 ? 's' : ''} in this section).`,
    '',
    `${pm.label} covers: ${getPillarMeaning(pm.label.toLowerCase())}`,
    '',
    'Delivery: pause for 2-3 seconds on this divider. Use it as a transition cue — name the section, hint at the headline, then advance.',
  ].join('\n'));
}

/** Lighten a hex colour by `amount` (0..1). Used for the ghost section
   number on the new divider — gives us a "pillar colour at 15% opacity"
   feel without needing pptxgenjs alpha. */
function lightenHex(hex: string, amount: number): string {
  const h = hex.replace(/^#/, '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return [lr, lg, lb].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Plain-English description of what each pillar covers (used in speaker notes
// on dividers + summary slides).
function getPillarMeaning(name: string): string {
  const meanings: Record<string, string> = {
    content:       'media consumption, formats, A+ listings, content territories',
    commerce:      'purchase intent, units, revenue, conversion, discount behaviour',
    communication: 'brand awareness, reviews, trust signals, ad recall, NPS',
    culture:       'demographics, lifestyle, values, attitudes, identity signals',
    channel:       'paid/owned/earned mix, channel ROI, attribution',
    media:         'media planning, spend allocation, platform performance',
    creative:      'creative asset performance, copy testing, A/B results',
    pricing:       'price elasticity, willingness to pay, discount strategy',
    search:        'search demand, intent, organic vs paid, bid strategy',
  };
  return meanings[name] || 'data-driven findings + strategic recommendations';
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

/** Multi-hue palette used for pie / doughnut slices */
const CHART_PALETTE = [
  '3B82F6','F97316','10B981','A855F7',
  'EF4444','F59E0B','06B6D4','EC4899',
  '14B8A6','8B5CF6','84CC16','FB7185',
];

/** Map our chart type names → PptxGenJS chart enum keys */
function pptxChartType(prs: any, type: string): any {
  switch (type) {
    case 'area':                    return prs.charts.AREA;
    case 'line':                    return prs.charts.LINE;
    case 'pie':                     return prs.charts.PIE;
    case 'doughnut':                return prs.charts.DOUGHNUT;
    case 'radar':                   return prs.charts.RADAR;
    case 'scatter':                 return prs.charts.SCATTER;
    case 'hbar':                    return prs.charts.BAR;     // barDir: 'bar'
    case 'bar':
    case 'combo':
    case 'histogram':
    case 'waterfall':
    case 'funnel':
    default:                        return prs.charts.BAR;
  }
}

/**
 * Embed a native PptxGenJS chart (no canvas / images needed).
 * Falls back gracefully if data is missing or rendering fails.
 */
function addNativeChart(
  prs:  any,
  s:    any,
  ins:  InsightCard,
  pm:   PillarMeta,
  x: number, y: number, w: number, h: number,
): void {
  const { chartType: type, chartLabels: labels, chartValues: vals, chartValues2: vals2 } = ins;
  if (!type || !labels?.length || !vals?.length) return;

  const ctype = pptxChartType(prs, type);
  const isHBar = type === 'hbar';
  const isRadial = type === 'pie' || type === 'doughnut';

  // For pie/doughnut: every slice gets a distinct hue.
  // For everything else: use the pillar primary colour.
  const colors = isRadial
    ? CHART_PALETTE.slice(0, labels.length)
    : [pm.color];

  const baseOpts: Record<string, any> = {
    x, y, w, h,
    showTitle:   false,
    showLegend:  isRadial,
    legendPos:   'b',
    legendFontSize: 7,
    chartColors: colors,
    chartColorsOpacity: 85,
  };

  try {
    if (type === 'scatter') {
      // Scatter: index on x-axis, values on y-axis
      s.addChart(ctype, [{
        name:   'Data',
        values: vals.map((_, i) => i + 1),   // x
        sizes:  vals,                          // y
      }], baseOpts);

    } else if (type === 'combo' && vals2?.length) {
      // Combo: bars (primary) + line (secondary)
      s.addChart(prs.charts.BAR, [
        { name: 'Volume',  labels, values: vals  },
        { name: 'Trend',   labels, values: vals2 },
      ], {
        ...baseOpts,
        barDir: 'col',
        barGrouping: 'clustered',
        chartColors: [pm.color, 'F97316'],
      });

    } else if (isRadial) {
      const holeSize = type === 'doughnut' ? 55 : undefined;
      s.addChart(ctype, [{ name: 'Data', labels, values: vals }], {
        ...baseOpts,
        ...(holeSize !== undefined ? { holeSize } : {}),
        dataLabelPosition: 'bestFit',
        dataLabelFormatCode: '0"%"',
        dataLabelFontSize: 7.5,
      });

    } else if (type === 'radar') {
      s.addChart(ctype, [{ name: 'Score', labels, values: vals }], {
        ...baseOpts,
        radarStyle: 'filled',
        chartColors: [pm.color],
        chartColorsOpacity: 40,
      });

    } else {
      // bar, hbar, line, area, histogram, waterfall, funnel
      s.addChart(ctype, [{ name: 'Data', labels, values: vals }], {
        ...baseOpts,
        barDir: isHBar ? 'bar' : 'col',
        barGrouping: 'clustered',
        lineSize: 2,
        lineSmooth: type === 'area' || type === 'line',
        showValue: isHBar,
        dataLabelFontSize: 7.5,
        valAxisLabelFontSize: 7.5,
        catAxisLabelFontSize: 7.5,
      });
    }
  } catch (err) {
    // Non-fatal: if chart fails to render, slide still has text content
    console.warn('[PPTX] addNativeChart failed:', (err as Error).message);
  }
}

// ─── Insight slide (visual pass 3 — magazine-style article layout) ────────
// Composition: thin pillar colour rail (left), section-meta eyebrow + huge
// headline taking the top third, then a clean horizontal divider, then
// content area split. Without a chart: obs full-width as lead, rec below
// as a designed pull-quote (white text on dark accent background). With a
// chart: text occupies left 55%, chart panel right 42% with a designed
// frame. Key-stat strip sits at the BOTTOM, full-width, like a magazine
// caption bar. No emoji on the section meta — type-driven.
function slideInsight(
  prs: any,
  ins: InsightCard,
  pm: PillarMeta,
  insightNo: number,
  slideNo: number,
  d: PresentationData,
) {
  const s = prs.addSlide();
  s.background = { color: 'FFFFFF' };

  const hasChart = !!(ins.chartType && ins.chartLabels?.length && ins.chartValues?.length);

  // ── Layout constants ─────────────────────────────────────────────
  const PAD_X    = 0.80;
  const TEXT_X   = PAD_X;
  const TEXT_W   = hasChart ? 6.60 : CW - 0.20;
  const CHART_X  = hasChart ? PAD_X + TEXT_W + 0.40 : 0;
  const CHART_W  = hasChart ? W - CHART_X - PAD_X : 0;
  const CHART_Y  = 2.30;
  const CHART_H  = 4.20;

  // Hairline left rail in pillar colour (thinner than the old solid bar)
  r(s, 0, 0, 0.08, H, pm.color);

  // ── Section meta — eyebrow (type-driven, no emoji) ──
  t(s, `${pm.label.toUpperCase()} · INSIGHT ${String(insightNo).padStart(2, '0')}`,
    TEXT_X, 0.42, 8, 0.22,
    { fontSize: 8.5, color: pm.color, fontFace: FB, bold: true, charSpacing: 3.5 });

  // ── Headline — magazine-cover scale, plenty of whitespace below ──
  const titleText = ins.title.length > 110 ? ins.title.slice(0, 110) + '…' : ins.title;
  const titleSize = titleText.length > 80 ? 22 : titleText.length > 50 ? 26 : 30;
  t(s, titleText, TEXT_X, 0.78, CW - 0.20, 1.30,
    { fontSize: titleSize, color: '0F172A', fontFace: FH, bold: true, lineSpacingMultiple: 1.18, valign: 'top' });

  // Thin underline divider in pillar colour
  ln(s, TEXT_X, 2.12, 0.6, pm.color, 1.5);

  // ── Body: Observation as lead paragraph ──
  t(s, 'WHAT THE DATA SHOWS', TEXT_X, 2.30, TEXT_W, 0.22,
    { fontSize: 8, color: '64748B', fontFace: FB, bold: true, charSpacing: 2.5 });
  const obsText = ins.obs.length > 380 ? ins.obs.slice(0, 380) + '…' : ins.obs;
  t(s, obsText, TEXT_X, 2.58, TEXT_W, 2.10,
    { fontSize: 13, color: '1E293B', fontFace: FB, lineSpacingMultiple: 1.50, valign: 'top', wrap: true });

  // ── Recommendation — designed as a pull-quote block ──
  // Dark accent background, pillar-coloured eyebrow, white body type
  const recY = 4.80;
  const recH = 1.30;
  r(s, TEXT_X, recY, TEXT_W, recH, '0F172A');
  r(s, TEXT_X, recY, 0.05, recH, pm.color);  // pillar colour edge accent

  t(s, 'WHAT TO DO', TEXT_X + 0.30, recY + 0.18, TEXT_W - 0.50, 0.22,
    { fontSize: 8, color: pm.color, fontFace: FB, bold: true, charSpacing: 2.5 });
  const recText = ins.rec.length > 280 ? ins.rec.slice(0, 280) + '…' : ins.rec;
  t(s, recText, TEXT_X + 0.30, recY + 0.48, TEXT_W - 0.50, recH - 0.60,
    { fontSize: 12, color: 'F1F5F9', fontFace: FB, lineSpacingMultiple: 1.42, valign: 'top', wrap: true });

  // ── Right column: chart (when present) — designed frame ──
  if (hasChart) {
    // Thin frame line around the chart area (subtle, not heavy)
    r(s, CHART_X, CHART_Y - 0.20, CHART_W, 0.04, pm.color);  // top hairline
    // Chart label
    t(s, 'DATA VIEW', CHART_X, CHART_Y - 0.50, CHART_W, 0.22,
      { fontSize: 8, color: '64748B', fontFace: FB, bold: true, charSpacing: 2.5 });
    if (ins.chartLabels && ins.chartLabels.length > 0) {
      // Sub-label: what this chart shows
      const chartSub = ins.chartType === 'doughnut' ? 'proportional split'
                     : ins.chartType === 'line' || ins.chartType === 'area' ? 'trend over time'
                     : ins.chartType === 'radar' ? 'multi-attribute profile'
                     : ins.chartType === 'scatter' ? 'correlation'
                     : 'ranked comparison';
      t(s, chartSub, CHART_X, CHART_Y - 0.24, CHART_W, 0.20,
        { fontSize: 9, color: '94A3B8', fontFace: FB, italic: true });
    }
    addNativeChart(prs, s, ins, pm, CHART_X, CHART_Y, CHART_W, CHART_H);
  }

  // ── Bottom caption bar — KEY STAT + source attribution (full width) ──
  const captionY = H - 0.62;
  ln(s, PAD_X, captionY, W - 2 * PAD_X, 'E2E8F0', 0.5);
  if (ins.stat) {
    t(s, ins.stat.length > 110 ? ins.stat.slice(0, 110) + '…' : ins.stat,
      PAD_X, captionY + 0.10, W - 2 * PAD_X - 3.5, 0.30,
      { fontSize: 10.5, color: pm.color, fontFace: FB, bold: true, valign: 'middle' });
  }
  const sourceLabel = [
    ins.source ? ins.source : null,
    ins.conviction ? `conviction ${ins.conviction}` : null,
  ].filter(Boolean).join(' · ');
  if (sourceLabel) {
    t(s, sourceLabel, W - PAD_X - 3.5, captionY + 0.10, 3.5, 0.30,
      { fontSize: 8.5, color: '94A3B8', fontFace: 'Consolas',
        align: 'right', valign: 'middle', charSpacing: 1 });
  }
  // Page number bottom-right (tiny, separate from caption)
  t(s, String(slideNo).padStart(2, '0'), W - PAD_X - 0.5, H - 0.32, 0.5, 0.18,
    { fontSize: 7, color: 'CBD5E1', fontFace: FB, align: 'right', charSpacing: 1.5 });

  // Speaker notes — full obs + rec + source + confidence
  const insightNotes = [
    `${pm.label} insight ${insightNo}: ${ins.title}`,
    '',
    'Full observation:',
    ins.obs || '(none)',
    '',
    'Full recommendation:',
    ins.rec || '(none)',
    '',
    ins.stat && `Key stat: ${ins.stat}`,
    ins.source && `Source: ${ins.source}`,
    ins.conviction != null && `Confidence: ${ins.conviction}%`,
    '',
    'Delivery: read the headline aloud. Pause. Walk through the OBSERVATION first (bottom-left block). Then read the RECOMMENDATION on the right (dark block) — that\'s the so-what. End with the stat strip below if present.',
  ].filter(Boolean).join('\n');
  s.addNotes(insightNotes);
}

// ─── "So What" slide (visual pass 5 — light bg, numbered list, magazine) ───
function slidePillarRecs(
  prs: any,
  pm: PillarMeta,
  insights: InsightCard[],
  slideNo: number,
  d: PresentationData,
) {
  const s = prs.addSlide();
  s.background = { color: 'FAFAFA' };

  // Thin top accent
  r(s, 0, 0, W, 0.08, pm.color);

  // Header — same rhythm as agenda + stats slides
  t(s, `${pm.label.toUpperCase()} · SO WHAT?`, 0.70, 0.42, 8, 0.24,
    { fontSize: 9.5, color: pm.color, fontFace: FB, bold: true, charSpacing: 3.5 });
  t(s, 'Recommendations to act on.', 0.70, 0.74, CW, 0.58,
    { fontSize: 30, color: '0F172A', fontFace: FH, bold: true });
  ln(s, 0.70, 1.42, 0.80, pm.color, 2.5);

  // Recommendation list — numbered, breathing room
  const recs = insights.map(ins => ins.rec).filter(Boolean).slice(0, 5);
  const rowH = 0.94;
  const gap  = 0.16;
  const startY = 1.78;

  recs.forEach((rec, i) => {
    const y = startY + i * (rowH + gap);

    // Card BG: white
    r(s, 0.70, y, CW, rowH, 'FFFFFF');
    // Hairline left edge in pillar colour
    r(s, 0.70, y, 0.06, rowH, pm.color);
    // Bottom border for separation
    r(s, 0.70, y + rowH - 0.01, CW, 0.01, 'E2E8F0');

    // Number — large typographic mark on left
    t(s, String(i + 1).padStart(2, '0'),
      0.96, y + 0.20, 0.80, rowH - 0.30,
      { fontSize: 26, color: pm.color, fontFace: FH, bold: true, valign: 'middle', align: 'left' });

    // Recommendation text
    const short = rec.length > 200 ? rec.slice(0, 200) + '…' : rec;
    t(s, short, 1.90, y + 0.18, CW - 2.50, rowH - 0.30,
      { fontSize: 12, color: '0F172A', fontFace: FB, lineSpacingMultiple: 1.40, valign: 'middle', wrap: true });

    // Priority badge — minimal, pillar-coloured on top-2
    const badge = i === 0 ? 'PRIORITY 1' : i === 1 ? 'PRIORITY 2' : 'MONITOR';
    const bColor = i <= 1 ? pm.color : '94A3B8';
    t(s, badge, W - MR - 1.4, y + 0.30, 1.30, 0.24,
      { fontSize: 8, color: bColor, fontFace: FB, bold: true, charSpacing: 2, align: 'right', valign: 'middle' });
  });

  // Footer ribbon (consistent across all slides)
  ln(s, 0.70, H - 0.42, W - 1.4, 'E2E8F0', 0.5);
  t(s, d.briefName.toUpperCase(), 0.70, H - 0.38, 8, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, bold: true, charSpacing: 2 });
  t(s, `PAGE ${String(slideNo).padStart(2, '0')}`, W - MR - 1, H - 0.38, 1, 0.22,
    { fontSize: 7.5, color: '94A3B8', fontFace: FB, align: 'right', charSpacing: 1.5 });

  // Speaker notes — full recommendations text
  const recsNotes = [
    `${pm.label} "So What" — top ${recs.length} recommendations:`,
    '',
    ...recs.map((r, i) => `${i + 1}. ${r}`),
    '',
    `Delivery: this slide closes the ${pm.label} section. Read each recommendation aloud. Connect each to the insights from the previous slides. Move to the next section only after committing verbally to the top 1-2.`,
  ].join('\n');
  s.addNotes(recsNotes);
}

// ─── Closing slide (visual pass 5 — magazine end-card aesthetic) ──────────
function slideClosing(prs: any, d: PresentationData, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: '0F172A' };  // dark to signal "end" — different rhythm from light slides

  // Thin top accent
  r(s, 0, 0, W, 0.08, p.pri);

  // Eyebrow
  t(s, "WHAT'S NEXT", 0.70, 1.20, 5, 0.24,
    { fontSize: 9.5, color: p.acc, fontFace: FB, bold: true, charSpacing: 3.5 });

  // Big closing question — magazine-cover scale
  t(s, 'Ready to move\non these insights?', 0.70, 1.65, W - 1.4, 2.6,
    { fontSize: 56, color: 'FFFFFF', fontFace: FH, bold: true, lineSpacingMultiple: 1.10 });

  // Hairline
  ln(s, 0.70, 4.45, 1.0, p.pri, 2.5);

  // Primary recommendation as a pull quote
  const primaryRec = d.nextMoves?.[0] || d.recommendations?.[0] || 'Review the full findings and align on priorities with your team.';
  const shortened = primaryRec.length > 140 ? primaryRec.slice(0, 140) + '…' : primaryRec;
  t(s, 'TOP MOVE', 0.70, 4.70, 3, 0.22,
    { fontSize: 8.5, color: p.acc, fontFace: FB, bold: true, charSpacing: 3 });
  t(s, shortened, 0.70, 4.98, W - 1.4, 1.4,
    { fontSize: 16, color: 'E2E8F0', fontFace: FH, italic: true, lineSpacingMultiple: 1.40 });

  // Bottom metadata strip
  ln(s, 0.70, H - 0.78, W - 1.4, '1E293B', 0.5);
  t(s, (d.brand || d.briefName || '').toUpperCase(), 0.70, H - 0.65, 8, 0.22,
    { fontSize: 8.5, color: '64748B', fontFace: FB, bold: true, charSpacing: 2.5 });
  t(s, d.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    0.70, H - 0.38, 8, 0.22,
    { fontSize: 8.5, color: '64748B', fontFace: FB });
  t(s, 'PRISM · CONFIDENTIAL', W - MR - 4, H - 0.38, 4, 0.22,
    { fontSize: 8.5, color: '64748B', fontFace: FB, align: 'right', charSpacing: 2.5 });

  // Speaker notes — wrap-up + Q&A prompt
  const closingNotes = [
    'Closing slide: wrap-up + Q&A.',
    '',
    `Brief: ${d.briefName}`,
    d.brand && `Brand: ${d.brand}`,
    d.briefFlavour && `Flavour: ${d.briefFlavour}`,
    '',
    'Top recommendation:',
    d.recommendations[0] || '(none — see prior slides)',
    '',
    'Delivery: hold this slide for ~10 seconds before inviting questions. Reiterate the Headline from the cover. Anchor the room on the SINGLE top recommendation. Then open the floor.',
    '',
    'Common questions to anticipate:',
    '  • "What\'s the conviction behind this number?" → point them to source pills on each insight slide',
    '  • "What would change this read?" → name the data we don\'t have (GWI, brand tracker, panel)',
    '  • "What\'s the timeline?" → reference Next Moves from Executive Summary slide',
  ].filter(Boolean).join('\n');
  s.addNotes(closingNotes);
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function generatePresentation(data: PresentationData): Promise<Buffer> {
  const template = getTemplate(data.templateId);
  if (!template) throw new Error(`Template not found: ${data.templateId}`);

  const prs = new PptxGenJS();
  prs.layout = 'LAYOUT_WIDE';  // 13.33 × 7.5 inches

  const p = getPal(data.templateId);

  let slideNo = 1;

  // 1. Cover (enriched with audience descriptor + category value + flavour badge)
  slideCover(prs, data, p);
  slideNo++;

  // 2. Executive Summary — Strategic Read + Audience Snapshot + Next Moves
  //    Only renders if we have at least ONE of (strategicRead, audienceSnapshot, nextMoves).
  //    Older analyses without these fields skip this slide gracefully.
  if (data.strategicRead || data.audienceSnapshot || (data.nextMoves?.length ?? 0) > 0) {
    slideExecutiveSummary(prs, data, p, slideNo);
    slideNo++;
  }

  // 3. Stats Snapshot — only when we have computed nuggets to render as tiles.
  if (data.nuggets && Object.values(data.nuggets).some(v => v?.headline)) {
    slideStatsSnapshot(prs, data, p, slideNo);
    slideNo++;
  }

  // 4. Agenda
  slideAgenda(prs, data, p, data);
  slideNo++;

  // 3–N. One section per non-empty pillar
  for (const key of PILLAR_ORDER) {
    const pillar = data[key as keyof PresentationData] as PillarData;
    const insights = pillar?.insights ?? [];
    if (insights.length === 0) continue;

    const pm = PILLARS[key];

    // Section divider
    slideDivider(prs, pm, insights.length, slideNo, data);
    slideNo++;

    // One slide per insight (max 4 per pillar to keep deck focused)
    const capped = insights.slice(0, 4);
    capped.forEach((ins, i) => {
      slideInsight(prs, ins, pm, i + 1, slideNo, data);
      slideNo++;
    });

    // "So What" recommendations slide
    slidePillarRecs(prs, pm, insights, slideNo, data);
    slideNo++;
  }

  // Last. Closing
  slideClosing(prs, data, p);

  return new Promise<Buffer>((resolve, reject) => {
    prs.write({ outputType: 'arraybuffer' })
      .then((buf: ArrayBuffer) => resolve(Buffer.from(buf)))
      .catch(reject);
  });
}
