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
    const r = await compress(Buffer.from('hello'), 'data.csv');
    expect(r.strategiesApplied[0]).toContain('skip');
    expect(r.buffer).toEqual(Buffer.from('hello'));
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
