/**
 * Agency-Grade PPTX Generator
 * Produces high-end, visually-polished presentations in the style of
 * top strategic agencies (McKinsey, Ogilvy, McCann, etc.)
 *
 * Layout: 16:9 widescreen (13.33 × 7.5 inches)
 * Structure: Cover → Objective → Findings → Highlights → Recommendations → Closing
 */

import PptxGenJS from 'pptxgenjs';
import { getTemplate } from './templates';

// ─── Canvas ─────────────────────────────────────────────────────────────────
const W  = 13.33;   // slide width  (LAYOUT_WIDE)
const H  = 7.5;     // slide height
const ML = 0.65;    // left margin
const MR = 0.55;    // right margin
const CW = W - ML - MR; // content width  ≈ 12.13

// ─── Typography ─────────────────────────────────────────────────────────────
const FH = 'Arial';     // headline / display
const FB = 'Calibri';   // body / UI

// ─── Per-template Agency Palettes ───────────────────────────────────────────
interface Palette {
  dark: string; // deep background (cover, closing)
  mid:  string; // panel / band backgrounds
  pri:  string; // primary brand colour (headings, badges)
  acc:  string; // accent / highlight
  td:   string; // text – dark
  tm:   string; // text – medium
  tl:   string; // text – light / muted (on dark bg)
}

const PALETTES: Record<string, Palette> = {
  executive_briefing: { dark:'0D1B2A', mid:'1A3655', pri:'1C6DD0', acc:'E8A020', td:'0D1B2A', tm:'1E3A5F', tl:'7A9CC0' },
  client_pitch:       { dark:'0A0E27', mid:'1A2766', pri:'2563EB', acc:'F97316', td:'0A0E27', tm:'1E3A8A', tl:'7096C4' },
  deep_dive:          { dark:'1E1B4B', mid:'312E81', pri:'4F46E5', acc:'A78BFA', td:'1E1B4B', tm:'3730A3', tl:'818CF8' },
  board_presentation: { dark:'0F172A', mid:'1E293B', pri:'334155', acc:'94A3B8', td:'0F172A', tm:'334155', tl:'64748B' },
  team_update:        { dark:'2D1B69', mid:'4C1D95', pri:'7C3AED', acc:'C4B5FD', td:'2D1B69', tm:'5B21B6', tl:'A78BFA' },
  investor_update:    { dark:'1A0505', mid:'7F1D1D', pri:'DC2626', acc:'FCA5A5', td:'1A0505', tm:'991B1B', tl:'F87171' },
  quick_overview:     { dark:'001B33', mid:'0C4A6E', pri:'0891B2', acc:'38BDF8', td:'001B33', tm:'0E7490', tl:'7DD3FC' },
};

function getPal(templateId: string): Palette {
  return PALETTES[templateId] ?? PALETTES['executive_briefing'];
}

// ─── Public interface ────────────────────────────────────────────────────────
export interface PresentationData {
  templateId:      string;
  briefName:       string;
  headline:        string;
  objective:       string;
  observations:    string[];
  recommendations: string[];
  date?:           string;
}

// ─── Low-level drawing helpers ───────────────────────────────────────────────
/** Filled rectangle with no border */
function rect(s: any, x: number, y: number, w: number, h: number, color: string) {
  s.addShape('rect', {
    x, y, w, h,
    fill: { color },
    line: { type: 'none', width: 0 },
  });
}

/** Horizontal rule */
function hrule(s: any, x: number, y: number, w: number, color: string, pt = 0.75) {
  s.addShape('line', { x, y, w, h: 0, line: { color, width: pt } });
}

/** Text box */
function txt(
  s: any,
  text: string,
  x: number, y: number, w: number, h: number,
  opts: Record<string, any>,
) {
  s.addText(text || '', { x, y, w, h, wrap: true, ...opts });
}

