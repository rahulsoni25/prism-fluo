/**
 * lib/pptx/parser.ts
 *
 * Extracts plain text from a .pptx file (PowerPoint Open XML format).
 *
 * .pptx files are ZIP archives containing one XML file per slide under
 * `ppt/slides/slideN.xml`. Each `<a:t>` element holds a run of text.
 * We pull every <a:t>...</a:t> match per slide, in document order, and
 * concatenate them with newlines so Gemini's text/PDF analysis path can
 * treat the deck like any other document.
 */

import JSZip from 'jszip';

export interface PptxSlide {
  slideNumber: number;
  text: string;
}

/**
 * Read a .pptx buffer and return one entry per slide with extracted text.
 * Returns an empty array if the file isn't a valid pptx or has no slides.
 */
export async function extractPptxSlides(buffer: Buffer): Promise<PptxSlide[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    return [];
  }

  // Collect slide XML files: ppt/slides/slide1.xml, slide2.xml, ...
  const slideFiles = Object.keys(zip.files)
    .filter(p => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] ?? '0', 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] ?? '0', 10);
      return na - nb;
    });

  const slides: PptxSlide[] = [];
  for (const path of slideFiles) {
    const xml = await zip.files[path].async('string');
    // Pull every <a:t>...</a:t> text run. The 'a' namespace is the
    // DrawingML namespace used inside slide content.
    const matches = xml.match(/<a:t[^>]*>([^<]*)<\/a:t>/g) ?? [];
    const text = matches
      .map(m => m.replace(/<a:t[^>]*>/, '').replace(/<\/a:t>/, ''))
      // Decode the handful of XML entities we care about
      .map(t => t
        .replace(/&amp;/g,  '&')
        .replace(/&lt;/g,   '<')
        .replace(/&gt;/g,   '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'"))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    const slideNumber = parseInt(path.match(/slide(\d+)\.xml/i)?.[1] ?? '0', 10);
    if (text.length > 0) slides.push({ slideNumber, text });
  }

  return slides;
}

/**
 * Convenience wrapper that returns the deck as a single text blob,
 * with each slide separated by a header line. Suitable for sending
 * to Gemini's free-text analysis endpoint.
 */
export async function extractPptxText(buffer: Buffer): Promise<string> {
  const slides = await extractPptxSlides(buffer);
  if (slides.length === 0) return '';
  return slides
    .map(s => `--- Slide ${s.slideNumber} ---\n${s.text}`)
    .join('\n\n');
}
