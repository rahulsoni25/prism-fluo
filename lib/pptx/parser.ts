/**
 * lib/pptx/parser.ts
 *
 * .pptx files are ZIP archives with one XML per slide at
 * `ppt/slides/slideN.xml`. Speaker notes live at
 * `ppt/notesSlides/notesSlideN.xml`. Each `<a:t>` element holds a run
 * of text; tables live inside `<a:tbl>` blocks with `<a:tr>` rows and
 * `<a:tc>` cells.
 *
 * Two extraction paths are exported:
 *
 *   - extractPptxSlides / extractPptxText: legacy "all text concatenated"
 *     path used by the rawText fallback when no structured parser exists.
 *     Kept verbatim for back-compat with `lib/uploads/handler.ts`.
 *
 *   - extractPptxStructured: per-slide rows with title, bullets, and
 *     tables (each as { headers, rows }) plus speaker notes. This is
 *     what the structured upload path uses so consulting decks (which
 *     are mostly table-driven — keyword lists, persona profiles,
 *     platform matrices) survive ingestion with their structure intact.
 */

import JSZip from 'jszip';

// ─────────────────────────────────────────────────────────────────────
// Legacy path — single text blob per slide (preserved for back-compat).
// ─────────────────────────────────────────────────────────────────────

export interface PptxSlide {
  slideNumber: number;
  text: string;
}

/** Decode the handful of XML entities that show up in pptx text runs. */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Pull every `<a:t>...</a:t>` text run from a chunk of slide XML.
 *
 * NOTE: the open-tag pattern must require whitespace or `>` immediately
 * after the `t` so it doesn't accidentally match `<a:tbl>`, `<a:tc>`,
 * `<a:tr>` (which all start with `<a:t…`). The legacy regex used `[^<]*`
 * for content, which dodged the issue because nested XML inside table
 * blocks contains `<` characters that ended the match. We use `[\s\S]*?`
 * for content (needed for multi-line runs), so we tighten the open-tag
 * boundary instead.
 */
function pullTextRuns(xml: string): string[] {
  const RE = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = RE.exec(xml)) !== null) out.push(decodeXmlEntities(m[1]));
  return out;
}

export async function extractPptxSlides(buffer: Buffer): Promise<PptxSlide[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return [];
  }

  const slideFiles = Object.keys(zip.files)
    .filter(p => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] ?? '0', 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] ?? '0', 10);
      return na - nb;
    });

  const slides: PptxSlide[] = [];
  for (const path of slideFiles) {
    const xml  = await zip.files[path].async('string');
    const text = pullTextRuns(xml).join(' ').replace(/\s+/g, ' ').trim();
    const slideNumber = parseInt(path.match(/slide(\d+)\.xml/i)?.[1] ?? '0', 10);
    if (text.length > 0) slides.push({ slideNumber, text });
  }
  return slides;
}

export async function extractPptxText(buffer: Buffer): Promise<string> {
  const slides = await extractPptxSlides(buffer);
  if (slides.length === 0) return '';
  return slides
    .map(s => `--- Slide ${s.slideNumber} ---\n${s.text}`)
    .join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────
// Structured path — title / bullets / tables / notes per slide.
// ─────────────────────────────────────────────────────────────────────

export interface PptxTable {
  /** First row of cells, treated as headers. */
  headers: string[];
  /** Remaining rows (each row is an array of cell strings). */
  rows: string[][];
}

export interface PptxStructuredSlide {
  slideNumber: number;
  /** Detected from title/ctrTitle placeholder, else first non-empty paragraph. */
  title: string | null;
  /** Non-title text paragraphs in document order (one entry per `<a:p>`). */
  bullets: string[];
  /** Tables in document order. Each cell is the concatenated text of its runs. */
  tables: PptxTable[];
  /** Speaker notes (notesSlideN.xml), trimmed and joined. */
  notes: string | null;
}

/**
 * Walk through `<a:tbl>...</a:tbl>` and return the table as
 * `{ headers, rows }`. Cells whose XML body is missing collapse to ''.
 */
function parseTable(tableXml: string): PptxTable {
  const rowMatches = tableXml.match(/<a:tr[\s\S]*?<\/a:tr>/g) ?? [];
  const allRows: string[][] = rowMatches.map(rowXml => {
    const cellMatches = rowXml.match(/<a:tc(?:\s[^>]*)?>[\s\S]*?<\/a:tc>/g) ?? [];
    return cellMatches.map(cellXml =>
      pullTextRuns(cellXml).join(' ').replace(/\s+/g, ' ').trim()
    );
  });
  if (allRows.length === 0) return { headers: [], rows: [] };
  const [headers, ...rest] = allRows;
  return { headers, rows: rest };
}

/**
 * Detect a title-placeholder shape and return its text (or null if none).
 * Looks for `<p:ph ... type="title">` or `type="ctrTitle"` inside the
 * shape's `<p:nvSpPr>` block, then extracts text from the same shape's
 * `<p:txBody>`.
 */
function detectTitle(slideXml: string): string | null {
  const shapeMatches = slideXml.match(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g) ?? [];
  for (const sp of shapeMatches) {
    if (/<p:ph[^>]*type="(?:title|ctrTitle)"/i.test(sp)) {
      const txt = pullTextRuns(sp).join(' ').replace(/\s+/g, ' ').trim();
      if (txt) return txt;
    }
  }
  return null;
}

/**
 * Walk the slide XML in document order, splitting into "shape" tokens
 * (text-bearing `<p:sp>` paragraphs, `<p:graphicFrame>` tables). Returns
 * bullets (one per paragraph, title placeholders excluded) and tables.
 */
function parseSlideBody(slideXml: string, title: string | null): { bullets: string[]; tables: PptxTable[] } {
  const bullets: string[] = [];
  const tables:  PptxTable[] = [];

  // Strip title shape so its text isn't duplicated as a bullet.
  // We rebuild a "scan body" that skips shapes whose ph type is title/ctrTitle.
  const scanXml = slideXml.replace(
    /<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g,
    (sp) => /<p:ph[^>]*type="(?:title|ctrTitle)"/i.test(sp) ? '' : sp,
  );

  // Walk in document order: find tables and `<a:p>` paragraphs.
  // Regex finds the next interesting token from a position; we interleave them.
  const tokenRe = /<a:tbl(?:\s[^>]*)?>[\s\S]*?<\/a:tbl>|<a:p(?:\s[^>]*)?>[\s\S]*?<\/a:p>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(scanXml)) !== null) {
    const chunk = match[0];
    if (chunk.startsWith('<a:tbl')) {
      // a:tbl appears nested under a:p in some pathological exports —
      // skip table content from being double-counted as bullets by
      // letting the regex's lazy match keep table-internal `<a:p>`
      // hidden inside the table block above. We just push the table.
      const t = parseTable(chunk);
      if (t.headers.length > 0 || t.rows.length > 0) tables.push(t);
    } else {
      // a:p — single paragraph. Skip if it's actually inside a table cell
      // (we don't want cell text as a bullet). Detect by checking if this
      // paragraph's start index falls inside any already-found table.
      const start = match.index;
      const inTable = (slideXml.indexOf(chunk) !== start)
        ? false
        : false; // explicit: parsed already by table walker above
      // The lazy regex above does match `<a:p>` inside tables too —
      // dedupe by checking ancestors: if any table chunk envelopes this
      // paragraph's position, skip.
      const enclosed = (() => {
        const before = scanXml.slice(0, start);
        const openTbl  = (before.match(/<a:tbl(?:\s[^>]*)?>/g) ?? []).length;
        const closeTbl = (before.match(/<\/a:tbl>/g) ?? []).length;
        return openTbl > closeTbl;
      })();
      if (enclosed) continue;
      if (inTable) continue;
      const txt = pullTextRuns(chunk).join(' ').replace(/\s+/g, ' ').trim();
      if (txt && txt !== title) bullets.push(txt);
    }
  }
  return { bullets, tables };
}

