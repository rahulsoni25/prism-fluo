// scripts/learning-book/figures-b.mjs — figures for chapters 7–14 (part B)
import { C, text, lines, box, tint, node, pill, arrow, hline, vline, eyebrow, svg, wrap, tw } from './svg.mjs';

/** Staggered tick labels along a horizontal ruler (4 rows, leader lines). */
function ruler(id, y, x0, x1, min, max, ticks, o = {}) {
  const sx = (v) => x0 + (x1 - x0) * ((v - min) / (max - min));
  const { fmt = (v) => String(v), color = C.accent, labelSize = 10.5 } = o;
  let b = hline(x0, x1, y, { color: C.ink, sw: 1.5 });
  const rows = [-30, 34, -54, 58]; // above, below, above-high, below-low
  ticks.forEach(([v, label], i) => {
    const x = sx(v), dy = rows[i % 4];
    const ly = y + dy;
    let lx = x; const w = tw(label, labelSize);
    lx = Math.max(x0 + w / 2 - 40, Math.min(x1 - w / 2 + 40, lx));
    b += vline(x, y - 5, y + 5, { color: C.ink, sw: 1.5 });
    b += `<line x1="${x}" y1="${dy < 0 ? y - 6 : y + 6}" x2="${lx}" y2="${dy < 0 ? ly + 6 : ly - 12}" stroke="${C.line}" stroke-width="1"/>`;
    b += text(lx, ly, `${fmt(v)}  ${label}`, { size: labelSize, anchor: 'middle', halo: true, fill: color, weight: 500 });
  });
  return b;
}

