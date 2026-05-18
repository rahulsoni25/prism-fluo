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

// ─── Slide 1: Cover (enriched per Tier 1 D) ─────────────────────────────────
function slideCover(prs: any, d: PresentationData, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: p.dark };

  // Left sidebar band
  r(s, 0, 0, 0.20, H, p.mid);

  // Top-right accent block
  r(s, W - 2.0, 0, 2.0, 1.4, p.pri);

  // Bottom accent bar
  r(s, 0, H - 0.20, W, 0.20, p.acc);

  // Deck type label
  t(s, 'PRISM INSIGHTS REPORT', ML + 0.25, 2.0, 9, 0.28,
    { fontSize: 10, color: p.acc, fontFace: FB, bold: true, charSpacing: 3.5 });

  // Headline
  t(s, d.headline || 'Strategic Insights', ML + 0.25, 2.45, CW - 2.2, 2.1,
    { fontSize: 40, color: 'FFFFFF', fontFace: FH, bold: true, lineSpacingMultiple: 1.1 });

  // Divider
  ln(s, ML + 0.25, 4.72, 2.0, p.pri, 1.5);

  // Brief name + date
  t(s, d.briefName || 'Analysis Report', ML + 0.25, 4.90, CW - 1, 0.42,
    { fontSize: 15, color: 'FFFFFF', fontFace: FH, bold: true });
  t(s, d.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    ML + 0.25, 5.40, 5, 0.28,
    { fontSize: 10, color: p.tl, fontFace: FB });

  // ── Tier 1 D: enrichment — audience + category context strip ──
  const contextStripY = 5.80;
  const chips: { label: string; value: string }[] = [];
  if (d.audienceDescriptor) chips.push({ label: 'AUDIENCE', value: d.audienceDescriptor });
  if (d.categoryValue)      chips.push({ label: 'CATEGORY VALUE', value: `${d.categoryValue}${d.categoryCAGR ? ' · ' + d.categoryCAGR + ' CAGR' : ''}` });
  if (d.sourceCount)        chips.push({ label: 'SOURCES', value: `${d.sourceCount} file${d.sourceCount > 1 ? 's' : ''} analysed` });

  if (chips.length > 0) {
    const chipW = Math.min(3.7, (CW - 0.5) / chips.length);
    chips.forEach((chip, i) => {
      const cx = ML + 0.25 + i * (chipW + 0.18);
      t(s, chip.label, cx, contextStripY, chipW, 0.20,
        { fontSize: 7.5, color: p.acc, fontFace: FB, bold: true, charSpacing: 2.5 });
      t(s, chip.value, cx, contextStripY + 0.22, chipW, 0.30,
        { fontSize: 11, color: 'FFFFFF', fontFace: FB, bold: true });
    });
  }

  // Brief flavour badge in top-right (LAUNCH / DEFEND / GROW)
  if (d.briefFlavour) {
    const badgeBg = { LAUNCH: '10B981', DEFEND: 'EF4444', GROW: 'F59E0B' }[d.briefFlavour] || p.pri;
    r(s, W - 1.85, 1.75, 1.55, 0.42, badgeBg);
    t(s, d.briefFlavour, W - 1.85, 1.82, 1.55, 0.28,
      { fontSize: 13, color: 'FFFFFF', fontFace: FH, bold: true, align: 'center', charSpacing: 4 });
  }

  // Pillar labels in bottom strip area
  const pKeys = PILLAR_ORDER;
  const pw = CW / pKeys.length;
  pKeys.forEach((key, i) => {
    const pm = PILLARS[key];
    t(s, `${pm.icon} ${pm.label.toUpperCase()}`, ML + 0.25 + i * pw, 6.62, pw, 0.28,
      { fontSize: 9, color: p.tl, fontFace: FB, charSpacing: 0.8 });
  });

  // CONFIDENTIAL
  t(s, 'CONFIDENTIAL', W - 3.5, 0.32, 3.2, 0.26,
    { fontSize: 8.5, color: 'FFFFFF', fontFace: FB, bold: true, charSpacing: 2, align: 'right' });

  // ── Tier 1 C: speaker notes for the cover ──
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
    'Open by reading the headline. Pause for 2 seconds. Then anchor the room: name the brand, the audience, and the moment this brief lands in.',
  ].filter(Boolean).join('\n');
  if (notesParts) s.addNotes(notesParts);
}