/**
 * Map slideN.xml → notesSlideN.xml by reading the slide's rels file.
 * Falls back to "same N" if the rel can't be resolved (works for every
 * deck I've seen but the rels path is the canonical mapping).
 */
async function readNotes(zip: JSZip, slidePath: string): Promise<string | null> {
  const slideN = slidePath.match(/slide(\d+)\.xml/i)?.[1];
  if (!slideN) return null;

  // Canonical path via rels file.
  const relsPath = `ppt/slides/_rels/slide${slideN}.xml.rels`;
  const relsFile = zip.files[relsPath];
  let notesPath: string | null = null;
  if (relsFile) {
    const relsXml = await relsFile.async('string');
    const m = relsXml.match(/Target="(\.\.\/notesSlides\/notesSlide\d+\.xml)"/i);
    if (m) notesPath = m[1].replace(/^\.\.\//, 'ppt/');
  }
  // Fallback: same-N convention.
  if (!notesPath) notesPath = `ppt/notesSlides/notesSlide${slideN}.xml`;

  const notesFile = zip.files[notesPath];
  if (!notesFile) return null;
  const xml = await notesFile.async('string');

  // Notes XML embeds slide-number placeholder text we don't want.
  // Filter paragraphs whose ph type is "sldNum".
  const ps = xml.match(/<p:sp(?:\s[^>]*)?>[\s\S]*?<\/p:sp>/g) ?? [xml];
  const lines: string[] = [];
  for (const sp of ps) {
    if (/<p:ph[^>]*type="sldNum"/i.test(sp)) continue;
    const txt = pullTextRuns(sp).join(' ').replace(/\s+/g, ' ').trim();
    if (txt) lines.push(txt);
  }
  const joined = lines.join('\n').trim();
  return joined.length > 0 ? joined : null;
}

/**
 * Extract per-slide structured content from a .pptx buffer.
 * Returns an empty array if the file isn't a valid pptx.
 */
export async function extractPptxStructured(buffer: Buffer): Promise<PptxStructuredSlide[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return [];
  }

  const slideFiles = Object.keys(zip.files)
    .filter(p => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] ?? '0', 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] ?? '0', 10);
      return na - nb;
    });

  const out: PptxStructuredSlide[] = [];
  for (const path of slideFiles) {
    const xml = await zip.files[path].async('string');
    const slideNumber = parseInt(path.match(/slide(\d+)\.xml/i)?.[1] ?? '0', 10);

    const title = detectTitle(xml);
    const { bullets, tables } = parseSlideBody(xml, title);

    // If no explicit title placeholder, promote the first bullet as title
    // (matches how most decks render: title-styled text in a body shape).
    let finalTitle = title;
    let finalBullets = bullets;
    if (!finalTitle && bullets.length > 0) {
      finalTitle = bullets[0];
      finalBullets = bullets.slice(1);
    }

    const notes = await readNotes(zip, path);

    // Skip slides that are entirely empty.
    if (!finalTitle && finalBullets.length === 0 && tables.length === 0 && !notes) continue;

    out.push({
      slideNumber,
      title:   finalTitle,
      bullets: finalBullets,
      tables,
      notes,
    });
  }

  return out;
}