export const FIGURES_B = [
  {
    id: 'number-scales',
    place: { heading: 'Number Translation Functions', after: 'table', nth: 2 },
    caption: 'The two translation rulers. pctToWords maps an audience percentage to a fraction phrase; indexToWords maps a GWI Index to a multiplier phrase. Each label applies from its threshold up to the next one.',
    aria: 'Two horizontal rulers with labelled thresholds: audience percent to fraction words, and GWI index to multiplier words.',
    svg() {
      const id = 'ns'; const W = 900, H = 440;
      let b = eyebrow(20, 24, 'pctToWords(pct) — audience % → plain English');
      const pctTicks = [[10, 'about 1 in 10'], [13, 'roughly 1 in 7'], [16, 'roughly 1 in 6'], [20, 'about 1 in 5'], [25, 'about 1 in 4'], [33, 'about 1 in 3'], [40, 'about 2 in 5'], [48, 'nearly 1 in 2'], [55, 'more than half'], [60, 'more than 3 in 5'], [70, 'about 7 in 10'], [80, 'more than 4 in 5']];
      const y1 = 110, x0 = 60, x1 = 840;
      b += box(x0, y1 - 8, (x1 - x0) * 0.1, 16, { fill: C.muted, stroke: 'none', fillOpacity: 0.15, rx: 2 });
      b += text(x0 - 30, y1 + 98, 'below 10% → raw pct%', { size: 10, fill: C.muted, italic: true });
      b += ruler(id, y1, x0, x1, 0, 100, pctTicks, { fmt: (v) => `≥${v}%` });
      b += text(x0, y1 + 82, '0%', { size: 10, fill: C.muted, mono: true, anchor: 'middle' });
      b += text(x1, y1 + 82, '100%', { size: 10, fill: C.muted, mono: true, anchor: 'middle' });
      b += hline(20, 880, 226, { color: C.soft });
      b += eyebrow(20, 252, 'indexToWords(index) — GWI Index → multiplier');
      const idxTicks = [[110, 'around N% more likely than'], [130, 'about N% more likely than'], [150, 'one and a half times more likely than'], [175, 'nearly twice as likely as'], [200, 'twice as likely as'], [250, 'more than twice as likely as'], [300, 'more than three times as likely as'], [400, 'nearly N times more likely than']];
      const y2 = 338;
      b += box(x0, y2 - 8, (x1 - x0) * (10 / 320), 16, { fill: C.muted, stroke: 'none', fillOpacity: 0.15, rx: 2 });
      b += text(x0 - 30, y2 + 98, 'below 110 → slightly more likely than', { size: 10, fill: C.muted, italic: true });
      b += ruler(id, y2, x0, x1, 100, 420, idxTicks, { fmt: (v) => `≥${v}` });
      b += text(x0, y2 + 82, 'Index 100', { size: 10, fill: C.muted, mono: true, anchor: 'middle' });
      b += text(x1, y2 + 82, '400+', { size: 10, fill: C.muted, mono: true, anchor: 'middle' });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'tool-detection',
    place: { heading: 'Tool Detection', after: 'code' },
    caption: 'Route detection order. The checks run top to bottom on the first filename and the column keys; the first match wins and anything unmatched is treated as generic TABULAR data.',
    aria: 'A vertical chain of seven detection checks, each with a yes arrow to a route name and a no arrow to the next check, ending in the TABULAR default.',
    svg() {
      const id = 'td'; const W = 900, H = 500;
      let b = node(14, 14, 464, 46, 'fileNames[0] + column keys', { color: C.ink, mono: false, titleSize: 13 });
      const checks = [
        [['columns have sentiment AND (mediatype / platform / message)', 'OR filename matches sentiment|shareofvoice|social.listening|brandwatch|konnect'], 'SOCIAL_LISTENING', C.accent],
        [['filename includes keyword'], 'KEYWORD_PLANNER', C.accent],
        [['filename includes amazon'], 'AMAZON', C.accent],
        [['filename includes helium'], 'HELIUM10', C.accent],
        [['filename includes flipkart'], 'FLIPKART', C.accent],
        [['filename includes meesho'], 'MEESHO', C.accent],
        [['nothing above matched'], 'TABULAR (default)', C.muted],
      ];
      const x = 14, w = 464, h = 44;
      checks.forEach(([cond, route, color], i) => {
        const y = 82 + i * 58;
        b += box(x, y, w, h, { fill: C.fill, stroke: C.line, rx: 6 });
        b += lines(x + 14, y + (cond.length === 1 ? 27 : 19), cond, { size: 10.5, mono: true, lh: 14, fill: C.ink });
        const fromY = i === 0 ? 60 : y - 58 + h;
        b += arrow(id, [[x + 40, fromY], [x + 40, y]], i === 0 ? { color: 'ink' } : { color: 'muted', label: 'no', labelAnchor: 'start', labelDx: 8, labelDy: 4 });
        b += arrow(id, [[x + w, y + h / 2], [x + w + 70, y + h / 2]], { color: color === C.muted ? 'muted' : 'accent', label: i === 6 ? 'default' : 'yes', labelDy: -5 });
        b += pill(x + w + 76, y + h / 2 - 11, route, { color, size: 11.5, mono: true, weight: 600 });
      });
      b += text(14, 490, 'first match wins — checked in this order', { size: 10.5, fill: C.muted, mono: true });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'stratified',
    place: { heading: 'Stratified Sampling (Generic Tabular)', after: 'code' },
    caption: 'What Gemini sees for a large table. A head-only sample would miss anything that lives later in the file; the stratified sample spaces its 120 rows evenly from the first row to the last.',
    aria: 'Two bars representing a dataset: the first shaded only at the head, the second with evenly spaced tick marks from head to tail.',
    svg() {
      const id = 'st'; const W = 900, H = 236;
      const x0 = 200, x1 = 860;
      let b = eyebrow(14, 52, 'First 120 rows');
      b += text(14, 70, 'not what PRISM does', { size: 10.5, fill: C.muted, italic: true });
      b += box(x0, 40, x1 - x0, 30, { fill: C.fill, stroke: C.line, rx: 4 });
      b += box(x0, 40, (x1 - x0) * 0.14, 30, { fill: C.warn, stroke: C.warn, fillOpacity: 0.18, rx: 4 });
      b += text(x0 + (x1 - x0) * 0.14 + 10, 59, 'the tail is never seen — e.g. sorted-by-date exports', { size: 10.5, fill: C.warn, italic: true });
      b += eyebrow(14, 132, 'Stratified sample');
      b += text(14, 150, 'what Gemini sees · n = 120', { size: 10.5, fill: C.muted, italic: true });
      b += box(x0, 120, x1 - x0, 30, { fill: C.fill, stroke: C.line, rx: 4 });
      const n = 30;
      for (let i = 0; i < n; i++) {
        const x = x0 + (x1 - x0) * (i / (n - 1));
        b += vline(x, 124, 146, { color: C.accent, sw: 2 });
      }
      b += text(x0, 168, 'row 1', { size: 10, fill: C.muted, mono: true, anchor: 'middle' });
      b += text(x1, 168, 'row N', { size: 10, fill: C.muted, mono: true, anchor: 'middle' });
      b += text((x0 + x1) / 2, 168, 'head · middle · tail all represented', { size: 10.5, fill: C.accent, anchor: 'middle', weight: 600 });
      b += hline(14, 886, 190, { color: C.soft });
      b += text(14, 214, 'step = (rows.length − 1) / (n − 1)     output = rows[round(i × step)]  for i in 0..n−1', { size: 11, mono: true, fill: C.ink2 });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'chart-priority',
    place: { heading: 'Chart Generation Priority', after: 'list' },
    caption: 'Chart generation priority in the rule-based engine, top first. Hard-coded GWI and keyword charts come before the generic statistical charts.',
    aria: 'A descending staircase of nine numbered chart generators with the chart type each produces.',
    svg() {
      const id = 'cp'; const W = 900, H = 400;
      const rows = [
        ['GWI heatmap — if isGWISheet() → gwi_index_heatmap', 'hbar'],
        ['Keyword tiers — domain Search & SEO AND tier column → keyword_tiers', 'pie'],
        ['Brand share — domain Search & SEO AND brand column → brand_share', 'hbar'],
        ['Time series — first 2 numeric columns, growth / decline title patterns', 'line · area'],
        ['Categorical dominance — first 3 categorical columns, HHI + top share', 'pie · bar · hbar'],
        ['Correlation scatter — Pearson r; conviction r > 0.5 ? 92 : 76', 'scatter'],
        ['Bubble 3-way — 3 numeric columns → convergence zone analysis', 'bubble'],
        ['Radar benchmark — ≥3 numeric + categorical with 2–10 unique values', 'radar'],
        ['Cross-categorical — top 2 categorical × first numeric, top 12 combos', 'cross_cat'],
      ];
      let b = '';
      rows.forEach(([label, chart], i) => {
        const y = 16 + i * 40, x = 40 + i * 14, w = 600;
        b += box(x, y, w, 32, { fill: i < 3 ? C.accent : C.surface, stroke: i < 3 ? C.accent : C.line, fillOpacity: i < 3 ? 0.08 : null, rx: 5 });
        b += `<circle cx="${x + 18}" cy="${y + 16}" r="11" fill="${i < 3 ? C.accent : C.muted}"/>`;
        b += text(x + 18, y + 20, String(i + 1), { size: 11, anchor: 'middle', fill: C.surface, weight: 700, mono: true });
        b += text(x + 38, y + 20, label, { size: 11, fill: C.ink });
        b += pill(x + w + 14, y + 5, chart, { size: 10.5, mono: true, color: i < 3 ? C.accent : C.muted });
      });
      b += text(8, 12, 'priority ↓', { size: 10, fill: C.muted, mono: true });
      b += arrow(id, [[20, 20], [20, 370]], { color: 'muted' });
      b += text(20, 392, 'first three are hard-coded (conviction 99 / 98 / 96)', { size: 10.5, fill: C.muted, mono: true });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'openrouter',
    place: { heading: 'Model Cascade (verified May 2026, all free tier)', after: 'code' },
    caption: 'The OpenRouter fallback. Batches of eight slots run one after another to stay inside free-tier rate limits; inside each batch the seven models are tried in order and the cascade stops at the first success. Conviction is hard-coded to 82.',
    aria: 'Three sequential batches on the left; on the right a seven-model ladder where each failure drops to the next model and any success exits to cards with conviction 82.',
    svg() {
      const id = 'or'; const W = 900, H = 470;
      let b = eyebrow(14, 26, 'Batches of 8 slots — sequential');
      [0, 1, 2].forEach((i) => {
        const y = 44 + i * 96;
        b += node(14, y, 230, 56, `Batch ${i + 1} · 8 slots`, { color: C.tier2, sub: ['same prompt as Gemini'], subSize: 10.5, mono: true });
        if (i < 2) b += arrow(id, [[129, y + 56], [129, y + 96]], { color: 'muted', label: 'waits for previous', labelAnchor: 'start', labelDx: 8, labelDy: 4, labelSize: 10.5 });
      });
      b += text(14, 356, 'not parallel — free-tier RPM caps', { size: 10.5, fill: C.muted, italic: true });
      b += arrow(id, [[244, 72], [330, 72]], { color: 'ink', label: 'for each batch', labelDy: -6 });
      b += eyebrow(330, 26, 'Model cascade — first success wins');
      const models = ['openai/gpt-oss-120b:free', 'nousresearch/hermes-3-llama-3.1-405b:free', 'meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-super-120b-a12b:free', 'openai/gpt-oss-20b:free', 'meta-llama/llama-3.2-3b-instruct:free'];
      const notes = ['best quality', '', '', '', '', 'lighter fallback', 'last resort'];
      const mx = 330, mw = 390, mh = 36;
      models.forEach((m, i) => {
        const y = 44 + i * 52;
        b += box(mx, y, mw, mh, { fill: C.fill, stroke: C.line, rx: 5 });
        b += `<circle cx="${mx + 18}" cy="${y + 18}" r="10" fill="${C.tier2}"/>`;
        b += text(mx + 18, y + 22, String(i + 1), { size: 11, anchor: 'middle', fill: C.surface, weight: 700, mono: true });
        b += text(mx + 36, y + 22, m, { size: 11, mono: true });
        if (notes[i]) b += text(mx + mw - 10, y + 22, notes[i], { size: 10, anchor: 'end', fill: C.muted, italic: true });
        if (i < 6) b += arrow(id, [[mx + 18, y + mh], [mx + 18, y + 52]], { color: 'muted', label: 'fails', labelAnchor: 'start', labelDx: 6, labelDy: 4, labelSize: 10 });
        b += arrow(id, [[mx + mw, y + mh / 2], [780, y + mh / 2]], { color: 'ok', head: false });
      });
      b += vline(780, 62, 396, { color: C.ok, sw: 1.6 });
      b += text(786, 230, 'success', { size: 10.5, fill: C.ok, weight: 600 });
      b += arrow(id, [[780, 396], [780, 410]], { color: 'ok' });
      b += node(660, 412, 226, 46, 'cards · conviction 82', { sub: ['toolLabel + " · OpenRouter"'], color: C.ok, subSize: 10.5, mono: true, titleSize: 12.5 });
      b += pill(330, 418, 'temperature 0.65 · max_tokens 3500', { color: C.muted, size: 10.5, mono: true });
      b += text(14, 456, 'all 7 fail for every batch → Tier 3 Auto-Analysis', { size: 10.5, fill: C.muted, mono: true });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'sla',
    place: { heading: 'Formula (`lib/sla.ts`)', after: 'table' },
    caption: 'SLA hours against the number of active briefs. The formula adds half an hour per active brief to a 4-hour base and caps the increment at 2 hours, so the promise never exceeds 6 hours.',
    aria: 'Column chart of SLA hours for zero to four-plus active briefs: 4, 5, 5, 6 and 6 hours, with a dashed cap line at 6 hours.',
    svg() {
      const id = 'sla'; const W = 900, H = 330;
      const px0 = 90, px1 = 840, py0 = 40, py1 = 250;
      const yv = (h) => py1 - (py1 - py0) * (h / 7);
      const cats = [['0', 4], ['1', 5], ['2', 5], ['3', 6], ['4+', 6]];
      let b = '';
      for (let h = 0; h <= 7; h++) {
        b += hline(px0, px1, yv(h), { color: h === 0 ? C.line : C.soft, sw: h === 0 ? 1.2 : 1 });
        b += text(px0 - 10, yv(h) + 4, `${h}h`, { size: 10.5, anchor: 'end', fill: C.muted, mono: true });
      }
      const slot = (px1 - px0) / cats.length, bw = 64;
      cats.forEach(([label, v], i) => {
        const cx = px0 + slot * (i + 0.5), x = cx - bw / 2, top = yv(v), bottom = yv(0);
        const r = 4;
        b += `<path d="M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${bottom} Z" fill="${C.accent}" fill-opacity="0.85"/>`;
        b += text(cx, top - 8, `${v}h`, { size: 12, anchor: 'middle', weight: 600 });
        b += text(cx, py1 + 20, label, { size: 11.5, anchor: 'middle', mono: true });
      });
      b += hline(px0, px1, yv(6), { color: C.warn, sw: 1.4, dash: '6 4' });
      b += text(px0 + 8, yv(6) - 7, 'cap: maximum 6h — never exceeds', { size: 10.5, anchor: 'start', fill: C.warn, weight: 600, halo: true });
      b += text((px0 + px1) / 2, py1 + 40, 'N = currently active briefs (status waiting_for_data or processing)', { size: 10.5, anchor: 'middle', fill: C.muted });
      b += text(px0 - 10, py0 - 14, 'SLA (hours)', { size: 10.5, anchor: 'end', fill: C.muted });
      b += text(px0, 310, 'sla_hours = ceil(4 + min(2, N × 0.5))   ·   sla_due_at = now + sla_hours', { size: 11.5, mono: true, fill: C.ink2 });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'smoke-test',
    place: { heading: 'Why No Smoke Test for Gemini Models', after: 'paragraph', nth: 2 },
    caption: 'Why the model probe was removed. Probing three candidates per batch multiplies the API calls before any real work starts and exhausts the free-tier quota; picking the first non-blacklisted candidate immediately spends the quota on real calls, and a bad model is blacklisted when it actually fails.',
    aria: 'Side-by-side comparison of four batches each probing three candidates versus four batches calling one model directly, with a 15 requests-per-minute quota meter under each.',
    svg() {
      const id = 'sm'; const W = 900, H = 344;
      const panelW = 426;
      const draw = (x, title, probes, note, calls, quotaColor, verdict) => {
        let b = box(x, 14, panelW, 300, { rx: 8 });
        b += text(x + 16, 40, title, { size: 13, weight: 700 });
        for (let r = 0; r < 4; r++) {
          const y = 66 + r * 30;
          b += text(x + 16, y + 4, `batch ${r + 1}`, { size: 10.5, mono: true, fill: C.muted });
          for (let p = 0; p < probes; p++) b += `<circle cx="${x + 90 + p * 22}" cy="${y}" r="7" fill="none" stroke="${C.muted}" stroke-width="1.5" stroke-dasharray="2 2"/>`;
          b += `<circle cx="${x + 90 + probes * 22}" cy="${y}" r="7" fill="${C.accent}"/>`;
        }
        b += text(x + 16, 194, note, { size: 10.5, fill: C.ink2 });
        // quota meter
        b += eyebrow(x + 16, 224, `free tier: 15 RPM · ${calls} calls`);
        const mw = panelW - 32, per = mw / 16;
        b += box(x + 16, 232, mw, 18, { fill: C.fill, stroke: C.line, rx: 3 });
        for (let i = 0; i < Math.min(calls, 16); i++) {
          b += `<rect x="${x + 16 + i * per + 1}" y="234" width="${per - 2}" height="14" rx="2" fill="${i < 15 ? quotaColor : C.warn}"/>`;
        }
        b += vline(x + 16 + 15 * per, 228, 254, { color: C.warn, sw: 1.5 });
        b += text(x + 16 + 15 * per, 266, '15', { size: 10, anchor: 'middle', fill: C.warn, mono: true });
        b += text(x + 16, 296, verdict, { size: 11, weight: 600, fill: quotaColor === C.warn ? C.warn : C.ok });
        return b;
      };
      let b = draw(14, 'With a smoke test (rejected)', 3, '4 batches × 3 candidates = 12 probe calls before real work', 16, C.warn, 'quota exhausted instantly → ALL batches fail');
      b += draw(460, 'No smoke test (current)', 0, 'first non-blacklisted candidate, immediately', 4, C.accent, 'real 404s / empty responses blacklist the model; cascade advances');
      b += text(14, 334, '○ probe call   ● real call', { size: 10, fill: C.muted, mono: true, anchor: 'start' });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'allsettled',
    place: { heading: 'Why `Promise.allSettled` Instead of `Promise.all`', after: 'paragraph', nth: 1 },
    caption: 'One failing batch under each combinator. Promise.all rejects as soon as any batch fails, so nothing is kept; Promise.allSettled waits for all three and keeps the cards from the batches that succeeded.',
    aria: 'Three batches, one failed, feeding Promise.all which rejects with zero cards, versus Promise.allSettled which returns cards from the two successful batches.',
    svg() {
      const id = 'as'; const W = 900, H = 260;
      const panel = (x, title, out, outColor, kept) => {
        let b = box(x, 14, 426, 230, { rx: 8 });
        b += text(x + 16, 40, title, { size: 13, weight: 700, mono: true });
        const batches = [['Batch 1', 'ok', C.ok], ['Batch 2', 'fails', C.warn], ['Batch 3', 'ok', C.ok]];
        batches.forEach(([n, s, c], i) => {
          const y = 62 + i * 48;
          b += tint(x + 16, y, 120, 34, c, { alpha: 0.12 });
          b += text(x + 76, y + 21, `${n} · ${s}`, { size: 11, anchor: 'middle', fill: c, weight: 600 });
          const alive = kept ? s === 'ok' : false;
          b += arrow(id, [[x + 136, y + 17], [x + 200, y + 17], [x + 200, 128], [x + 230, 128]], { color: alive ? 'ok' : (s === 'fails' ? 'warn' : 'muted'), head: i === 1, dash: !kept && s === 'ok' ? '4 3' : null });
        });
        b += node(x + 230, 100, 180, 56, out[0], { sub: out.slice(1), color: outColor, subSize: 10.5 });
        return b;
      };
      let b = panel(14, 'Promise.all', ['rejects on first failure', 'one bad batch kills all results'], C.warn, false);
      b += panel(460, 'Promise.allSettled', ['collects every result', 'cards from the other two batches'], C.ok, true);
      b += text(24, 232, 'dashed = result discarded', { size: 10, fill: C.muted, mono: true });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'files-map',
    place: { heading: '13. Key Files Map', after: 'table' },
    caption: 'Where the key files sit. The upload page triggers the analysis route, which detects the data type and drives the Gemini and OpenRouter clients; the rule engine and SLA helpers serve the pages directly; the middleware gates every route.',
    aria: 'Four layered bands, UI, API routes, engines and data, with the main files placed in each and arrows for the analysis path.',
    svg() {
      const id = 'fm'; const W = 900, H = 456;
      const bands = [
        [16, 78, 'UI · pages & components', C.culture],
        [116, 92, 'API routes · app/api', C.accent],
        [230, 118, 'Engines · lib/', C.tier1],
        [370, 70, 'Data & auth', C.muted],
      ];
      let b = '';
      bands.forEach(([y, h, label, color]) => {
        b += box(14, y, 872, h, { fill: color, stroke: color, fillOpacity: 0.05, rx: 8 });
        b += eyebrow(28, y + 18, label, { fill: color });
      });
      const place = (name, x, y, color = C.ink) => pill(x, y, name, { color, size: 10.5, mono: true, weight: 500 });
      b += place('app/upload/page.tsx', 28, 42, C.culture);
      b += place('app/dashboard/page.js', 210, 42, C.culture);
      b += place('app/insights/page.js', 400, 42, C.culture);
      b += place('app/admin/pages/page.tsx', 580, 42, C.culture);
      b += place('components/BriefCard.js', 210, 66, C.culture);
      b += place('components/TrendPanel.jsx', 400, 66, C.culture);
      b += place('app/api/ai/analyze-data/route.ts', 28, 142, C.accent);
      b += place('app/api/dashboard/overview/route.ts', 300, 142, C.accent);
      b += place('app/api/briefs/[id]/route.js', 300, 170, C.accent);
      b += place('app/api/admin/pages/[id]/route.ts', 560, 142, C.accent);
      b += place('app/api/migrate/route.ts', 560, 170, C.accent);
      b += place('lib/ai/gemini.ts', 28, 256, C.tier1);
      b += place('lib/ai/openrouter.ts', 170, 256, C.tier1);
      b += place('lib/gwi.ts', 340, 256, C.tier1);
      b += place('lib/social/parser.ts', 440, 256, C.tier1);
      b += place('lib/inference.ts', 28, 296, C.tier1);
      b += place('lib/sla.ts', 170, 296, C.tier1);
      b += place('lib/keywords.ts', 300, 296, C.tier1);
      b += text(28, 338, 'Rule engine — schema, charts, scorecards, anomalies, strategic brief · SLA — formula + badge', { size: 10.5, fill: C.muted, italic: true });
      b += place('middleware.ts', 28, 396, C.muted);
      b += text(28, 432, 'auth gates · public route list', { size: 10.5, fill: C.muted, italic: true });
      b += place('lib/db/schema.sql', 596, 396, C.muted);
      b += text(596, 432, 'idempotent ALTER statements', { size: 10.5, fill: C.muted, italic: true });
      // arrows
      b += arrow(id, [[80, 63], [80, 142]], { color: 'accent', label: 'analysis trigger', labelAnchor: 'start', labelDx: 8, labelDy: 4 });
      b += arrow(id, [[60, 163], [60, 256]], { color: 'accent', label: 'Tier 1', labelAnchor: 'start', labelDx: 8, labelDy: 4 });
      b += arrow(id, [[150, 163], [200, 256]], { color: 'accent', label: 'Tier 2', labelAnchor: 'start', labelDx: 10, labelDy: 0 });
      b += arrow(id, [[240, 163], [370, 256]], { color: 'accent', label: 'detect', labelAnchor: 'start', labelDx: 10, labelDy: 0 });
      b += arrow(id, [[660, 191], [660, 396]], { color: 'muted', label: 'creates tables', labelAnchor: 'start', labelDx: 8, labelDy: 4, labelAt: 0.5 });
      return svg(id, W, H, this.aria, b);
    },
  },
  {
    id: 'conviction',
    place: { heading: '14. Conviction Score System', after: 'table' },
    caption: 'Every conviction score on one scale, coloured by where the card came from. Gemini and OpenRouter sit close together at 90 and 82; only Auto-Analysis at 70 is noticeably different.',
    aria: 'A vertical scale from 65 to 100 with a dot for each conviction score, each connected to a label naming its source, coloured by source class.',
    svg() {
      const id = 'cv'; const W = 900, H = 500;
      const items = [
        [99, 'Hard-coded GWI heatmap (known exact formula)', 'PRISM GWI Engine', 'hard'],
        [98, 'Hard-coded keyword tiers', 'PRISM Keyword Engine', 'hard'],
        [96, 'Hard-coded brand share', 'PRISM Keyword Engine', 'hard'],
        [94, 'Rule engine: time series', 'PRISM Storyteller · Performance Logic', 'rule'],
        [93, 'Rule engine: categorical dominance', 'PRISM Storyteller · Multi-Segment Engine', 'rule'],
        [92, 'Rule engine: correlation (r > 0.5)', 'PRISM Storyteller · Dynamic Correlation', 'rule'],
        [90, 'Gemini: GWI slot analysis', 'GWI', 'gemini'],
        [90, 'Rule engine: radar benchmark', 'PRISM Storyteller · Benchmark Logic', 'rule'],
        [88, 'Gemini: generic tabular / social', 'varies', 'gemini'],
        [85, 'Gemini: PDF text analysis', 'filename', 'gemini'],
        [82, 'OpenRouter (honest tier)', 'GWI · OpenRouter', 'openrouter'],
        [76, 'Rule engine: weak correlation (r ≤ 0.5)', '—', 'rule'],
        [70, 'Auto-Analysis (pure data, no AI)', 'GWI · Auto-Analysis', 'auto'],
      ];
      const cls = { hard: ['Hard-coded', C.ink], rule: ['Rule engine', C.culture], gemini: ['Gemini', C.content], openrouter: ['OpenRouter', C.commerce], auto: ['Auto-Analysis', C.communication] };
      const ax = 110, y0 = 60, y1 = 470, sy = (v) => y1 - (y1 - y0) * ((v - 65) / 35);
      let b = '';
      // legend
      let lx = 300;
      Object.values(cls).forEach(([name, color]) => { b += `<circle cx="${lx}" cy="24" r="6" fill="${color}"/>`; b += text(lx + 12, 28, name, { size: 11, fill: C.ink2 }); lx += tw(name, 11) + 40; });
      b += text(14, 28, 'source', { size: 10.5, fill: C.muted, mono: true, letterSpacing: '0.08em' });
      // axis
      b += vline(ax, y0 - 6, y1 + 6, { color: C.line, sw: 1.2 });
      [70, 75, 80, 85, 90, 95, 100].forEach((v) => { b += hline(ax - 5, ax, sy(v), { color: C.line }); b += text(ax - 10, sy(v) + 4, String(v), { size: 10.5, anchor: 'end', fill: C.muted, mono: true }); });
      b += text(ax - 10, y0 - 16, 'conviction', { size: 10.5, anchor: 'end', fill: C.muted, mono: true });
      // dots + leaders + labels
      const rowH = (y1 - y0) / (items.length - 1);
      let prev = null;
      items.forEach(([score, source, label, k], i) => {
        const [, color] = cls[k];
        const dy = sy(score), ly = y0 + i * rowH;
        const dx = prev === score ? ax + 16 : ax;
        prev = score;
        b += `<line x1="${dx + 8}" y1="${dy}" x2="${250}" y2="${ly}" stroke="${C.line}" stroke-width="1"/>`;
        b += `<circle cx="${dx}" cy="${dy}" r="7" fill="${color}" stroke="${C.surface}" stroke-width="2"/>`;
        b += text(262, ly + 4, String(score), { size: 12.5, weight: 700, mono: true, fill: color });
        b += text(296, ly + 4, source, { size: 11.5 });
        b += text(886, ly + 4, label, { size: 10.5, anchor: 'end', fill: C.muted, mono: true });
      });
      return svg(id, W, H, this.aria, b);
    },
  },
];
