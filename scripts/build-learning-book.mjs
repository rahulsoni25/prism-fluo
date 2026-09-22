#!/usr/bin/env node
/**
 * scripts/build-learning-book.mjs
 *
 * Renders PRISM_LEARNING.md as an illustrated, book-style HTML document.
 *
 *   node scripts/build-learning-book.mjs                 → docs/book/PRISM_LEARNING_BOOK.html + docs/book/figures/*.svg
 *   node scripts/build-learning-book.mjs --pdf out.pdf   → also prints an A4 PDF via headless Chromium (needs playwright-core)
 *   node scripts/build-learning-book.mjs --artifact f.html → also writes a body-only fragment (for claude.ai artifacts)
 *   node scripts/build-learning-book.mjs --check         → build in memory and only run the verbatim check
 *
 * The notes stay the single source of truth: the text is NEVER edited here.
 * Figures are injected as separate <figure> blocks at fixed anchor points,
 * and a verbatim check asserts that every line of the markdown is present in
 * the rendered output before anything is written.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { FIGURES, coverArt } from './learning-book/figures.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'PRISM_LEARNING.md');
const OUT_DIR = path.join(ROOT, 'docs', 'book');
const OUT_HTML = path.join(OUT_DIR, 'PRISM_LEARNING_BOOK.html');
const FIG_DIR = path.join(OUT_DIR, 'figures');
const CSS = fs.readFileSync(path.join(ROOT, 'scripts', 'learning-book', 'book.css'), 'utf8');

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };
const wantPdf = flag('--pdf');
const wantArtifact = flag('--artifact');
const checkOnly = args.includes('--check');

const TITLE = 'PRISM Learning Book';
const FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap';

// ---------------------------------------------------------------------------
// Markdown → HTML (GitHub-style heading ids so the notes' own TOC links work)
// ---------------------------------------------------------------------------
const mdRaw = fs.readFileSync(SRC, 'utf8');
// A list item that starts with ">" (e.g. "- >5 segments") would otherwise be parsed as a nested
// blockquote and lose its ">" on screen. Escaping it renders the notes' literal text; the source file is untouched.
const md = mdRaw.replace(/^(\s*(?:[-*+]|\d+\.)\s+)>(?=\S)/gm, '$1\\>');
const marked = new Marked({ gfm: true });
const seenSlugs = new Map();
function slugify(raw) {
  const s = raw.replace(/`/g, '').toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
  const n = seenSlugs.get(s) ?? 0; seenSlugs.set(s, n + 1);
  return n ? `${s}-${n}` : s;
}
marked.use({
  renderer: {
    heading({ tokens, depth, text }) {
      const id = slugify(text);
      return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
    },
  },
});
const tokens = marked.lexer(md);
const render = (tok) => marked.parser([tok])
  // every table (top-level or nested in a list item) scrolls inside its own container on narrow screens
  .replace(/<table>/g, '<div class="table-scroll"><table>').replace(/<\/table>/g, '</table></div>');

// ---------------------------------------------------------------------------
// Walk tokens: cover → contents → chapters, injecting figures at anchors
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const placed = new Set();
let out = '';
let mode = 'cover';           // cover | contents | body
let coverHtml = '', contentsHtml = '';
let chapterOpen = false, chapter = 0, figInChapter = 0;
let curHeading = null; const typeCounts = {};
const figureHtml = (f) => {
  figInChapter += 1;
  const num = `Figure ${chapter}.${figInChapter}`;
  return `<figure class="fig" id="fig-${f.id}"><div class="fig-scroll">${f.svg()}</div><figcaption><span class="fig-num">${num}</span>${esc(f.caption)}</figcaption></figure>\n`;
};
const figuresAfter = (type) => {
  typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  let html = '';
  for (const f of FIGURES) {
    const p = f.place;
    if (placed.has(f.id) || p.heading !== curHeading) continue;
    if (p.after === type && (p.nth ?? 1) === typeCounts[type]) { html += figureHtml(f); placed.add(f.id); }
  }
  return html;
};

const body = tokens.filter((t) => t.type !== 'space');
body.forEach((tok, i) => {
  const last = i === body.length - 1;
  if (tok.type === 'heading') {
    if (tok.depth === 1) { coverHtml += render(tok); return; }
    if (tok.depth === 2 && /^table of contents$/i.test(tok.text)) { mode = 'contents'; contentsHtml += render(tok); return; }
    const m = tok.depth === 2 && tok.text.match(/^(\d+)\.\s/);
    if (m) {
      if (chapterOpen) out += '</div></section>\n';
      mode = 'body'; chapter = Number(m[1]); figInChapter = 0; chapterOpen = true;
      out += `<section class="chapter" id="chapter-${chapter}" aria-labelledby="${slugPeek(tok.text)}"><p class="chapter-eyebrow">Chapter ${chapter}</p><div class="prose">\n`;
    }
    curHeading = tok.text; Object.keys(typeCounts).forEach((k) => delete typeCounts[k]);
    out += render(tok);
    out += figuresAfter('heading');
    return;
  }
  if (mode === 'cover') { if (tok.type === 'hr') return; coverHtml += render(tok); return; }
  if (mode === 'contents') { if (tok.type === 'hr') return; contentsHtml += render(tok); return; }
  if (last && tok.type === 'paragraph') { out += `<div class="colophon">${render(tok)}</div>\n`; return; }
  out += render(tok);
  out += figuresAfter(tok.type);
});
if (chapterOpen) out += '</div></section>\n';
function slugPeek(text) { return text.replace(/`/g, '').toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-'); }

const missing = FIGURES.filter((f) => !placed.has(f.id)).map((f) => f.id);
if (missing.length) { console.error(`✗ figures without an anchor in PRISM_LEARNING.md: ${missing.join(', ')}`); process.exit(1); }

const cover = `<header class="cover">
  <div class="cover-text"><p class="cover-kicker">PRISM Intelligence · Reference Edition</p>${coverHtml}</div>
  <div class="cover-art">${coverArt()}</div>
  <div class="cover-meta"><span><b>Source</b> PRISM_LEARNING.md (rendered verbatim)</span><span><b>Chapters</b> ${chapter}</span><span><b>Figures</b> ${FIGURES.length}</span></div>
</header>\n`;
const contents = `<nav class="contents" aria-label="Table of contents">${contentsHtml}</nav>\n`;
const main = `<main class="book">\n${cover}${contents}${out}</main>`;

const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${TITLE}</title>
<meta name="description" content="PRISM Intelligence — the complete learning and reference notes, typeset as an illustrated book.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="${FONTS}" rel="stylesheet">
<style>\n${CSS}\n</style>`;
const fullHtml = `<!doctype html>\n<html lang="en">\n<head>\n${head}\n</head>\n<body>\n${main}\n</body>\n</html>\n`;
const fragment = `${head}\n${main}\n`;

// ---------------------------------------------------------------------------
// Verbatim check: every text line of the markdown must appear in the output
// ---------------------------------------------------------------------------
function decode(s) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"); }
const squash = (s) => s.replace(/\s+/g, '');           // whitespace-insensitive comparison
const bookText = squash(decode(
  fullHtml.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<figcaption[\s\S]*?<\/figcaption>/g, ' ').replace(/<[^>]+>/g, ' '),
));
function lineText(line, inFence) {
  if (inFence) return squash(line);
  let s = line;
  if (/^\s*-{3,}\s*$/.test(s)) return '';
  const tableRow = /^\s*\|/.test(s);
  if (tableRow && /^\s*\|?\s*:?-{2,}/.test(s)) return '';               // table separator row
  s = s.replace(/^\s*>\s?/, '').replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*(?:[-*+]|\d+\.)\s+/, '');
  s = s.replace(/\\\|/g, '\u0001');                                     // escaped pipe inside a cell = literal "|"
  s = s.replace(/`([^`]*)`/g, (_, code) => code.replace(/\*/g, '\u0003')); // code spans are literal: protect their asterisks
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\*\*/g, '').replace(/\*([^*\n]+)\*/g, '$1');
  if (tableRow) s = s.replace(/\|/g, ' ');
  s = s.replace(/\u0001/g, '|').replace(/\u0003/g, '*');
  return squash(s);
}
let inFence = false; const failures = [];
mdRaw.split('\n').forEach((line, idx) => {
  if (/^\s*```/.test(line)) { inFence = !inFence; return; }
  const t = lineText(line, inFence);
  if (!t) return;
  if (!bookText.includes(t)) failures.push(`${idx + 1}: ${line.slice(0, 100)}`);
});
const count = (re, s) => (s.match(re) || []).length;
const kids = (t) => { const k = []; for (const v of [t.tokens, t.items, t.header, t.rows]) if (Array.isArray(v)) for (const c of v.flat(2)) if (c && typeof c === 'object' && c.type) k.push(c); return k; };
const countTokens = (type, list = tokens) => list.reduce((n, t) => n + (t.type === type ? 1 : 0) + countTokens(type, kids(t)), 0);
const structural = [
  ['headings', countTokens('heading'), count(/<h[1-6]\b/g, fullHtml)],
  ['tables', countTokens('table'), count(/<table\b/g, fullHtml)],
  ['code blocks', countTokens('code'), count(/<pre\b/g, fullHtml)],
  ['blockquotes', countTokens('blockquote'), count(/<blockquote\b/g, fullHtml)],
];
for (const [name, a, b] of structural) if (a !== b) failures.push(`structure: ${name} ${a} in markdown vs ${b} in book`);
if (failures.length) {
  console.error(`✗ verbatim check failed — ${failures.length} line(s) of PRISM_LEARNING.md are not in the book:`);
  failures.slice(0, 40).forEach((f) => console.error('   ' + f));
  process.exit(1);
}
console.log(`✓ verbatim check: every text line of PRISM_LEARNING.md is present · ${structural.map(([n, a]) => `${a} ${n}`).join(' · ')} · ${FIGURES.length} figures`);
if (checkOnly) process.exit(0);

// ---------------------------------------------------------------------------
// Write outputs
// ---------------------------------------------------------------------------
fs.mkdirSync(FIG_DIR, { recursive: true });
fs.writeFileSync(OUT_HTML, fullHtml);
for (const f of FIGURES) fs.writeFileSync(path.join(FIG_DIR, `${f.id}.svg`), `<?xml version="1.0" encoding="UTF-8"?>\n${f.svg()}\n`);
fs.writeFileSync(path.join(FIG_DIR, 'cover.svg'), `<?xml version="1.0" encoding="UTF-8"?>\n${coverArt()}\n`);
console.log(`✓ wrote ${path.relative(ROOT, OUT_HTML)} (${(fullHtml.length / 1024).toFixed(0)} KB) + ${FIGURES.length + 1} SVGs in ${path.relative(ROOT, FIG_DIR)}/`);
if (typeof wantArtifact === 'string') { fs.writeFileSync(wantArtifact, fragment); console.log(`✓ wrote artifact fragment ${wantArtifact}`); }

if (wantPdf) {
  const pdfPath = typeof wantPdf === 'string' ? wantPdf : path.join(OUT_DIR, 'PRISM_LEARNING_BOOK.pdf');
  let pw;
  try { pw = await import('playwright-core'); }
  catch { console.error('✗ --pdf needs playwright-core: npm i -D playwright-core (Chromium must be installed, e.g. PLAYWRIGHT_CHROMIUM_PATH)'); process.exit(1); }
  const exe = process.env.PLAYWRIGHT_CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const browser = await pw.chromium.launch({ executablePath: exe, proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  await page.goto('file://' + OUT_HTML, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-family:IBM Plex Mono,monospace;font-size:8px;color:#6b665e;width:100%;text-align:center;">PRISM Learning Book · <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
  await browser.close();
  console.log(`✓ wrote ${pdfPath} (${(fs.statSync(pdfPath).size / 1024).toFixed(0)} KB)`);
}