// ─── Tier 1 A: Executive Summary slide ──────────────────────────────────────
// Sits between Cover and Agenda. Carries the Strategic Read paragraph (the
// only narrative connective tissue on the deck) + Audience Snapshot + top
// 3 Next Moves. Pull from d.strategicRead / d.audienceSnapshot / d.nextMoves.
function slideExecutiveSummary(prs: any, d: PresentationData, p: Palette, slideNo: number) {
  const s = prs.addSlide();
  s.background = { color: 'FAFBFD' };

  // Top accent band
  r(s, 0, 0, W, 0.18, p.pri);

  // Eyebrow + section title
  t(s, '★ EXECUTIVE SUMMARY', ML, 0.42, 6, 0.28,
    { fontSize: 9.5, color: p.pri, fontFace: FB, bold: true, charSpacing: 3 });
  t(s, d.headline || 'Strategic Readout', ML, 0.75, CW, 0.85,
    { fontSize: 24, color: '0F172A', fontFace: FH, bold: true, lineSpacingMultiple: 1.15 });
  ln(s, ML, 1.78, 1.6, p.acc, 2);

  // Layout: left column 60% = Strategic Read; right column 40% = Next Moves
  const leftW  = CW * 0.60 - 0.20;
  const rightX = ML + leftW + 0.30;
  const rightW = CW - leftW - 0.30;
  const bodyY  = 2.00;

  // ── LEFT: Strategic Read paragraph ──
  t(s, '🧭 STRATEGIC READ', ML, bodyY, leftW, 0.24,
    { fontSize: 9, color: '0891B2', fontFace: FB, bold: true, charSpacing: 2.5 });
  t(s, 'Synthesised from data', ML + 2.4, bodyY + 0.02, 2.4, 0.20,
    { fontSize: 8, color: '94A3B8', fontFace: FB, italic: true });

  // The Strategic Read paragraph itself OR fall back to audienceSnapshot
  const readText = d.strategicRead?.trim() || d.audienceSnapshot?.trim() || d.objective?.trim() || '';
  t(s, readText || 'Strategic read not available for this analysis.',
    ML, bodyY + 0.36, leftW, 4.0,
    {
      fontSize: 13, color: '1F2937', fontFace: FB,
      lineSpacingMultiple: 1.55, valign: 'top', wrap: true,
    });

  // Audience Snapshot (small block below the Strategic Read if both present)
  if (d.strategicRead && d.audienceSnapshot) {
    const snapY = bodyY + 4.6;
    r(s, ML, snapY, leftW, 0.86, '#F1F5F9');  // light grey card bg
    t(s, '👥 AUDIENCE SNAPSHOT', ML + 0.18, snapY + 0.08, 3, 0.22,
      { fontSize: 8.5, color: '7C3AED', fontFace: FB, bold: true, charSpacing: 2 });
    t(s, d.audienceSnapshot, ML + 0.18, snapY + 0.32, leftW - 0.36, 0.5,
      { fontSize: 10.5, color: '475569', fontFace: FB, italic: true, lineSpacingMultiple: 1.4 });
  }

  // ── RIGHT: Next Moves (numbered cards) ──
  t(s, '💡 NEXT MOVES', rightX, bodyY, rightW, 0.24,
    { fontSize: 9, color: 'D97706', fontFace: FB, bold: true, charSpacing: 2.5 });
  t(s, 'Bucket-diverse, concrete', rightX + 2.0, bodyY + 0.02, 2.5, 0.20,
    { fontSize: 8, color: '94A3B8', fontFace: FB, italic: true });

  const moves = Array.isArray(d.nextMoves) && d.nextMoves.length > 0
    ? d.nextMoves
    : (Array.isArray(d.recommendations) ? d.recommendations.slice(0, 3) : []);

  const moveCardH = 1.30;
  const moveGap   = 0.18;
  moves.slice(0, 3).forEach((move, i) => {
    const y = bodyY + 0.36 + i * (moveCardH + moveGap);
    // Card bg
    r(s, rightX, y, rightW, moveCardH, '#FFFFFF');
    // Number badge
    r(s, rightX, y, 0.55, moveCardH, '#FEF3C7');
    t(s, String(i + 1), rightX, y, 0.55, moveCardH,
      { fontSize: 26, color: '92400E', fontFace: FH, bold: true, align: 'center', valign: 'middle' });
    // Move text
    const moveText = move.length > 220 ? move.slice(0, 218) + '…' : move;
    t(s, moveText, rightX + 0.70, y + 0.10, rightW - 0.80, moveCardH - 0.20,
      { fontSize: 10.5, color: '1F2937', fontFace: FB, lineSpacingMultiple: 1.4, valign: 'top', wrap: true });
  });

  // Bottom strip: provenance
  if (d.sourceCount) {
    t(s, `Synthesised from ${d.sourceCount} source file${d.sourceCount > 1 ? 's' : ''} · ${d.briefFlavour || 'BRIEF'} flavour · regenerate from /insights anytime`,
      ML, H - 0.7, CW, 0.22,
      { fontSize: 8.5, color: '94A3B8', fontFace: FB, italic: true, charSpacing: 0.5 });
  }

  footer(s, slideNo, d.briefName);

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

// ─── Tier 1 B: Computed Stats Snapshot slide ────────────────────────────────
// Big-number tiles pulled from d.nuggets. Each tile = ONE arresting number
// that is computed from raw data (HHI, weighted YoY, brand SOV, etc).
// Sits between Executive Summary and Agenda.
function slideStatsSnapshot(prs: any, d: PresentationData, p: Palette, slideNo: number) {
  const s = prs.addSlide();
  s.background = { color: 'FAFBFD' };

  // Top accent band
  r(s, 0, 0, W, 0.18, p.pri);

  t(s, '📊 CATEGORY AT A GLANCE', ML, 0.42, 6, 0.28,
    { fontSize: 9.5, color: p.pri, fontFace: FB, bold: true, charSpacing: 3 });
  t(s, 'The numbers that frame the brief', ML, 0.75, CW, 0.55,
    { fontSize: 22, color: '0F172A', fontFace: FH, bold: true });
  t(s, 'Every figure below is computed directly from the uploaded data — none are invented or benchmarked from external sources.',
    ML, 1.30, CW, 0.30,
    { fontSize: 11, color: '64748B', fontFace: FB, italic: true });
  ln(s, ML, 1.65, 1.6, p.acc, 2);

  // ── Extract tile data from d.nuggets ──
  type Tile = { label: string; value: string; sub?: string; color: string };
  const tiles: Tile[] = [];

  const n = d.nuggets || {};
  // Tile 1 — Keyword headline (search demand)
  if (n.keyword?.headline) {
    // Try to extract a leading number from the headline like "+18.3% YoY" or "2.2M monthly queries"
    const match = n.keyword.headline.match(/([+-]?[\d.,]+\s*[%×KM]?\s*(?:YoY|monthly\s*queries|searches)?)/i);
    tiles.push({
      label: 'SEARCH DEMAND',
      value: match ? match[1].trim() : 'Strong',
      sub:   String(n.keyword.headline).slice(0, 85) + (n.keyword.headline.length > 85 ? '…' : ''),
      color: '0891B2',
    });
  }
  // Tile 2 — Helium 10 (shelf concentration)
  if (n.helium10?.headline) {
    const hhi = n.helium10.headline.match(/HHI\s*(\d+)/i);
    const lead = n.helium10.headline.match(/(\d+)\s*%/);
    tiles.push({
      label: 'SHELF CONCENTRATION',
      value: hhi ? `HHI ${hhi[1]}` : (lead ? `${lead[1]}% leader` : 'Tracked'),
      sub:   String(n.helium10.headline).slice(0, 85) + (n.helium10.headline.length > 85 ? '…' : ''),
      color: 'B91C1C',
    });
  }
  // Tile 3 — Brand SOV from competition
  if (n.competition?.headline) {
    const ourBrand = n.competition.headline.match(/(\d+)\s*%/);
    tiles.push({
      label: 'BRAND SOV',
      value: ourBrand ? `${ourBrand[1]}%` : 'Tracked',
      sub:   String(n.competition.headline).slice(0, 85) + (n.competition.headline.length > 85 ? '…' : ''),
      color: 'DC2626',
    });
  }
  // Tile 4 — Trust signals (branded vs non-branded)
  if (n.trust?.headline) {
    const branded = n.trust.headline.match(/(\d+)\s*%/);
    tiles.push({
      label: 'TRUST SIGNAL',
      value: branded ? `${branded[1]}%` : 'Mixed',
      sub:   String(n.trust.headline).slice(0, 85) + (n.trust.headline.length > 85 ? '…' : ''),
      color: '0D9488',
    });
  }
  // Tile 5 — Cultural cues (top theme)
  if (n.cultural?.headline) {
    const themeMatch = n.cultural.headline.match(/^"([^"]+)"/);
    tiles.push({
      label: 'TOP CULTURAL CUE',
      value: themeMatch ? `"${themeMatch[1].slice(0, 18)}"` : 'Tracked',
      sub:   String(n.cultural.headline).slice(0, 85) + (n.cultural.headline.length > 85 ? '…' : ''),
      color: '9333EA',
    });
  }
  // Tile 6 — Category value from the brief
  if (d.categoryValue) {
    tiles.push({
      label: 'CATEGORY VALUE',
      value: d.categoryValue,
      sub:   d.categoryCAGR ? `${d.categoryCAGR} CAGR · ${d.category || 'category'}` : (d.category || ''),
      color: '7C3AED',
    });
  }

  // ── Render tile grid (3 cols × 2 rows max) ──
  if (tiles.length === 0) {
    t(s, 'No computed nuggets available for this analysis. Upload more data sources to populate this slide.',
      ML, 3.5, CW, 0.5,
      { fontSize: 13, color: '94A3B8', fontFace: FB, italic: true, align: 'center' });
  } else {
    const cols  = tiles.length <= 3 ? tiles.length : 3;
    const rows  = Math.ceil(tiles.length / cols);
    const gap   = 0.20;
    const tileW = (CW - gap * (cols - 1)) / cols;
    const tileH = Math.min(2.30, (5.20 - gap * (rows - 1)) / rows);
    const startY = 1.95;

    tiles.forEach((tile, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = ML + col * (tileW + gap);
      const y = startY + row * (tileH + gap);

      // Card bg
      r(s, x, y, tileW, tileH, '#FFFFFF');
      // Color strip top
      r(s, x, y, tileW, 0.10, tile.color);
      // Label
      t(s, tile.label, x + 0.20, y + 0.26, tileW - 0.40, 0.24,
        { fontSize: 9, color: tile.color, fontFace: FB, bold: true, charSpacing: 2 });
      // Big value
      t(s, tile.value, x + 0.20, y + 0.55, tileW - 0.40, 0.80,
        { fontSize: tile.value.length > 8 ? 28 : 36, color: '0F172A', fontFace: FH, bold: true,
          align: 'left', valign: 'middle' });
      // Sub
      if (tile.sub) {
        t(s, tile.sub, x + 0.20, y + tileH - 0.78, tileW - 0.40, 0.62,
          { fontSize: 9.5, color: '475569', fontFace: FB, lineSpacingMultiple: 1.35, valign: 'top', wrap: true });
      }
    });
  }

  footer(s, slideNo, d.briefName);

  // Speaker notes
  const noteLines = [
    'Category at a Glance — every figure here is computed deterministically from the uploaded data (Pareto / HHI / weighted YoY / brand SOV). Never invented or benchmarked from external sources.',
    '',
    ...tiles.map(tile => `• ${tile.label}: ${tile.value} — ${tile.sub || ''}`),
    '',
    'Delivery tip: walk left-to-right, top-to-bottom. For each tile, read the BIG number first, then the sub-line. Pause for 1 second between tiles to let it land.',
  ];
  s.addNotes(noteLines.join('\n'));
}