/** Slide number + brief name footer (on dark slides use light text) */
function footer(s: any, slideNo: number, briefName: string, p: Palette, dark = false) {
  const color = dark ? p.tl : 'B0BEC5';
  // slide number
  txt(s, String(slideNo), W - MR - 0.3, H - 0.38, 0.3, 0.25, {
    fontSize: 8, color, fontFace: FB, align: 'right', valign: 'middle',
  });
  // brief name
  txt(s, briefName.toUpperCase(), ML, H - 0.38, 5, 0.25, {
    fontSize: 8, color, fontFace: FB, align: 'left', valign: 'middle',
    charSpacing: 1.5,
  });
  // footer rule
  hrule(s, ML, H - 0.45, CW, dark ? p.mid : 'E2E8F0', 0.5);
}

// ─── Slide 1: Cover ──────────────────────────────────────────────────────────
function slideCover(prs: any, d: PresentationData, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: p.dark };

  // Full-width decorative left band
  rect(s, 0, 0, 0.22, H, p.mid);

  // Top-right corner accent block
  rect(s, W - 1.8, 0, 1.8, 1.2, p.pri);

  // Bottom accent bar
  rect(s, 0, H - 0.18, W, 0.18, p.acc);

  // Diagonal accent line group (purely decorative geometric)
  hrule(s, ML, 1.85, 1.4, p.acc, 2.5);
  hrule(s, ML, 1.98, 0.85, p.pri, 1.5);

  // Category label above headline
  txt(s, (d.briefName || 'Strategic Analysis').toUpperCase(), ML + 0.28, 2.22, CW, 0.3, {
    fontSize: 10, color: p.acc, fontFace: FB, bold: true,
    charSpacing: 3, align: 'left', valign: 'top',
  });

  // Headline – large display type
  txt(s, d.headline || 'Strategic Insights', ML + 0.28, 2.62, CW - 2.2, 2.0, {
    fontSize: 42, color: 'FFFFFF', fontFace: FH, bold: true,
    align: 'left', valign: 'top', lineSpacingMultiple: 1.1,
  });

  // Objective sub-line
  const obShort = (d.objective || '').length > 120
    ? d.objective.slice(0, 120) + '…'
    : d.objective;
  txt(s, obShort, ML + 0.28, 4.82, CW - 2.2, 0.8, {
    fontSize: 13, color: p.tl, fontFace: FB, align: 'left', valign: 'top',
    lineSpacingMultiple: 1.35,
  });

  // Date + divider
  hrule(s, ML + 0.28, 5.78, 1.6, p.pri, 1);
  txt(s, d.date || new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' }),
    ML + 0.28, 5.92, 4, 0.28, {
      fontSize: 10, color: p.tl, fontFace: FB, align: 'left',
    });

  // "CONFIDENTIAL" watermark-style stamp (top right, rotated feel via placement)
  txt(s, 'CONFIDENTIAL', W - 3.6, 0.35, 3.2, 0.28, {
    fontSize: 9, color: 'FFFFFF', fontFace: FB, bold: true,
    charSpacing: 2.5, align: 'right',
  });
}

