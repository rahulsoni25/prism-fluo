/**
 * Tests for the Data Mapper Council. Uses tiny synthetic PDF/PPTX fixtures
 * generated on-the-fly so we don't need a fixtures dir.
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import { runMapperCouncil } from '@/lib/mapper/orchestrator';
import { compress } from '@/lib/mapper/compressor';
import { runSeniorAudit } from '@/lib/mapper/senior-audit';

async function makeTinyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  page.drawText('Hello PRISM test fixture');
  return Buffer.from(await doc.save());
}

async function makeTinyPptx(): Promise<Buffer> {
  // Build a minimal valid PPTX (just enough to be parseable)
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  zip.file('ppt/slides/slide1.xml', '<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide one text</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

describe('senior-audit — small files', () => {
  it('passes a tiny valid PDF', async () => {
    const buf = await makeTinyPdf();
    const r = await runSeniorAudit(buf, 'test.pdf');
    expect(r.ok).toBe(true);
    expect(r.findings.filter(f => f.severity === 'blocker').length).toBe(0);
  });

  it('flags an absurdly tiny "file"', async () => {
    const r = await runSeniorAudit(Buffer.from('x'), 'tiny.pdf');
    expect(r.ok).toBe(false);
    expect(r.findings.some(f => f.severity === 'blocker' && f.issue.includes('bytes'))).toBe(true);
  });

  it('flags a PDF with no %PDF- header', async () => {
    const r = await runSeniorAudit(Buffer.alloc(4096, 0x00), 'fake.pdf');
    expect(r.ok).toBe(false);
    expect(r.findings.some(f => f.severity === 'blocker' && f.issue.includes('header'))).toBe(true);
  });

  it('reruns once on initial blocker (per spec)', async () => {
    const r = await runSeniorAudit(Buffer.alloc(4096, 0x00), 'fake.pdf');
    expect(r.reranOnce).toBe(true);
  });
});

describe('compressor — preserves text', () => {
  it('PDF compress preserves all text via pdf-lib re-save', async () => {
    const original = await makeTinyPdf();
    const r = await compress(original, 'test.pdf');
    expect(r.textPreserved).toBe(true);
    expect(r.buffer.length).toBeGreaterThan(0);
  });

  it('PPTX compress preserves slide text', async () => {
    const original = await makeTinyPptx();
    const r = await compress(original, 'test.pptx');
    expect(r.textPreserved).toBe(true);
    // The recompressed PPTX should still be a valid zip
    const reZip = await JSZip.loadAsync(r.buffer);
    expect(Object.keys(reZip.files).some(p => p.startsWith('ppt/slides/'))).toBe(true);
  });

  it('skips compression for unknown formats', async () => {
    const r = await compress(Buffer.from('hello'), 'data.bin');
    expect(r.strategiesApplied[0]).toContain('skip');
    expect(r.buffer).toEqual(Buffer.from('hello'));
  });
});

async function makeTinyXlsx(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>');
  zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet><sheetData><row><c><v>42</v></c><c t="inlineStr"><is><t>Revenue</t></is></c></row></sheetData></worksheet>');
  zip.file('xl/sharedStrings.xml', '<?xml version="1.0"?><sst><si><t>Hello PRISM xlsx</t></si></sst>');
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

const TINY_CSV = Buffer.from('name,price,stock\nApple,99,12\nBanana,49,30\nCherry,199,5\n', 'utf8');
// 1x1 transparent PNG
const TINY_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

describe('senior-audit — XLSX / CSV / image', () => {
  it('passes a tiny valid XLSX', async () => {
    const buf = await makeTinyXlsx();
    const r = await runSeniorAudit(buf, 'test.xlsx');
    expect(r.findings.filter(f => f.severity === 'blocker').length).toBe(0);
  });

  it('flags a CSV with only a header', async () => {
    const r = await runSeniorAudit(Buffer.from('a,b,c\n'), 'thin.csv');
    expect(r.ok).toBe(false);
  });

  it('passes a real PNG', async () => {
    const r = await runSeniorAudit(TINY_PNG, 'pixel.png');
    expect(r.ok).toBe(true);
  });

  it('flags PNG-named file with JPEG bytes', async () => {
    const fakePng = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF]), Buffer.alloc(300, 0)]);
    const r = await runSeniorAudit(fakePng, 'photo.png');
    expect(r.ok).toBe(false);
  });
});

describe('compressor — XLSX / CSV / image', () => {
  it('XLSX compress preserves sheets + text', async () => {
    const original = await makeTinyXlsx();
    const r = await compress(original, 'test.xlsx');
    expect(r.textPreserved).toBe(true);
    const reZip = await JSZip.loadAsync(r.buffer);
    expect(Object.keys(reZip.files).some(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))).toBe(true);
  });

  it('CSV compress strips BOM + normalises newlines', async () => {
    const withBom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('a,b\r\n1,2\r\n', 'utf8')]);
    const r = await compress(withBom, 'data.csv');
    expect(r.strategiesApplied).toContain('strip-bom');
    expect(r.strategiesApplied).toContain('normalise-newlines');
    expect(r.buffer.length).toBeLessThan(withBom.length);
  });

  it('image compress returns unchanged + flags sharp-missing', async () => {
    const r = await compress(TINY_PNG, 'pixel.png');
    expect(r.buffer).toEqual(TINY_PNG);
    expect(r.strategiesApplied[0]).toContain('image-codec-not-installed');
  });
});

describe('orchestrator — routes by size', () => {
  it('small PDF routes through senior-audit (single pass)', async () => {
    const buf = await makeTinyPdf();
    const verdict = await runMapperCouncil(buf, 'small.pdf');
    expect(verdict.senior).toBeDefined();
    expect(verdict.compressor).toBeUndefined();
    expect(verdict.finalBuffer).toBe(buf); // unchanged for small files
  });

  it('grade 10 for clean small file', async () => {
    const buf = await makeTinyPdf();
    const verdict = await runMapperCouncil(buf, 'small.pdf');
    expect(verdict.grade).toBe(10);
    expect(verdict.ready).toBe(true);
  });

  it('returns final buffer with consistent shape', async () => {
    const buf = await makeTinyPdf();
    const verdict = await runMapperCouncil(buf, 'small.pdf');
    expect(verdict.finalBuffer).toBeInstanceOf(Buffer);
    expect(typeof verdict.grade).toBe('number');
    expect(typeof verdict.attempts).toBe('number');
  });
});
