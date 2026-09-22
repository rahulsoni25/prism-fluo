// scripts/learning-book/figures-a.mjs — figures for chapters 1–7 (part A)
import { C, text, lines, box, tint, node, pill, arrow, hline, vline, eyebrow, bracket, svg, wrap, tw } from './svg.mjs';

/** Left-aligned panel: title on top, then bullet lines. */
function panel(x, y, w, h, title, body, o = {}) {
  const { color = C.accent, size = 11, titleSize = 13, mono = false } = o;
  return tint(x, y, w, h, color, { alpha: 0.07 }) +
    text(x + 14, y + 22, title, { size: titleSize, weight: 600 }) +
    hline(x + 14, x + w - 14, y + 32, { color: color, sw: 1 }) +
    lines(x + 14, y + 50, body, { size, fill: C.ink2, mono });
}

/** Tier node with a conviction badge on the right. */
function tierNode(id, x, y, w, h, title, sub, conv, color) {
  const bw = 72;
  return tint(x, y, w, h, color, { alpha: 0.09 }) +
    text(x + 14, y + 24, title, { size: 13, weight: 700 }) +
    lines(x + 14, y + 44, sub, { size: 11, fill: C.ink2, mono: true, lh: 16 }) +
    vline(x + w - bw - 8, y + 10, y + h - 10, { color: color, sw: 1 }) +
    text(x + w - bw / 2 - 4, y + h / 2 - 4, String(conv), { size: 26, weight: 700, anchor: 'middle', fill: color }) +
    text(x + w - bw / 2 - 4, y + h / 2 + 14, 'conviction', { size: 9.5, anchor: 'middle', fill: C.muted, mono: true, letterSpacing: '0.06em' });
}