// ─── Slide 2: Objective / Context ────────────────────────────────────────────
function slideObjective(prs: any, d: PresentationData, slideNo: number, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: 'FAFBFD' };

  // Left accent bar
  rect(s, 0, 0, 0.12, H, p.pri);

  // Slide-type label
  txt(s, 'BRIEF CONTEXT', ML + 0.18, 0.42, 5, 0.22, {
    fontSize: 9, color: p.pri, fontFace: FB, bold: true, charSpacing: 2.5,
  });

  // Section heading
  txt(s, 'Objective & Scope', ML + 0.18, 0.72, CW, 0.65, {
    fontSize: 32, color: p.dark, fontFace: FH, bold: true, lineSpacingMultiple: 1.05,
  });

  hrule(s, ML + 0.18, 1.5, 1.8, p.acc, 2.5);

  // Objective box (light background card)
  rect(s, ML + 0.18, 1.72, CW - 0.1, 1.55, 'EEF2FF');
  rect(s, ML + 0.18, 1.72, 0.08, 1.55, p.pri);  // left strip
  txt(s, d.objective || 'No objective provided.', ML + 0.46, 1.85, CW - 0.56, 1.2, {
    fontSize: 14, color: p.td, fontFace: FB, lineSpacingMultiple: 1.45, valign: 'middle',
  });

  // "About this brief" label
  txt(s, 'ABOUT THIS BRIEF', ML + 0.18, 3.48, 5, 0.22, {
    fontSize: 9, color: p.tm, fontFace: FB, bold: true, charSpacing: 2.5,
  });

  // Brief name + template name
  txt(s, d.briefName, ML + 0.18, 3.78, CW, 0.55, {
    fontSize: 22, color: p.pri, fontFace: FH, bold: true,
  });

  txt(s,
    `Analysis generated on ${d.date || 'today'} · ${d.observations.length} key findings · ${d.recommendations.length} strategic recommendations`,
    ML + 0.18, 4.42, CW, 0.38, {
      fontSize: 11, color: '64748B', fontFace: FB,
    });

  // Bottom stat strip
  rect(s, ML + 0.18, 5.2, CW - 0.1, 1.12, p.dark);
  const stats = [
    { label: 'FINDINGS',        value: String(d.observations.length) },
    { label: 'RECOMMENDATIONS', value: String(d.recommendations.length) },
    { label: 'BRIEF',           value: (d.briefName || 'N/A').slice(0, 18) },
  ];
  const sw = (CW - 0.1) / 3;
  stats.forEach((st, i) => {
    const sx = ML + 0.18 + i * sw;
    if (i > 0) rect(s, sx, 5.2, 0.012, 1.12, p.mid); // divider
    txt(s, st.value, sx + 0.25, 5.32, sw - 0.3, 0.48, {
      fontSize: 24, color: 'FFFFFF', fontFace: FH, bold: true, valign: 'middle',
    });
    txt(s, st.label, sx + 0.25, 5.84, sw - 0.3, 0.28, {
      fontSize: 8, color: p.tl, fontFace: FB, bold: true, charSpacing: 1.5,
    });
  });

  footer(s, slideNo, d.briefName, p);
}

// ─── Slide 3: Key Findings ────────────────────────────────────────────────────
function slideFindings(prs: any, d: PresentationData, slideNo: number, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: 'FFFFFF' };

  // Left accent bar
  rect(s, 0, 0, 0.12, H, p.acc);

  // Label
  txt(s, 'ANALYSIS', ML + 0.18, 0.42, 5, 0.22, {
    fontSize: 9, color: p.acc, fontFace: FB, bold: true, charSpacing: 2.5,
  });

  // Section heading
  txt(s, 'Key Findings', ML + 0.18, 0.72, CW, 0.65, {
    fontSize: 32, color: p.dark, fontFace: FH, bold: true,
  });

  hrule(s, ML + 0.18, 1.5, 1.8, p.pri, 2.5);

  // Observation cards — up to 5
  const obs = d.observations.slice(0, 5);
  const rowH  = 0.88;
  const rowGap = 0.14;
  const startY = 1.7;

  obs.forEach((text, i) => {
    const y = startY + i * (rowH + rowGap);

    // Row background
    rect(s, ML + 0.18, y, CW - 0.1, rowH, i % 2 === 0 ? 'F8FAFC' : 'FFFFFF');

    // Number badge (filled ellipse-style via small rect with rounded suggestion)
    rect(s, ML + 0.18, y + 0.18, 0.44, 0.44, p.pri);
    txt(s, String(i + 1), ML + 0.18, y + 0.18, 0.44, 0.44, {
      fontSize: 14, color: 'FFFFFF', fontFace: FH, bold: true,
      align: 'center', valign: 'middle',
    });

    // Left accent strip
    rect(s, ML + 0.18, y, 0.06, rowH, i % 2 === 0 ? p.pri : p.acc);

    // Finding text
    const shortened = text.length > 140 ? text.slice(0, 140) + '…' : text;
    txt(s, shortened, ML + 0.82, y + 0.08, CW - 0.9, rowH - 0.16, {
      fontSize: 13, color: p.td, fontFace: FB, valign: 'middle',
      lineSpacingMultiple: 1.3,
    });
  });

  footer(s, slideNo, d.briefName, p);
}

