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
  // 4-pillar structured data (populated from results_json.charts)
  content:         PillarData;
  commerce:        PillarData;
  communication:   PillarData;
  culture:         PillarData;
  // Flat fallbacks (used for closing slide)
  observations:    string[];
  recommendations: string[];
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
};

const PILLAR_ORDER: Array<keyof typeof PILLARS> = ['content', 'commerce', 'communication', 'culture'];

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

// ─── Slide 1: Cover ───────────────────────────────────────────────────────────
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
}

// ─── Slide 2: Agenda ─────────────────────────────────────────────────────────
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

  // 4 pillar agenda cards
  const cardH = 1.28;
  const cardGap = 0.18;
  const startY = 1.68;

  PILLAR_ORDER.forEach((key, i) => {
    const pm = PILLARS[key];
    const pillarInsights = (data[key as keyof PresentationData] as PillarData).insights || [];
    const y = startY + i * (cardH + cardGap);

    // Card background
    r(s, ML, y, CW, cardH, i % 2 === 0 ? 'F8FAFC' : 'FFFFFF');

    // Pillar color strip
    r(s, ML, y, 0.28, cardH, pm.color);

    // Pillar number
    t(s, `0${i + 1}`, ML + 0.36, y + 0.18, 0.55, 0.55,
      { fontSize: 22, color: pm.color, fontFace: FH, bold: true, valign: 'middle' });

    // Pillar icon + name
    t(s, `${pm.icon}  ${pm.label}`, ML + 0.96, y + 0.14, 3.5, 0.42,
      { fontSize: 17, color: '0F172A', fontFace: FH, bold: true });

    // Insight count
    t(s, `${pillarInsights.length} insight${pillarInsights.length !== 1 ? 's' : ''}`,
      ML + 0.96, y + 0.62, 3.5, 0.28,
      { fontSize: 11, color: '64748B', fontFace: FB });

    // First insight teaser
    const firstTitle = pillarInsights[0]?.title || '';
    if (firstTitle) {
      const teaser = firstTitle.length > 65 ? firstTitle.slice(0, 65) + '…' : firstTitle;
      t(s, `"${teaser}"`, ML + 4.8, y + 0.30, CW - 4.4, 0.60,
        { fontSize: 11, color: '475569', fontFace: FB, italic: true, valign: 'middle' });
    }
  });

  footer(s, 2, d.briefName);
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
}

// ─── Main entry point ─────────────────────────────────────────────────────────
export async function generatePresentation(data: PresentationData): Promise<Buffer> {
  const template = getTemplate(data.templateId);
  if (!template) throw new Error(`Template not found: ${data.templateId}`);

  const prs = new PptxGenJS();
  prs.layout = 'LAYOUT_WIDE';  // 13.33 × 7.5 inches

  const p = getPal(data.templateId);

  let slideNo = 1;

  // 1. Cover
  slideCover(prs, data, p);
  slideNo++;

  // 2. Agenda
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
