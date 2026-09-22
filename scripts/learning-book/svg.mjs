// scripts/learning-book/svg.mjs
// Tiny SVG toolkit used by figures.mjs. Every colour is a CSS custom property
// with a light-theme fallback, so the same markup renders correctly inline in
// the book (which defines dark overrides) and as a standalone .svg file.

export const C = {
  ink: 'var(--fig-ink,#1c1a17)',
  ink2: 'var(--fig-ink2,#4a463f)',
  muted: 'var(--fig-muted,#6b665e)',
  line: 'var(--fig-line,#b8b1a5)',
  soft: 'var(--fig-soft,#e8e3d9)',
  surface: 'var(--fig-surface,#ffffff)',
  fill: 'var(--fig-fill,#f2efe8)',
  accent: 'var(--fig-accent,#3b4fd8)',
  content: 'var(--fig-content,#2a78d6)',
  commerce: 'var(--fig-commerce,#eb6834)',
  communication: 'var(--fig-communication,#1baf7a)',
  culture: 'var(--fig-culture,#4a3aa7)',
  tier1: 'var(--fig-tier1,#1c5cab)',
  tier2: 'var(--fig-tier2,#3987e5)',
  tier3: 'var(--fig-tier3,#86b6ef)',
  warn: 'var(--fig-warn,#d03b3b)',
  ok: 'var(--fig-ok,#0a7a3c)',
};

