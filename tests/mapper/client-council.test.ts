/**
 * Tests for the browser-side mini-council: compressor-client.ts +
 * client-council.ts. These run in Node via vitest but the libraries
 * themselves (pdf-lib, jszip) are isomorphic, so they exercise the
 * same code paths the browser will hit.
 *
 * The File constructor used in production needs to be polyfilled here
 * since Node's stdlib File isn't 1:1 with the browser's. vitest's
 * `happy-dom` would do this; instead we construct a minimal Blob-like
 * shim that the compressor accepts (it only reads .name, .size,
 * .type, .lastModified, .arrayBuffer()).
 */
import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';

/** Minimal File shim — matches the small surface compressor-client uses. */
function makeFile(bytes: Uint8Array, name: string, type = 'application/octet-stream'): File {
  const blob = new Blob([bytes as BlobPart], { type });
  // @ts-expect-error — Node's File may not exist in all runtimes; emulate the duck type
  const f: File = {
    name,
    size: blob.size,
    type,
    lastModified: Date.now(),
    arrayBuffer: () => blob.arrayBuffer(),
    slice: blob.slice.bind(blob),
    stream: (blob as any).stream?.bind(blob),
    text: (blob as any).text?.bind(blob),
    webkitRelativePath: '',
  };
  return f;
}

async function makeBigPdf(targetBytes = 5 * 1024 * 1024): Promise<Uint8Array> {
  // Build a PDF >4 MB so the compressor doesn't skip it.
  // pdf-lib's overhead is small, so we stuff a giant string into a text
  // stream and let object-stream re-save compress it.
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const filler = 'PRISM test fixture — '.repeat(60_000);
  page.drawText(filler.slice(0, 1000));
  // Pad with repeated metadata to inflate raw size
  for (let i = 0; i < 8; i++) {
    doc.setSubject(filler.slice(0, 500_000));
    doc.setKeywords([filler.slice(0, 100_000)]);
  }
  const buf = await doc.save();
  return buf.length >= targetBytes ? buf : new Uint8Array(targetBytes); // fallback pads if needed
}