// ─── Slide: Agenda ───────────────────────────────────────────────────────────
function slideAgenda(prs: any, d: PresentationData, p: Palette, data: PresentationData) {
  const s = prs.addSlide();
  s.background = { color: 'FAFBFD' };

  // Top accent band
  r(s, 0, 0, W, 0.18, p.pri);

  t(s, 'AGENDA', ML, 0.42, 4, 0.26,
    { fontSize: 9, color: p.pri, fontFace: FB, bold: true, charSpacing: 3 });
  t(s, 'What we\'ll cover today', ML, 0.75, CW, 0.60,
    { fontSize: 28, color: '0F172A', fontFace: FH, bold: true });
  ln(s, ML, 1.45, 1.6, p.acc, 2);

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
    // Safe access — pillar is guaranteed to exist here (filtered above)
    const pillarInsights = (data[key as keyof PresentationData] as PillarData)?.insights ?? [];
    const y = startY + i * (cardH + cardGap);

    // Card background
    r(s, ML, y, CW, cardH, i % 2 === 0 ? 'F8FAFC' : 'FFFFFF');

    // Pillar color strip
    r(s, ML, y, 0.28, cardH, pm.color);

    // Pillar number
    t(s, `0${i + 1}`, ML + 0.36, y + cardH * 0.14, 0.55, cardH * 0.42,
      { fontSize: Math.min(22, cardH * 17), color: pm.color, fontFace: FH, bold: true, valign: 'middle' });

    // Pillar icon + name
    t(s, `${pm.icon}  ${pm.label}`, ML + 0.96, y + cardH * 0.10, 3.5, cardH * 0.33,
      { fontSize: Math.min(17, cardH * 13), color: '0F172A', fontFace: FH, bold: true });

    // Insight count
    t(s, `${pillarInsights.length} insight${pillarInsights.length !== 1 ? 's' : ''}`,
      ML + 0.96, y + cardH * 0.48, 3.5, cardH * 0.28,
      { fontSize: 11, color: '64748B', fontFace: FB });

    // First insight teaser
    const firstTitle = pillarInsights[0]?.title || '';
    if (firstTitle) {
      const teaser = firstTitle.length > 65 ? firstTitle.slice(0, 65) + '…' : firstTitle;
      t(s, `"${teaser}"`, ML + 4.8, y + cardH * 0.22, CW - 4.4, cardH * 0.55,
        { fontSize: 11, color: '475569', fontFace: FB, italic: true, valign: 'middle' });
    }
  });

  footer(s, 2, d.briefName);

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