export const coverArt = () => {
  const id = 'cover';
  const W = 560, H = 320;
  const px = 250, py = 150; // prism centre
  const tri = `M${px},${py - 95} L${px + 105},${py + 80} L${px - 105},${py + 80} Z`;
  const rays = [
    ['Content', C.content, 40], ['Commerce', C.commerce, 105], ['Communication', C.communication, 170], ['Culture', C.culture, 235],
  ];
  let body = '';
  // incoming beam
  body += `<line x1="8" y1="${py + 10}" x2="${px - 60}" y2="${py + 10}" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/>`;
  body += text(80, py - 4, 'raw data', { size: 11, fill: C.muted, mono: true, letterSpacing: '0.08em' });
  body += `<path d="${tri}" fill="${C.accent}" fill-opacity="0.10" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/>`;
  body += text(px, py + 30, 'PRISM', { size: 15, weight: 700, anchor: 'middle', letterSpacing: '0.18em' });
  rays.forEach(([label, color, ey], i) => {
    body += `<path d="M${px + 40},${py + 2 + i * 10} L${W - 130},${ey + 14}" stroke="${color}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
    body += text(W - 122, ey + 18, label, { size: 13, weight: 600, fill: color });
  });
  body += text(W - 122, 290, '8 insight cards · 2 per bucket', { size: 11, fill: C.muted, mono: true, anchor: 'end' });
  return svg(id, W, H, 'A beam of raw data enters a prism and splits into four coloured rays: Content, Commerce, Communication and Culture.', body, { minWidth: 0 });
};

export const FIGURES_A = [
  {
    id: 'workflow',
    place: { heading: '1. Platform Overview', after: 'list' },
    caption: 'The user workflow as one line: the user submits a brief and uploads data; PRISM detects the data type, routes it, writes the narrative cards from pre-computed slot data, and displays them.',
    aria: 'Five-step flow from submitting a brief to cards displayed on the insights page.',
    svg() {
      const id = 'workflow'; const W = 900, H = 200;
      const w = 156, gap = 22, y = 48, h = 96, x0 = 14;
      const steps = [
        ['1 · Submit brief', ['brand, category,', 'objective']],
        ['2 · Upload data', ['file(s) via /upload']],
        ['3 · Detect & route', ['system detects data type,', 'routes to correct pipeline']],
        ['4 · Gemini writes', ['narrative cards from', 'pre-computed slot data']],
        ['5 · Cards displayed', ['at /insights?id=...']],
      ];
      let b = '';
      b += bracket(x0, x0 + 2 * w + gap, 30, 'User');
      b += bracket(x0 + 2 * (w + gap), x0 + 5 * w + 4 * gap, 30, 'PRISM');
      steps.forEach(([t, s], i) => {
        const x = x0 + i * (w + gap);
        b += node(x, y, w, h, t, { sub: s, color: i < 2 ? C.muted : C.accent, titleSize: 12.5, subSize: 10.5 });
        if (i < 4) b += arrow(id, [[x + w + 2, y + h / 2], [x + w + gap - 2, y + h / 2]], { color: 'ink' });
      });
      b += pill(x0 + 2 * (w + gap) + (3 * w + 2 * gap) / 2, 164, 'Core principle — PRISM never invents numbers · every stat must come from the slot', { anchor: 'middle', color: C.accent, size: 10.5 });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'buckets',
    place: { heading: '2. The Four PRISM Buckets', after: 'table' },
    caption: 'The four PRISM buckets. Every insight card belongs to exactly one, and they appear as tabs on the insights page.',
    aria: 'Four tiles: Content, Commerce, Communication and Culture, each with what it covers.',
    svg() {
      const id = 'buckets'; const W = 900, H = 228;
      const tiles = [
        ['📝', 'Content', C.content, 'What people watch/read/play, formats, devices, screen behaviour, OTT, streaming'],
        ['🛒', 'Commerce', C.commerce, 'Purchase behaviour, shopping, pricing, brand preference, retailers, e-commerce, BSR'],
        ['📢', 'Communication', C.communication, 'How brands show up: ads, campaigns, discovery, social media, brand voice, earned media'],
        ['🌍', 'Culture', C.culture, 'Who the audience is: demographics, lifestyle, values, identity, family, employment'],
      ];
      let b = eyebrow(14, 22, 'Every insight card → one of four buckets · shown as tabs on the insights page');
      tiles.forEach(([icon, name, color, blurb], i) => {
        const x = 14 + i * 224, y = 40, w = 207, h = 156;
        b += box(x, y, w, h, { stroke: color });
        b += `<rect x="${x}" y="${y}" width="${w}" height="7" rx="3" fill="${color}"/>`;
        b += text(x + 16, y + 42, icon, { size: 20 });
        b += text(x + 46, y + 41, name, { size: 16, weight: 700, fill: color });
        b += lines(x + 16, y + 70, wrap(blurb, 30), { size: 11.5, fill: C.ink2, lh: 17 });
      });
      b += text(14, 220, '8 insight cards per analysis · 2 per bucket', { size: 11, fill: C.muted, mono: true });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'bucket-priority',
    place: { heading: 'Bucket Assignment — Three-tier Priority', after: 'code', nth: 3 },
    caption: 'How a card gets its bucket. Hard-coded chart-ID rules always win; keyword scoring runs only when no rule matches; the chart-type fallback runs only when no keyword matches either.',
    aria: 'Three stacked tiers of bucket assignment with fall-through arrows and a shared bucket output.',
    svg() {
      const id = 'bp'; const W = 900, H = 372;
      let b = '';
      b += node(14, 26, 186, 84, 'Insight card', { sub: ['chart id · title · obs', 'labels · chart type'], color: C.muted, mono: true, subSize: 10.5 });
      const tiers = [
        ['Tier 1 — Hard-coded chart ID rules', ['gwi_index_heatmap → culture · keyword_tiers → commerce', 'brand_share / cross_cat → commerce · corr_scatter → communication', 'bubble_3way / radar_bench → culture', 'time_* → even index content, odd communication · cat_* rotates'], C.tier1],
        ['Tier 2 — Text keyword scoring', ['title + obs + labels scored against 4 regex patterns', 'commerce · communication · culture · content'], C.tier2],
        ['Tier 3 — Chart-type semantic fallback', ['pie / bar / hbar → commerce · line / area → content', 'scatter → communication · bubble / radar → culture'], C.tier3],
      ];
      const tx = 246, tw_ = 470, th = 96, ys = [20, 140, 260];
      tiers.forEach(([t, s, color], i) => {
        const y = ys[i];
        b += tint(tx, y, tw_, th, color, { alpha: 0.09 });
        b += text(tx + 14, y + 24, t, { size: 13, weight: 700 });
        b += lines(tx + 14, y + 44, s, { size: 10.5, fill: C.ink2, mono: true, lh: 15 });
        if (i < 2) b += arrow(id, [[tx + 60, y + th], [tx + 60, ys[i + 1]]], { color: 'muted', label: i === 0 ? 'no rule matches' : 'no keyword matches', labelAnchor: 'start', labelDx: 10, labelDy: 4 });
      });
      b += arrow(id, [[200, 68], [tx, 68]], { color: 'ink' });
      // shared bucket output
      b += node(760, 146, 126, 84, 'Bucket', { sub: ['content · commerce', 'communication · culture'], color: C.accent, subSize: 10 });
      b += arrow(id, [[tx + tw_, 68], [740, 68], [740, 188], [760, 188]], { color: 'accent', label: 'match → always wins', labelAt: 0.18, labelDy: -7 });
      b += arrow(id, [[tx + tw_, 188], [760, 188]], { color: 'accent', label: 'best score', labelDy: -6 });
      b += arrow(id, [[tx + tw_, 308], [740, 308], [740, 188]], { color: 'accent', label: 'by chart type', labelAt: 0.2, labelDy: -7, head: false });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'cascade',
    place: { heading: '3. 3-Tier AI Cascade Architecture', after: 'code', nth: 1 },
    caption: 'The three-tier cascade. Both paths try Gemini first, fall through to the OpenRouter cascade, then to Auto-Analysis; the conviction score on each tier is what the UI shows. The GWI path batches 18 slots into 3 parallel Gemini calls with a 30-second hard timeout each.',
    aria: 'Two columns, GWI path and generic path, each with three tiers: Gemini, OpenRouter, Auto-Analysis, with conviction scores 90/82/70 and 88/82/70.',
    svg() {
      const id = 'cascade'; const W = 900, H = 664;
      let b = '';
      b += node(300, 14, 300, 44, 'POST /api/ai/analyze-data', { color: C.ink, titleSize: 13, weight: 700 });
      const cols = [
        { x: 14, head: 'GWI path (slots.length > 0)', tiers: [
          ['TIER 1 · Gemini 2.5 (Primary)', ['Models: 2.0-flash-lite →', '  2.5-flash-preview → 2.5-pro', '3 parallel batches of 6 slots,', '  30s hard timeout each', 'toolLabel: "GWI"'], 90, C.tier1],
          ['TIER 2 · OpenRouter', ['7-model cascade, batches of 8, sequential', 'toolLabel: "GWI · OpenRouter"'], 82, C.tier2],
          ['TIER 3 · Auto-Analysis (no AI, pure slot data)', ['Never hallucinates —', 'every sentence template-matched', 'toolLabel: "GWI · Auto-Analysis"'], 70, C.tier3],
        ], fails: ['all batches fail', 'all OpenRouter models fail'], end: 'no index scores in data → 422 error' },
        { x: 466, head: 'Generic tabular / Social Listening path', tiers: [
          ['TIER 1 · Gemini (40s timeout)', ['analyzeGenericTabularForPRISM or', 'analyzeSocialListeningForPRISM'], 88, C.tier1],
          ['TIER 2 · OpenRouter (same 7-model cascade)', ['Uses buildInsightSlots(rows) as slot input'], 82, C.tier2],
          ['TIER 3 · Auto-Analysis (generic tabular only)', ['generateFallbackCards(genericSlots)', 'Works when data has Index-like columns'], 70, C.tier3],
        ], fails: ['Gemini fails', 'OpenRouter fails'], end: 'no slots → 502 / 422 error' },
      ];
      const cw = 420, th = 120, ys = [140, 306, 472];
      cols.forEach((c) => {
        b += box(c.x, 84, cw, 34, { fill: C.fill, stroke: C.line, rx: 6 });
        b += text(c.x + cw / 2, 106, c.head, { size: 12.5, weight: 700, anchor: 'middle' });
        b += arrow(id, [[450, 58], [450, 72], [c.x + cw / 2, 72], [c.x + cw / 2, 84]], { color: 'ink' });
        c.tiers.forEach(([t, s, conv, color], i) => {
          b += tierNode(id, c.x, ys[i], cw, th, t, s, conv, color);
          const fromY = i === 0 ? 118 : ys[i - 1] + th;
          b += arrow(id, [[c.x + 40, fromY], [c.x + 40, ys[i]]], i === 0 ? { color: 'ink' } : { color: 'muted', label: c.fails[i - 1], labelAnchor: 'start', labelDx: 10, labelDy: 4 });
        });
        b += arrow(id, [[c.x + 40, ys[2] + th], [c.x + 40, 622]], { color: 'warn', label: 'no data to work with', labelAnchor: 'start', labelDx: 10, labelDy: 4 });
        b += pill(c.x + 40, 626, c.end, { color: C.warn, size: 10.5, mono: true });
      });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'vercel-timeline',
    place: { heading: '3. 3-Tier AI Cascade Architecture', after: 'code', nth: 2 },
    caption: 'Why every Gemini batch is raced against a 30-second deadline. Without it, a hanging batch runs into Vercel’s 60-second kill and the fallback code never executes; with it, allSettled resolves by t=30 and OpenRouter still has roughly 25 seconds inside the same function call.',
    aria: 'Two timelines from 0 to 60 seconds comparing a hanging Gemini call without a timeout against three 30-second batches followed by an OpenRouter window.',
    svg() {
      const id = 'vt'; const W = 900, H = 330;
      const ax0 = 190, ax1 = 850, sx = (s) => ax0 + (ax1 - ax0) * (s / 60);
      let b = '';
      // axis
      for (let s = 0; s <= 60; s += 10) {
        b += vline(sx(s), 40, 300, { color: C.soft, sw: 1 });
        b += text(sx(s), 318, `${s}s`, { size: 10.5, anchor: 'middle', fill: C.muted, mono: true });
      }
      b += vline(sx(60), 36, 304, { color: C.warn, sw: 1.5, dash: '5 4' });
      b += text(sx(60) - 6, 32, 'maxDuration = 60s · function killed', { size: 10.5, anchor: 'end', fill: C.warn, weight: 600 });
      // lane A
      b += eyebrow(14, 70, 'Without withTimeout()');
      b += lines(14, 90, ['one Gemini batch hangs'], { size: 11, fill: C.ink2 });
      b += box(sx(0), 100, sx(60) - sx(0), 28, { fill: C.warn, stroke: C.warn, fillOpacity: 0.15, rx: 4 });
      b += text(sx(30), 119, 'Gemini batch … still waiting …', { size: 11.5, anchor: 'middle', fill: C.warn, weight: 600 });
      b += text(sx(60) + 8, 119, '✕', { size: 14, fill: C.warn, weight: 700 });
      b += text(sx(0), 148, 'fallback code never runs — the request ends as a 504', { size: 10.5, fill: C.muted, italic: true });
      b += hline(14, 886, 172, { color: C.line });
      // lane B
      b += eyebrow(14, 196, 'With withTimeout(30s)');
      b += lines(14, 216, ['3 parallel batches, 30s each'], { size: 11, fill: C.ink2 });
      [0, 1, 2].forEach((i) => {
        const y = 186 + i * 24;
        b += box(sx(0), y, sx(30) - sx(0), 18, { fill: C.tier1, stroke: C.tier1, fillOpacity: 0.16, rx: 3 });
        b += text(sx(15), y + 13, `Gemini batch ${i + 1} · 30s hard timeout`, { size: 10.5, anchor: 'middle', fill: C.tier1, weight: 600 });
      });
      b += vline(sx(30), 182, 280, { color: C.ink, sw: 1.2 });
      b += text(sx(30) + 6, 276, 'Promise.allSettled resolves by t=30', { size: 10.5, fill: C.ink2, mono: true });
      b += box(sx(30), 234, sx(55) - sx(30), 18, { fill: C.tier2, stroke: C.tier2, fillOpacity: 0.16, rx: 3 });
      b += text(sx(42.5), 247, 'OpenRouter · ~25s if needed', { size: 10.5, anchor: 'middle', fill: C.tier2, weight: 600 });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'gwi-pipeline',
    place: { heading: '4. GWI Data Pipeline (Primary Path)', after: 'heading' },
    caption: 'The GWI primary path in four steps: detect the sheet, build up to 20 insight slots, send the first 18 to Gemini in three parallel batches, then fall back if nothing comes back.',
    aria: 'Four panels: detect GWI sheet, build insight slots, batch to Gemini, fallback chain.',
    svg() {
      const id = 'gp'; const W = 900, H = 300;
      const cols = [
        ['Step 1 · Detect', ['lib/gwi.ts — ALL must be true:', '• headers contain Audience %', '  (×2), Data point %, Universe,', '  Index, Responses, Short', '  Label, Attributes', '• first 10 rows contain', '  "source: gwi" OR "time', '  spent on social media"']],
        ['Step 2 · Build slots', ['buildInsightSlots', '• group by question', '• parse attr, audiencePct,', '  dataPct, index, universe', '• attr non-empty & index > 0', '• sort by Index desc, top 10', '• ≥ 2 slots per bucket, cap 20', '• chart suggestion per slot']],
        ['Step 3 · Batch → Gemini', ['• max 18 slots', '• batch size 6 → 3 parallel', '  Gemini calls', '• 30s hard timeout each', '  via withTimeout()', '• Promise.allSettled — failed', '  batches log a warning,', '  don\'t crash']],
        ['Step 4 · Fallback chain', ['insights.length === 0', '  (all Gemini batches failed)', '→ OpenRouter with ALL slots', '→ generateFallbackCards(slots)', '→ 422 error if no slots', '  (no index scores)']],
      ];
      let b = '';
      cols.forEach(([t, s], i) => {
        const x = 14 + i * 224;
        b += panel(x, 20, 207, 240, t, s, { color: i === 3 ? C.muted : C.accent, size: 10.5, mono: true });
        if (i < 3) b += arrow(id, [[x + 207 + 2, 140], [x + 224 - 2, 140]], { color: 'ink' });
      });
      b += text(14, 286, 'lib/gwi.ts → buildInsightSlots → app/api/ai/analyze-data/route.ts', { size: 10.5, fill: C.muted, mono: true });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'batching',
    place: { heading: 'Step 3: Batch and Send to Gemini', after: 'list' },
    caption: 'Slot batching. Of up to 20 slots, the first 18 are split into three batches of six and sent to Gemini in parallel; each batch has its own 30-second timeout, and allSettled keeps whatever came back.',
    aria: 'Twenty slot squares, the first eighteen grouped into three batches feeding three parallel Gemini calls that converge into Promise.allSettled and then insight cards.',
    svg() {
      const id = 'bt'; const W = 900, H = 330;
      let b = eyebrow(20, 22, 'Up to 20 slots (sorted, bucket-guaranteed)');
      const s = 26, g = 6, x0 = 20, y0 = 34;
      for (let i = 0; i < 20; i++) {
        const x = x0 + i * (s + g), sent = i < 18;
        b += box(x, y0, s, s, { fill: sent ? C.accent : C.surface, stroke: sent ? C.accent : C.line, fillOpacity: sent ? 0.14 : null, dash: sent ? null : '3 3', rx: 4 });
        b += text(x + s / 2, y0 + 17, String(i + 1), { size: 10, anchor: 'middle', fill: sent ? C.accent : C.muted, mono: true, weight: 600 });
      }
      b += text(x0 + 20 * (s + g) + 4, y0 + 17, 'slots 19–20 not sent (cap 18)', { size: 10, fill: C.muted, italic: true });
      const groups = [0, 1, 2].map((gi) => { const a = x0 + gi * 6 * (s + g); return [a, a + 6 * (s + g) - g]; });
      groups.forEach(([a, z], gi) => {
        const cx = (a + z) / 2;
        b += `<path d="M${a},${y0 + s + 6} L${a},${y0 + s + 12} L${z},${y0 + s + 12} L${z},${y0 + s + 6}" fill="none" stroke="${C.muted}" stroke-width="1.2"/>`;
        b += text(cx, y0 + s + 26, `Batch ${gi + 1} · 6 slots`, { size: 10.5, anchor: 'middle', fill: C.ink2, weight: 600 });
        b += arrow(id, [[cx, y0 + s + 32], [cx, 130]], { color: 'ink' });
        b += node(cx - 86, 130, 172, 56, `Gemini call ${gi + 1}`, { sub: ['30s hard timeout'], color: C.tier1, mono: true, subSize: 10.5 });
        b += arrow(id, [[cx, 186], [cx, 210], [305, 210], [305, 232]], { color: 'ink', head: gi === 1 });
      });
      b += node(195, 232, 220, 50, 'Promise.allSettled()', { color: C.ink, titleSize: 13 });
      b += arrow(id, [[415, 257], [600, 257]], { color: 'accent', label: ['failed batches log a warning,', 'don\'t crash the rest'], labelDy: -10 });
      b += node(600, 232, 260, 50, 'Insight cards', { sub: ['from every batch that returned'], color: C.accent, subSize: 10.5 });
      b += text(20, 316, 'parallel · in one function call · leaves ~25s for OpenRouter if all three fail', { size: 10.5, fill: C.muted, mono: true });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'card-anatomy',
    place: { heading: '5.1 GWI Slot Analysis Prompt (`analyzeDataForPRISM`)', after: 'code', nth: 1 },
    caption: 'From slot to card. Gemini receives one slot of pre-computed numbers and returns one card; it may only translate those numbers into plain English, never add new ones. The card regions on the right follow the prompt rules quoted in this section.',
    aria: 'A slot data block on the left, an arrow labelled Gemini translates numbers to words, and an annotated insight card on the right.',
    svg() {
      const id = 'ca'; const W = 900, H = 440;
      let b = '';
      // slot
      b += box(14, 26, 372, 300, { fill: C.fill, stroke: C.line, rx: 6 });
      b += eyebrow(28, 48, 'Slot sent to Gemini');
      b += lines(28, 72, [
        'SLOT N | PRISM Bucket: CULTURE',
        '       | Topic: Purchase Behaviour',
        'Suggested chart: hbar',
        'DATA (use ONLY these numbers — no other sources,',
        '      no estimates):',
        '  • Full Price: 48.6% of this audience have this —',
        '    that is 1.68× the national average, approximately',
        '    12.4 million people in India',
        '  • Sale Price: 38.1% of this audience have this —',
        '    that is 1.41× the national average...',
      ], { size: 10.5, mono: true, lh: 17, fill: C.ink });
      b += text(28, 300, 'one slot → one card · Card 1 → SLOT 1 only', { size: 10.5, fill: C.muted, italic: true });
      // arrow
      b += arrow(id, [[390, 176], [510, 176]], { color: 'accent', label: ['Gemini translates', 'numbers → words'], labelDy: -12 });
      // card
      const cx = 514, cy = 26, cw = 372, ch = 300;
      b += box(cx, cy, cw, ch, { rx: 8 });
      b += pill(cx + 14, cy + 12, 'CULTURE', { color: C.culture, size: 10, mono: true });
      b += pill(cx + 92, cy + 12, 'chart: hbar', { color: C.muted, size: 10, mono: true });
      b += text(cx + cw - 14, cy + 27, 'conviction 90 · GWI', { size: 10, anchor: 'end', fill: C.muted, mono: true });
      const region = (y, label, ls, color) => {
        let r = eyebrow(cx + 14, y, label, { fill: color });
        r += lines(cx + 14, y + 16, ls, { size: 11, fill: C.ink2, italic: true, lh: 15 });
        return r;
      };
      b += region(cy + 58, 'Title', ['magazine cover line — lead with the surprising', 'finding, include one plain-English number'], C.accent);
      b += region(cy + 110, 'Observation', ['S1 · punchy surprising fact from the highest-index item', 'S2 · the exact numbers in plain English', 'S3 · the strategic so-what, one direct sentence'], C.accent);
      b += region(cy + 178, 'Stat', ['one crisp number that would make a room go quiet'], C.accent);
      b += region(cy + 216, 'Recommendation', ['a direct brief: platform · format · creative angle'], C.accent);
      b += hline(cx + 14, cx + cw - 14, cy + 262, { color: C.soft });
      b += text(cx + 14, cy + 282, 'chart from the same slot · never raw Index numbers', { size: 10.5, fill: C.muted, mono: true });
      // translation examples
      b += box(14, 342, 872, 78, { fill: C.accent, stroke: C.accent, fillOpacity: 0.06, rx: 6 });
      b += eyebrow(28, 362, 'Allowed translations (from the anti-hallucination rule)');
      b += text(28, 384, '"3.45× the national average"', { size: 11.5, mono: true });
      b += text(268, 384, '→  "about 3 and a half times more likely"', { size: 11.5, fill: C.ink2 });
      b += text(28, 406, '"21.8% of this audience"', { size: 11.5, mono: true });
      b += text(268, 406, '→  "roughly 1 in 5 people"', { size: 11.5, fill: C.ink2 });
      b += text(872, 396, 'never invent, guess, or round differently', { size: 10.5, fill: C.warn, anchor: 'end', italic: true });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'social-charts',
    place: { heading: '5.3 Social Listening Prompt (`analyzeSocialListeningForPRISM`)', after: 'table' },
    caption: 'Chart mapping for social-listening data: each pre-aggregated block has a suggested chart shape.',
    aria: 'Eight tiles pairing a social-listening data block with its suggested chart type, each with a small chart glyph.',
    svg() {
      const id = 'sc'; const W = 900, H = 300;
      const A = C.accent, M = C.line;
      const glyph = {
        doughnut: (x, y) => `<circle cx="${x + 30}" cy="${y + 30}" r="20" fill="none" stroke="${M}" stroke-width="10"/><path d="M${x + 30},${y + 10} A20,20 0 0 1 ${x + 50},${y + 30}" fill="none" stroke="${A}" stroke-width="10"/>`,
        bar: (x, y) => [12, 30, 22, 38].map((h, i) => `<rect x="${x + 8 + i * 13}" y="${y + 52 - h}" width="9" height="${h}" rx="2" fill="${i === 3 ? A : M}"/>`).join(''),
        hbar: (x, y) => [40, 28, 18, 10].map((w, i) => `<rect x="${x + 8}" y="${y + 10 + i * 12}" width="${w}" height="8" rx="2" fill="${i === 0 ? A : M}"/>`).join(''),
        area: (x, y) => `<path d="M${x + 6},${y + 48} L${x + 18},${y + 34} L${x + 30},${y + 40} L${x + 42},${y + 20} L${x + 54},${y + 26} L${x + 54},${y + 52} L${x + 6},${y + 52} Z" fill="${A}" fill-opacity="0.25" stroke="${A}" stroke-width="2"/>`,
        combo: (x, y) => [20, 34, 26, 40].map((h, i) => `<rect x="${x + 8 + i * 13}" y="${y + 52 - h}" width="9" height="${h}" rx="2" fill="${M}"/>`).join('') + `<polyline points="${x + 12},${y + 36} ${x + 25},${y + 22} ${x + 38},${y + 30} ${x + 51},${y + 14}" fill="none" stroke="${A}" stroke-width="2.5"/>`,
        funnel: (x, y) => [[8, 52, 10], [16, 44, 22], [22, 38, 34], [26, 34, 46]].map(([a, z, yy], i) => `<rect x="${x + a}" y="${y + yy}" width="${z - a}" height="9" rx="2" fill="${i === 0 ? A : M}"/>`).join(''),
        waterfall: (x, y) => [[8, 22, 30], [21, 14, 8], [34, 26, 12], [47, 10, 42]].map(([xx, yy, h], i) => `<rect x="${x + xx}" y="${y + yy}" width="10" height="${h}" rx="2" fill="${i === 3 ? A : M}"/>`).join(''),
        radar: (x, y) => { const cx = x + 30, cy = y + 30; const pts = (r) => [0, 1, 2, 3, 4].map((k) => { const a = -Math.PI / 2 + k * 2 * Math.PI / 5; return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`; }).join(' '); return `<polygon points="${pts(22)}" fill="none" stroke="${M}" stroke-width="1.5"/><polygon points="${pts(14)}" fill="${A}" fill-opacity="0.25" stroke="${A}" stroke-width="2"/>`; },
      };
      const items = [
        ['Sentiment breakdown', 'doughnut', 'doughnut'], ['Platform distribution', 'bar or hbar', 'bar'], ['Top themes', 'hbar', 'hbar'], ['Volume over time', 'area', 'area'],
        ['Sentiment × Platform', 'combo', 'combo'], ['Funnel signals', 'funnel', 'funnel'], ['Month-on-month swings', 'waterfall', 'waterfall'], ['Multi-platform comparison', 'radar', 'radar'],
      ];
      let b = '';
      items.forEach(([label, chart, g], i) => {
        const x = 14 + (i % 4) * 224, y = 14 + Math.floor(i / 4) * 138, w = 207, h = 124;
        b += box(x, y, w, h, { rx: 6 });
        b += glyph[g](x + 12, y + 26);
        b += lines(x + 86, y + 44, wrap(label, 16), { size: 12, weight: 600, lh: 15 });
        b += pill(x + 86, y + 78, chart, { size: 10.5, mono: true, color: C.accent });
      });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'title-patterns',
    place: { heading: '6. Insight Title Patterns (A–F)', after: 'table' },
    caption: 'The six title patterns as a picker: when each applies, the structure it produces, and the signal words that trigger it.',
    aria: 'Six cards labelled A to F, each with its use case, structure template and signal words.',
    svg() {
      const id = 'tp'; const W = 900, H = 448;
      const cards = [
        ['A', 'HOOK FIRST', 'Behaviour is surprising or counterintuitive', '[Surprising behavior] — [Who + What], [Stat]', '"despite", "instead of", "rather than", "avoiding", "ignoring"'],
        ['B', 'STAT FIRST', 'The number itself is the most shocking element', '[Stat]: [Why humans do this] — [Brand implication]', 'very large %, a multiple (3×, 10×), or a shocking rank'],
        ['C', 'HUMAN FIRST', 'Emotion or fear is the real driver', '[Human emotion/behavior] drives [Main insight] — [Stat] [Context]', '"fear", "trust", "prefer", "choose", "avoid", "worry"'],
        ['D', 'TENSION', 'Data contradicts what brands currently believe', '[Old assumption] is wrong — [New reality], [Stat] [Who]', 'gap between brand behaviour and consumer behaviour'],
        ['E', 'QUESTION', 'Finding raises an obvious "but why?"', 'Why [Human behavior]? [Answer] — [Stat] in [Context]', 'an unexplained pattern that needs a cause'],
        ['F', 'CONSEQUENCE', 'Stat signals a trend demanding brand action NOW', '[Stat] [Who] now [behavior] — [Brand] must [implication]', 'rapid growth, first-time behaviour, competitive window closing'],
      ];
      let b = '';
      cards.forEach(([L, name, when, structure, signals], i) => {
        const x = 14 + (i % 3) * 294, y = 14 + Math.floor(i / 3) * 206, w = 282, h = 194;
        b += box(x, y, w, h, { rx: 8 });
        b += text(x + 16, y + 44, L, { size: 34, weight: 700, fill: C.accent });
        b += text(x + 52, y + 32, name, { size: 12, weight: 700, letterSpacing: '0.08em' });
        b += lines(x + 52, y + 50, wrap(when, 34), { size: 11, fill: C.ink2, lh: 14 });
        b += hline(x + 16, x + w - 16, y + 88, { color: C.soft });
        b += eyebrow(x + 16, y + 106, 'Structure');
        b += lines(x + 16, y + 122, wrap(structure, 36), { size: 10.5, mono: true, fill: C.accent, lh: 14 });
        b += eyebrow(x + 16, y + 160, 'Signal words');
        b += lines(x + 16, y + 175, wrap(signals, 46), { size: 10.5, fill: C.muted, italic: true, lh: 13 });
      });
      b += text(14, 438, 'Universal rules: max 18 words · always embed the real stat · active voice · sound like Bloomberg or The Economist · no jargon', { size: 10.5, fill: C.muted, mono: true });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'auto-card',
    place: { heading: '7. Auto-Analysis Fallback Logic (Conviction 70)', after: 'paragraph', nth: 1 },
    caption: 'How generateFallbackCards assembles a card with no AI: the slot feeds four deterministic builders, and the number-translation helpers turn percentages and Index values into plain English.',
    aria: 'A slot on the left feeding questionBucket, buildTitle, the three observation sentence builders and buildRec, which assemble an auto-analysis card on the right.',
    svg() {
      const id = 'ac'; const W = 900, H = 400;
      let b = '';
      b += node(14, 40, 176, 110, 'Slot', { sub: ['question / sheet name', 'rows sorted by Index desc', 'attr · audiencePct · index'], color: C.muted, mono: true, subSize: 10.5 });
      b += node(14, 214, 176, 120, 'Helpers', { sub: ['pctToWords()', 'indexToWords()', 'cleanAttrText()', '→ plain-English words'], color: C.accent, mono: true, subSize: 10.5 });
      const fx = 262, fw = 264;
      const fns = [
        [18, 58, 'questionBucket()', ['question / sheet name → bucket', 'default: content']],
        [96, 58, 'buildTitle()', ['3 patterns: verb · persona · topic']],
        [174, 74, 'buildS1() · buildS2() · S3', ['S1 highest-index attr · S2 second attr', 'S3 fixed so-what copy per bucket']],
        [268, 58, 'buildRec()', ['attribute signal → platform + format', 'else bucket default']],
      ];
      // spine from slot
      b += arrow(id, [[190, 95], [226, 95], [226, 297], [fx, 297]], { color: 'ink', head: true });
      fns.forEach(([y, h, t, s]) => {
        b += node(fx, y, fw, h, t, { sub: s, color: C.accent, mono: true, subSize: 10.5, titleSize: 12.5 });
        b += arrow(id, [[226, y + h / 2], [fx, y + h / 2]], { color: 'ink' });
      });
      b += arrow(id, [[190, 274], [226, 274], [226, 211], [fx, 211]], { color: 'accent' });
      // card
      const cx = 590, cy = 18, cw = 296, ch = 330;
      b += box(cx, cy, cw, ch, { rx: 8 });
      b += pill(cx + 14, cy + 12, 'bucket', { color: C.culture, size: 10, mono: true });
      b += text(cx + cw - 14, cy + 27, 'conviction 70', { size: 10, anchor: 'end', fill: C.muted, mono: true });
      const reg = (y, label, ls) => eyebrow(cx + 14, y, label, { fill: C.accent }) + lines(cx + 14, y + 16, ls, { size: 11, fill: C.ink2, italic: true, lh: 15 });
      b += reg(cy + 62, 'Title', ['one of three buildTitle patterns']);
      b += reg(cy + 122, 'Observation', ['S1 · punchy fact, highest-index attribute', 'S2 · second attribute confirms the pattern', 'S3 · bucket-specific strategic so-what']);
      b += reg(cy + 196, 'Recommendation', ['platform + format from the attribute', 'signal, or the bucket default']);
      b += hline(cx + 14, cx + cw - 14, cy + 262, { color: C.soft });
      b += text(cx + 14, cy + 284, 'toolLabel: "GWI · Auto-Analysis"', { size: 10.5, fill: C.muted, mono: true });
      b += text(cx + 14, cy + 304, 'zero hallucination risk — every sentence grounded', { size: 10.5, fill: C.muted, italic: true });
      // arrows fns → card regions
      b += arrow(id, [[fx + fw, 47], [cx, 47]], { color: 'muted', label: 'bucket tag', labelDy: -5 });
      b += arrow(id, [[fx + fw, 125], [cx, 92]], { color: 'muted' });
      b += arrow(id, [[fx + fw, 211], [cx, 160]], { color: 'muted' });
      b += arrow(id, [[fx + fw, 297], [cx, 232]], { color: 'muted' });
      b += text(14, 386, 'Runs for both GWI and generic tabular paths — Tier 3 in both cascades', { size: 10.5, fill: C.muted, mono: true });
      return svg(id, W, H, this.aria, b);
    },
  },
];