export const FONT = "var(--fig-font,'IBM Plex Sans',system-ui,sans-serif)";
export const MONO = "var(--fig-mono,'IBM Plex Mono',ui-monospace,Menlo,monospace)";

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Greedy word wrap to roughly `max` characters per line. */
export function wrap(str, max) {
  const words = String(str).split(/\s+/);
  const out = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

/** Approximate rendered width of a string (sans, at `size` px). */
export const tw = (str, size = 12, mono = false) => String(str).length * size * (mono ? 0.62 : 0.55);

export function text(x, y, str, o = {}) {
  const {
    size = 12, anchor = 'start', weight = 400, fill = C.ink, mono = false,
    italic = false, halo = false, letterSpacing = null, opacity = null, baseline = null,
  } = o;
  const attrs = [
    `x="${x}"`, `y="${y}"`, `font-size="${size}"`, `text-anchor="${anchor}"`,
    `font-family="${mono ? MONO : FONT}"`, `font-weight="${weight}"`, `fill="${fill}"`,
  ];
  if (italic) attrs.push('font-style="italic"');
  if (letterSpacing) attrs.push(`letter-spacing="${letterSpacing}"`);
  if (opacity != null) attrs.push(`opacity="${opacity}"`);
  if (baseline) attrs.push(`dominant-baseline="${baseline}"`);
  if (halo) attrs.push(`paint-order="stroke" stroke="${C.surface}" stroke-width="4" stroke-linejoin="round"`);
  return `<text ${attrs.join(' ')}>${esc(str)}</text>`;
}

/** Multi-line text. `arr` is an array of strings; lines stack downward. */
export function lines(x, y, arr, o = {}) {
  const { lh = null, size = 12 } = o;
  const step = lh ?? Math.round(size * 1.35);
  return arr.map((s, i) => text(x, y + i * step, s, o)).join('');
}

export function box(x, y, w, h, o = {}) {
  const { fill = C.surface, stroke = C.line, rx = 6, sw = 1.25, dash = null, opacity = null, fillOpacity = null } = o;
  const attrs = [`x="${x}"`, `y="${y}"`, `width="${w}"`, `height="${h}"`, `rx="${rx}"`, `fill="${fill}"`, `stroke="${stroke}"`, `stroke-width="${sw}"`];
  if (dash) attrs.push(`stroke-dasharray="${dash}"`);
  if (opacity != null) attrs.push(`opacity="${opacity}"`);
  if (fillOpacity != null) attrs.push(`fill-opacity="${fillOpacity}"`);
  return `<rect ${attrs.join(' ')}/>`;
}

/** A tinted box: coloured hairline + the same colour at low opacity as fill. */
export function tint(x, y, w, h, color, o = {}) {
  return box(x, y, w, h, { fill: C.surface, stroke: color, ...o }) +
    box(x, y, w, h, { fill: color, stroke: 'none', fillOpacity: o.alpha ?? 0.10, rx: o.rx ?? 6 });
}

/**
 * Node = box + centred title + optional sub-lines.
 * o.color tints the box; o.sub is an array of strings; o.mono renders sub in mono.
 */
export function node(x, y, w, h, title, o = {}) {
  const { color = null, sub = [], mono = false, titleSize = 13, subSize = 11, weight = 600, align = 'middle', dash = null, titleFill = C.ink, subFill = C.muted, pad = 12 } = o;
  const body = color ? tint(x, y, w, h, color, { dash, rx: o.rx }) : box(x, y, w, h, { dash, rx: o.rx });
  const cx = align === 'middle' ? x + w / 2 : x + pad;
  const total = (title ? 1 : 0) * titleSize * 1.3 + sub.length * subSize * 1.35;
  let ty = y + (h - total) / 2 + titleSize;
  let out = body;
  if (title) { out += text(cx, ty, title, { size: titleSize, weight, anchor: align, fill: titleFill }); ty += titleSize * 0.35 + subSize * 1.05; }
  else ty = y + (h - total) / 2 + subSize;
  out += lines(cx, ty + (title ? 2 : 0), sub, { size: subSize, anchor: align, fill: subFill, mono });
  return out;
}

export function pill(x, y, label, o = {}) {
  const { size = 11, color = C.accent, fill = null, anchor = 'start', mono = false, weight = 500, h = size + 10 } = o;
  const w = tw(label, size, mono) + 16;
  const px = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  return box(px, y, w, h, { fill: fill ?? color, stroke: color, rx: h / 2, fillOpacity: fill ? null : 0.12 }) +
    box(px, y, w, h, { fill: 'none', stroke: color, rx: h / 2 }) +
    text(px + w / 2, y + h / 2 + size * 0.36, label, { size, anchor: 'middle', fill: color, weight, mono });
}

/** Marker defs. Call once per figure with the figure id as prefix. */
export function markers(id) {
  const one = (name, color) =>
    `<marker id="${id}-arr-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
  return `<defs>${one('ink', C.ink)}${one('muted', C.muted)}${one('accent', C.accent)}${one('warn', C.warn)}${one('ok', C.ok)}${one('line', C.line)}</defs>`;
}

/** Straight or elbowed arrow through `pts` [[x,y],...]. */
export function arrow(id, pts, o = {}) {
  const { color = 'ink', dash = null, label = null, labelAt = 0.5, labelDy = -6, labelSize = 11, sw = 1.4, head = true, labelAnchor = 'middle', labelDx = 0, mono = false } = o;
  const colorVal = { ink: C.ink, muted: C.muted, accent: C.accent, warn: C.warn, ok: C.ok, line: C.line }[color] ?? color;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const attrs = [`d="${d}"`, `fill="none"`, `stroke="${colorVal}"`, `stroke-width="${sw}"`, 'stroke-linejoin="round"'];
  if (dash) attrs.push(`stroke-dasharray="${dash}"`);
  if (head) attrs.push(`marker-end="url(#${id}-arr-${color in { ink: 1, muted: 1, accent: 1, warn: 1, ok: 1, line: 1 } ? color : 'ink'})"`);
  let out = `<path ${attrs.join(' ')}/>`;
  if (label) {
    // place at fraction labelAt of total path length
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    let t = labelAt * total, lx = pts[0][0], ly = pts[0][1];
    for (let i = 0; i < seg.length; i++) {
      if (t <= seg[i]) { const f = seg[i] ? t / seg[i] : 0; lx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f; ly = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f; break; }
      t -= seg[i];
    }
    const arr = Array.isArray(label) ? label : [label];
    out += lines(lx + labelDx, ly + labelDy - (arr.length - 1) * labelSize * 1.2, arr, { size: labelSize, anchor: labelAnchor, fill: colorVal === C.ink ? C.ink2 : colorVal, halo: true, mono, weight: 500 });
  }
  return out;
}

export function hline(x1, x2, y, o = {}) {
  const { color = C.line, sw = 1, dash = null } = o;
  return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}
export function vline(x, y1, y2, o = {}) {
  const { color = C.line, sw = 1, dash = null } = o;
  return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
}

/** Small uppercase label used as a section eyebrow inside a figure. */
export const eyebrow = (x, y, s, o = {}) => text(x, y, s.toUpperCase(), { size: 10.5, weight: 600, fill: o.fill ?? C.muted, letterSpacing: '0.08em', anchor: o.anchor ?? 'start', mono: true });

/** Bracket spanning x1..x2 at y, label above. */
export function bracket(x1, x2, y, label, o = {}) {
  const { color = C.muted, size = 11 } = o;
  return `<path d="M${x1},${y + 6} L${x1},${y} L${x2},${y} L${x2},${y + 6}" fill="none" stroke="${color}" stroke-width="1.2"/>` +
    text((x1 + x2) / 2, y - 6, label, { size, anchor: 'middle', fill: color, weight: 600 });
}

/** Wrap body in <svg>. */
export function svg(id, w, h, ariaLabel, body, o = {}) {
  const minW = o.minWidth ?? Math.min(w, 620);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(ariaLabel)}" class="fig-svg" style="min-width:${minW}px" font-family="${FONT}">${markers(id)}${body}</svg>`;
}