// ─── Pillar section divider ───────────────────────────────────────────────────
function slideDivider(prs: any, pm: PillarMeta, insightCount: number, slideNo: number, d: PresentationData) {
  const s = prs.addSlide();
  s.background = { color: pm.dark };

  // Full bleed decorative block top-left
  r(s, 0, 0, 0.22, H, pm.color + '40'); // semi-transparent strip

  // Corner geometry
  r(s, W - 2.4, 0, 2.4, 1.8, pm.color + '30');
  r(s, W - 1.2, 0, 1.2, 0.9, pm.color);

  // Bottom bar
  r(s, 0, H - 0.20, W, 0.20, pm.color);

  // Section number
  t(s, `0${PILLAR_ORDER.indexOf(pm.label.toLowerCase() as any) + 1}`, ML + 0.3, 1.6, 2.0, 1.4,
    { fontSize: 80, color: pm.color + '55', fontFace: FH, bold: true });

  // Section label
  t(s, 'SECTION', ML + 0.3, 1.65, 4, 0.26,
    { fontSize: 9, color: pm.color, fontFace: FB, bold: true, charSpacing: 3 });

  // Pillar name
  t(s, `${pm.icon}  ${pm.label}`, ML + 0.3, 2.1, CW - 1, 1.2,
    { fontSize: 54, color: 'FFFFFF', fontFace: FH, bold: true });

  // Divider line
  ln(s, ML + 0.3, 3.5, 2.0, pm.color, 2);

  // Sub-description
  t(s,
    `${insightCount} key insight${insightCount !== 1 ? 's' : ''} · Data-driven findings & strategic recommendations`,
    ML + 0.3, 3.72, CW - 1, 0.38,
    { fontSize: 12, color: 'FFFFFF99', fontFace: FB });

  footer(s, slideNo, d.briefName, true, pm.color);

  // Speaker notes — section context
  s.addNotes([
    `Section divider: ${pm.label} (${insightCount} insight${insightCount !== 1 ? 's' : ''} in this section).`,
    '',
    `${pm.label} covers: ${getPillarMeaning(pm.label.toLowerCase())}`,
    '',
    'Delivery: pause for 2-3 seconds on this divider. Use it as a transition cue — name the section, hint at the headline, then advance.',
  ].join('\n'));
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

// ─── Insight card slide ───────────────────────────────────────────────────────
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

  // Detect whether we have chart data to show in right column
  const hasChart = !!(ins.chartType && ins.chartLabels?.length && ins.chartValues?.length);

  // ── Layout constants ──────────────────────────────────────────────────────
  // With chart: text occupies left 60%, chart occupies right 38%
  // Without chart: text occupies full width (original layout)
  const TEXT_W  = hasChart ? 7.40 : CW - 0.20;  // text block width
  const CHART_X = 8.62;                           // chart panel x
  const CHART_Y = 1.88;                           // chart panel y
  const CHART_W = 4.42;                           // chart panel width
  const CHART_H = 4.80;                           // chart panel height

  // Left pillar colour bar
  r(s, 0, 0, 0.12, H, pm.color);

  // Top section meta
  t(s, `${pm.icon} ${pm.label.toUpperCase()} — INSIGHT ${String(insightNo).padStart(2, '0')}`,
    ML + 0.18, 0.38, 8, 0.24,
    { fontSize: 9, color: pm.color, fontFace: FB, bold: true, charSpacing: 2 });

  // Insight headline / hook (always full-width — spans both columns)
  const titleText = ins.title.length > 110 ? ins.title.slice(0, 110) + '…' : ins.title;
  t(s, titleText, ML + 0.18, 0.70, CW - 0.2, 1.1,
    { fontSize: 24, color: '0F172A', fontFace: FH, bold: true, lineSpacingMultiple: 1.15 });

  ln(s, ML + 0.18, 1.90, 1.6, pm.color, 2);

  // ── Observation block ────────────────────────────────────────────────────
  r(s, ML + 0.18, 2.08, TEXT_W, 1.62, pm.light);
  r(s, ML + 0.18, 2.08, 0.06, 1.62, pm.color);

  t(s, 'OBSERVATION', ML + 0.40, 2.14, 3.5, 0.22,
    { fontSize: 8, color: pm.color, fontFace: FB, bold: true, charSpacing: 1.8 });

  const obsText = ins.obs.length > 260 ? ins.obs.slice(0, 260) + '…' : ins.obs;
  t(s, obsText, ML + 0.40, 2.42, TEXT_W - 0.40, 1.16,
    { fontSize: 12.5, color: '1E293B', fontFace: FB, lineSpacingMultiple: 1.4, valign: 'top' });

  // ── Recommendation block ─────────────────────────────────────────────────
  r(s, ML + 0.18, 3.86, TEXT_W, 1.62, '1E293B');
  r(s, ML + 0.18, 3.86, 0.06, 1.62, pm.color);

  t(s, '→  RECOMMENDATION', ML + 0.40, 3.92, 4.5, 0.22,
    { fontSize: 8, color: pm.color, fontFace: FB, bold: true, charSpacing: 1.8 });

  const recText = ins.rec.length > 260 ? ins.rec.slice(0, 260) + '…' : ins.rec;
  t(s, recText, ML + 0.40, 4.20, TEXT_W - 0.40, 1.14,
    { fontSize: 12.5, color: 'FFFFFF', fontFace: FB, lineSpacingMultiple: 1.4, valign: 'top' });

  // ── Key stat + source ────────────────────────────────────────────────────
  if (ins.stat) {
    r(s, ML + 0.18, 5.62, TEXT_W, 0.60, pm.light);
    t(s, '📊  ' + ins.stat, ML + 0.38, 5.66, TEXT_W - 0.40, 0.50,
      { fontSize: 11.5, color: pm.dark || '0F172A', fontFace: FB, bold: true, valign: 'middle' });
  }

  const sourceLabel = [
    ins.source ? `Source: ${ins.source}` : '',
    ins.conviction ? `Confidence: ${ins.conviction}%` : '',
  ].filter(Boolean).join('  ·  ');

  if (sourceLabel) {
    t(s, sourceLabel, ML + 0.18, 6.30, TEXT_W, 0.24,
      { fontSize: 8, color: '94A3B8', fontFace: FB });
  }

  // ── Right column: native chart ────────────────────────────────────────────
  if (hasChart) {
    // Subtle background panel for the chart area
    r(s, CHART_X - 0.12, CHART_Y - 0.12, CHART_W + 0.24, CHART_H + 0.24, 'F8FAFC');
    // Thin pillar-coloured top border on the chart panel
    r(s, CHART_X - 0.12, CHART_Y - 0.12, CHART_W + 0.24, 0.04, pm.color);

    addNativeChart(prs, s, ins, pm, CHART_X, CHART_Y, CHART_W, CHART_H);
  }

  footer(s, slideNo, d.briefName);

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

// ─── "So What" slide — pillar recommendations ─────────────────────────────────
function slidePillarRecs(
  prs: any,
  pm: PillarMeta,
  insights: InsightCard[],
  slideNo: number,
  d: PresentationData,
) {
  const s = prs.addSlide();
  s.background = { color: '0F172A' };

  // Top accent band
  r(s, 0, 0, W, 0.18, pm.color);

  // Left bar
  r(s, 0, 0.18, 0.12, H - 0.38, pm.dark || '1E293B');

  // Section label
  t(s, `${pm.icon}  ${pm.label.toUpperCase()} — SO WHAT?`, ML + 0.18, 0.40, 8, 0.26,
    { fontSize: 9, color: pm.color, fontFace: FB, bold: true, charSpacing: 2 });

  t(s, 'Recommendations', ML + 0.18, 0.72, CW, 0.72,
    { fontSize: 30, color: 'FFFFFF', fontFace: FH, bold: true });

  ln(s, ML + 0.18, 1.52, 1.6, pm.color, 2);

  // Recommendation rows from insights
  const recs = insights.map(ins => ins.rec).filter(Boolean).slice(0, 5);
  const rowH = 0.88;
  const gap  = 0.12;
  const startY = 1.74;

  recs.forEach((rec, i) => {
    const y = startY + i * (rowH + gap);

    // Row background — alternating shades
    r(s, ML + 0.18, y, CW - 0.20, rowH, i % 2 === 0 ? '1E293B' : '162032');

    // Priority strip
    r(s, ML + 0.18, y, 0.32, rowH, pm.color);
    t(s, String(i + 1), ML + 0.18, y, 0.32, rowH,
      { fontSize: 14, color: 'FFFFFF', fontFace: FH, bold: true, align: 'center', valign: 'middle' });

    // Recommendation text
    const short = rec.length > 160 ? rec.slice(0, 160) + '…' : rec;
    t(s, short, ML + 0.64, y + 0.10, CW - 0.82, rowH - 0.20,
      { fontSize: 12, color: 'FFFFFF', fontFace: FB, lineSpacingMultiple: 1.35, valign: 'middle' });

    // Priority label
    const badge = i === 0 ? 'HIGH' : i === 1 ? 'HIGH' : 'MED';
    const bColor = i <= 1 ? pm.color : '64748B';
    t(s, badge, ML + CW - 1.25, y + 0.08, 1.10, 0.24,
      { fontSize: 7.5, color: bColor, fontFace: FB, bold: true, charSpacing: 1.2, align: 'right' });
  });

  footer(s, slideNo, d.briefName, true);

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

// ─── Closing slide ────────────────────────────────────────────────────────────
function slideClosing(prs: any, d: PresentationData, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: p.dark };

  // Accent bars
  r(s, 0, 0, W, 0.18, p.pri);
  r(s, 0, H - 0.20, W, 0.20, p.acc);

  // Left geometric block
  r(s, 0, H * 0.28, 0.48, H * 0.44, p.mid);

  // Corner decor
  r(s, W - 1.5, H - 1.7, 1.5, 1.7, p.mid);
  r(s, W - 0.75, H - 0.85, 0.75, 0.85, p.pri);

  // Label
  t(s, "WHAT'S NEXT", ML + 0.55, 1.8, CW, 0.28,
    { fontSize: 10, color: p.acc, fontFace: FB, bold: true, charSpacing: 3 });

  // Main heading
  t(s, 'Ready to act\non these insights?', ML + 0.55, 2.22, CW - 2.2, 2.1,
    { fontSize: 42, color: 'FFFFFF', fontFace: FH, bold: true, lineSpacingMultiple: 1.1 });

  ln(s, ML + 0.55, 4.46, 1.8, p.acc, 2);

  // Overall recommendation
  const primaryRec = d.recommendations[0] || 'Review the full findings and align on priorities with your team.';
  const shortened = primaryRec.length > 120 ? primaryRec.slice(0, 120) + '…' : primaryRec;
  t(s, `"${shortened}"`, ML + 0.55, 4.68, CW - 2.0, 1.0,
    { fontSize: 13, color: p.tl, fontFace: FB, italic: true, lineSpacingMultiple: 1.45 });

  // Date + brief
  t(s, d.date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' }),
    ML + 0.55, 5.90, 4, 0.28,
    { fontSize: 10, color: p.tl, fontFace: FB });

  t(s, (d.briefName || '').toUpperCase(), W - MR - 5.5, 5.90, 5.2, 0.28,
    { fontSize: 10, color: p.tl, fontFace: FB, bold: true, charSpacing: 1.6, align: 'right' });

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