async function makeBigPptx(targetBytes = 5 * 1024 * 1024): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  // 3 slides with bulky text to ensure max-deflate has something to compress
  const bulkyText = 'PRISM bulky slide content — '.repeat(50_000);
  for (let i = 1; i <= 3; i++) {
    zip.file(`ppt/slides/slide${i}.xml`,
      `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${bulkyText.slice(0, 1_500_000)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
  }
  // Use NO compression so the file is bulky on disk → client compressor can shrink it
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'STORE' }));
}

describe('compressor-client — browser pipeline', () => {
  it('skips files below 4 MB threshold', async () => {
    const { compressClientSide } = await import('@/lib/mapper/compressor-client');
    const small = makeFile(new Uint8Array(1024 * 1024), 'tiny.pdf', 'application/pdf');
    const r = await compressClientSide(small);
    expect(r.reduced).toBe(false);
    expect(r.strategy).toContain('below-threshold');
  });

  it('skips image files (server handles them)', async () => {
    const { compressClientSide } = await import('@/lib/mapper/compressor-client');
    // 5 MB fake PNG (size matters for the threshold check; content doesn't for skip path)
    const fakeImg = makeFile(new Uint8Array(5 * 1024 * 1024), 'photo.png', 'image/png');
    const r = await compressClientSide(fakeImg);
    expect(r.reduced).toBe(false);
    expect(r.strategy).toContain('handled-server-side');
  });

  it('compresses a PPTX (max-deflate beats STORE)', async () => {
    const { compressClientSide } = await import('@/lib/mapper/compressor-client');
    const bytes = await makeBigPptx();
    const f = makeFile(bytes, 'big.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    const r = await compressClientSide(f);
    expect(r.reduced).toBe(true);
    expect(r.ratio).toBeLessThan(1);
    expect(r.strategy).toContain('pptx-jszip');
  }, 30000);

  it('CSV: BOM strip + newline norm always succeeds (if >4 MB)', async () => {
    const { compressClientSide } = await import('@/lib/mapper/compressor-client');
    const bigCsv = '﻿name,price\r\n' + 'apple,99   \r\n'.repeat(400_000);
    const bytes = new TextEncoder().encode(bigCsv);
    const f = makeFile(bytes, 'data.csv', 'text/csv');
    const r = await compressClientSide(f);
    expect(r.reduced).toBe(true);
    expect(r.strategy).toContain('csv:');
  });

  it('returns the original file on compression error', async () => {
    const { compressClientSide } = await import('@/lib/mapper/compressor-client');
    // A 5 MB "PDF" of pure zeros — pdf-lib will throw on load
    const garbage = makeFile(new Uint8Array(5 * 1024 * 1024), 'garbage.pdf', 'application/pdf');
    const r = await compressClientSide(garbage);
    expect(r.reduced).toBe(false);
    expect(r.file).toBe(garbage);
  });

  it('reverts when compressed output ≥ original (no-saving path)', async () => {
    const { compressClientSide } = await import('@/lib/mapper/compressor-client');
    // A real PPTX zip we deliberately make small so max-deflate can't shrink it further
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    // Already-compressed payload: random bytes resist further compression
    const random = new Uint8Array(5 * 1024 * 1024);
    for (let i = 0; i < random.length; i++) random[i] = Math.floor(Math.random() * 256);
    zip.file('media/random.bin', random);
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
    zip.file('ppt/slides/slide1.xml', '<?xml version="1.0"?><p:sld/>');
    const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } }));
    const f = makeFile(bytes, 'incompressible.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    const r = await compressClientSide(f);
    // Either no reduction OR a strategy with 'no-saving' in it — both are valid
    expect(r.reduced || r.strategy.includes('no-saving')).toBe(true);
    if (!r.reduced) {
      expect(r.strategy).toContain('no-saving');
      expect(r.file).toBe(f);
    }
  }, 30000);

  it('unsupported format skipped with explicit reason', async () => {
    const { compressClientSide } = await import('@/lib/mapper/compressor-client');
    const txt = makeFile(new Uint8Array(5 * 1024 * 1024), 'readme.txt', 'text/plain');
    const r = await compressClientSide(txt);
    expect(r.reduced).toBe(false);
    expect(r.strategy).toContain('handled-server-side');
  });
});

describe('client-council — verdict shape + smart-skip', () => {
  it('returns ready=true + reduced=true when QA passes on a real PPTX compress', async () => {
    const { runClientCouncil } = await import('@/lib/mapper/client-council');
    const bytes = await makeBigPptx();
    const f = makeFile(bytes, 'big.pptx',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    const v = await runClientCouncil(f);
    expect(v.ready).toBe(true);
    expect(v.reduced).toBe(true);
    expect(v.grade).toBe(10);
    expect(v.finalBytes).toBeLessThan(v.originalBytes);
  }, 30000);

  it('emits already-optimized:lossless-compression-cannot-help when saving is <5% AND <500 KB', async () => {
    // Construct a fake compress result we can validate the threshold against
    // by spying on compressClientSide — verifies the smart-skip branch.
    const mod = await import('@/lib/mapper/client-council');
    const compressorMod = await import('@/lib/mapper/compressor-client');
    const original = makeFile(new Uint8Array(5 * 1024 * 1024), 'opt.pdf', 'application/pdf');

    const spy = vi.spyOn(compressorMod, 'compressClientSide').mockResolvedValue({
      file:           makeFile(new Uint8Array(5 * 1024 * 1024 - 100_000), 'opt.pdf', 'application/pdf'),
      originalBytes:  5 * 1024 * 1024,
      compressedBytes: 5 * 1024 * 1024 - 100_000,  // ~100 KB saved = 1.9% saving
      ratio:          (5 * 1024 * 1024 - 100_000) / (5 * 1024 * 1024),
      strategy:       'pdf-lib:object-streams+restream',
      reduced:        true,
    });

    const v = await mod.runClientCouncil(original);
    expect(v.reduced).toBe(false);                                         // smart-skip activated
    expect(v.reason).toBe('already-optimized:lossless-compression-cannot-help');
    expect(v.file).toBe(original);                                         // returned ORIGINAL, not the tiny-saving compressed
    spy.mockRestore();
  });

  it('falls back to original when QA reports a structural blocker', async () => {
    const mod = await import('@/lib/mapper/client-council');
    const compressorMod = await import('@/lib/mapper/compressor-client');
    const original = makeFile(new Uint8Array(5 * 1024 * 1024), 'broken.pdf', 'application/pdf');

    // Compressor "succeeds" but returns garbage bytes pdf-lib will fail to reparse
    const spy = vi.spyOn(compressorMod, 'compressClientSide').mockResolvedValue({
      file:            makeFile(new Uint8Array(2 * 1024 * 1024), 'broken.pdf', 'application/pdf'),
      originalBytes:   5 * 1024 * 1024,
      compressedBytes: 2 * 1024 * 1024,
      ratio:           0.4,
      strategy:        'pdf-lib:object-streams+restream',
      reduced:         true,
    });

    const v = await mod.runClientCouncil(original);
    expect(v.reduced).toBe(false);                          // QA refused the compressed file
    expect(v.file).toBe(original);                          // original kept
    expect(v.blockers.length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});