// ─── Slide 4: Highlights (stat cards) ────────────────────────────────────────
function slideHighlights(prs: any, d: PresentationData, slideNo: number, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: p.dark };

  // Top accent band
  rect(s, 0, 0, W, 0.18, p.acc);

  // Label
  txt(s, 'STRATEGIC HIGHLIGHTS', ML, 0.42, CW, 0.25, {
    fontSize: 9, color: p.tl, fontFace: FB, bold: true, charSpacing: 2.5,
  });

  // Heading
  txt(s, 'What the data tells us', ML, 0.76, CW, 0.72, {
    fontSize: 34, color: 'FFFFFF', fontFace: FH, bold: true,
  });

  hrule(s, ML, 1.55, 1.6, p.acc, 2.5);

  // 3 big stat / callout cards
  const highlights = d.observations.slice(0, 3);
  const cardW = (CW - 0.5) / 3;
  const cardH = 3.6;
  const cardY = 1.82;

  const cardColors = [p.pri, p.mid, p.mid];

  highlights.forEach((text, i) => {
    const cx = ML + i * (cardW + 0.25);

    // Card background
    rect(s, cx, cardY, cardW, cardH, cardColors[i]);

    // Top accent stripe
    rect(s, cx, cardY, cardW, 0.1, i === 0 ? p.acc : p.pri);

    // Number — large display
    txt(s, `0${i + 1}`, cx + 0.22, cardY + 0.28, cardW - 0.4, 0.72, {
      fontSize: 36, color: i === 0 ? p.acc : p.tl,
      fontFace: FH, bold: true, align: 'left',
    });

    // FINDING label
    txt(s, 'FINDING', cx + 0.22, cardY + 1.05, cardW - 0.4, 0.22, {
      fontSize: 8, color: p.tl, fontFace: FB, bold: true, charSpacing: 1.8,
    });

    // Body text
    const shortened = text.length > 130 ? text.slice(0, 130) + '…' : text;
    txt(s, shortened, cx + 0.22, cardY + 1.35, cardW - 0.44, cardH - 1.55, {
      fontSize: 12.5, color: 'FFFFFF', fontFace: FB,
      lineSpacingMultiple: 1.4, valign: 'top',
    });
  });

  // Bottom note
  if (d.observations.length > 3) {
    txt(s, `+ ${d.observations.length - 3} additional findings in full report`, ML, 5.62, CW, 0.28, {
      fontSize: 10, color: p.tl, fontFace: FB, align: 'left',
    });
  }

  footer(s, slideNo, d.briefName, p, true);
}

// ─── Slide 5: Recommendations ────────────────────────────────────────────────
function slideRecommendations(prs: any, d: PresentationData, slideNo: number, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: 'FFFFFF' };

  // Left accent bar
  rect(s, 0, 0, 0.12, H, p.pri);

  // Label
  txt(s, 'STRATEGIC DIRECTION', ML + 0.18, 0.42, 8, 0.22, {
    fontSize: 9, color: p.pri, fontFace: FB, bold: true, charSpacing: 2.5,
  });

  // Heading
  txt(s, 'Recommendations', ML + 0.18, 0.72, CW, 0.65, {
    fontSize: 32, color: p.dark, fontFace: FH, bold: true,
  });

  hrule(s, ML + 0.18, 1.5, 1.8, p.acc, 2.5);

  // Recommendation cards — up to 5
  const recs = d.recommendations.slice(0, 5);
  const rowH  = 0.9;
  const rowGap = 0.12;
  const startY = 1.7;

  recs.forEach((text, i) => {
    const y = startY + i * (rowH + rowGap);

    // Row shadow background
    rect(s, ML + 0.18, y, CW - 0.1, rowH, 'F1F5F9');

    // Left priority strip
    rect(s, ML + 0.18, y, 0.36, rowH, p.pri);

    // Priority number on strip
    txt(s, String(i + 1), ML + 0.18, y, 0.36, rowH, {
      fontSize: 15, color: 'FFFFFF', fontFace: FH, bold: true,
      align: 'center', valign: 'middle',
    });

    // Recommendation text
    const shortened = text.length > 140 ? text.slice(0, 140) + '…' : text;
    txt(s, shortened, ML + 0.7, y + 0.09, CW - 0.78, rowH - 0.18, {
      fontSize: 13, color: p.td, fontFace: FB, valign: 'middle',
      lineSpacingMultiple: 1.3,
    });

    // Priority label in top-right of row
    const priorityLabel = i === 0 ? 'HIGH PRIORITY' : i === 1 ? 'HIGH PRIORITY' : 'MEDIUM';
    const priorityColor = i <= 1 ? p.acc : '94A3B8';
    txt(s, priorityLabel, ML + 0.18 + CW - 2.2, y + 0.06, 1.9, 0.22, {
      fontSize: 7.5, color: priorityColor, fontFace: FB, bold: true,
      charSpacing: 1.2, align: 'right',
    });
  });

  footer(s, slideNo, d.briefName, p);
}

