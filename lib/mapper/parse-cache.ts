/**
 * lib/mapper/parse-cache.ts
 *
 * Tiny WeakMap-backed cache so we never re-run pdf-parse on the same
 * Buffer instance. The mapper council reads PDFs during senior-audit
 * and mapper-qa; downstream code (lib/pdf/parser.ts) used to parse the
 * same buffer a second time. With this cache, the second call is a
 * direct hash-map hit.
 *
 * WeakMap keys are Buffer instances, so when the buffer is GC'd the
 * cached entry goes with it — no memory leak.
 */

export interface ParsedPdf {
  text: string;
  numpages: number;
  raw: any;          // the full pdf-parse result, for callers that need more
}

const CACHE = new WeakMap<Buffer, ParsedPdf>();

/** Run pdf-parse once per Buffer, return the cached result on subsequent calls. */
export async function parsePdfOnce(buffer: Buffer): Promise<ParsedPdf | null> {
  const hit = CACHE.get(buffer);
  if (hit) return hit;
  try {
    const pdfParse = (await import('pdf-parse')).default as any;
    const raw = await pdfParse(buffer);
    const entry: ParsedPdf = {
      text: raw?.text ?? '',
      numpages: raw?.numpages ?? 0,
      raw,
    };
    CACHE.set(buffer, entry);
    return entry;
  } catch {
    return null;
  }
}