// ─── Slide 6: Closing / What's Next ──────────────────────────────────────────
function slideClosing(prs: any, d: PresentationData, p: Palette) {
  const s = prs.addSlide();
  s.background = { color: p.dark };

  // Top accent bar
  rect(s, 0, 0, W, 0.18, p.pri);

  // Bottom accent bar
  rect(s, 0, H - 0.18, W, 0.18, p.acc);

  // Left geometric block
  rect(s, 0, H * 0.28, 0.55, H * 0.44, p.mid);

  // Right decorative corner
  rect(s, W - 1.4, H - 1.6, 1.4, 1.6, p.mid);
  rect(s, W - 0.8, H - 0.9, 0.8, 0.9, p.pri);

  // "WHAT'S NEXT" label
  txt(s, "WHAT'S NEXT", ML + 0.65, 1.85, CW, 0.26, {
    fontSize: 10, color: p.acc, fontFace: FB, bold: true, charSpacing: 3,
  });

  // Main CTA heading
  txt(s, 'Ready to act\non these insights?', ML + 0.65, 2.28, CW - 2, 2.0, {
    fontSize: 44, color: 'FFFFFF', fontFace: FH, bold: true,
    lineSpacingMultiple: 1.08,
  });

  hrule(s, ML + 0.65, 4.45, 1.8, p.acc, 2.5);

  // Primary recommendation callout
  const primaryRec = d.recommendations[0] || 'Review findings and schedule next steps.';
  txt(s, `"${primaryRec}"`, ML + 0.65, 4.72, CW - 2.2, 0.9, {
    fontSize: 13, color: p.tl, fontFace: FB, italic: true,
    lineSpacingMultiple: 1.4, valign: 'top',
  });

  // Date / sign-off
  txt(s, d.date || new Date().toLocaleDateString('en-US', { year:'numeric', month:'long' }),
    ML + 0.65, 5.85, 4, 0.28, {
      fontSize: 10, color: p.tl, fontFace: FB,
    });

  // Brief name stamp
  txt(s, (d.briefName || '').toUpperCase(), W - MR - 5.5, 5.85, 5.2, 0.28, {
    fontSize: 10, color: p.tl, fontFace: FB, bold: true,
    charSpacing: 1.8, align: 'right',
  });
}

// ─── Main entry point ────────────────────────────────────────────────────────
export async function generatePresentation(data: PresentationData): Promise<Buffer> {
  const template = getTemplate(data.templateId);
  if (!template) throw new Error(`Template not found: ${data.templateId}`);

  const prs = new PptxGenJS();
  prs.layout = 'LAYOUT_WIDE';  // 13.33 × 7.5 inches (16:9)

  const p   = getPal(data.templateId);
  const isQ = data.templateId === 'quick_overview';

  // Always render all 6 slides (quick_overview skips highlights)
  slideCover(prs, data, p);                     // slide 1
  slideObjective(prs, data, 2, p);              // slide 2
  slideFindings(prs, data, 3, p);               // slide 3
  if (!isQ) {
    slideHighlights(prs, data, 4, p);           // slide 4
    slideRecommendations(prs, data, 5, p);      // slide 5
    slideClosing(prs, data, p);                 // slide 6
  } else {
    slideRecommendations(prs, data, 4, p);      // slide 4
    slideClosing(prs, data, p);                 // slide 5
  }

  return new Promise<Buffer>((resolve, reject) => {
    prs.write({ outputType: 'arraybuffer' })
      .then((buf: ArrayBuffer) => resolve(Buffer.from(buf)))
      .catch(reject);
  });
}
