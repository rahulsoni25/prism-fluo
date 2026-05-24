// Runs the same pipeline as lib/mapper/client-council.ts against a real file.
// Usage: node scripts/test-mapper-on-real-file.mjs "C:\path\to\file.pdf"

import { readFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';

const PATH = process.argv[2];
if (!PATH) { console.error('Usage: node scripts/test-mapper-on-real-file.mjs <path>'); process.exit(1); }

console.log(`\n📄 ${PATH}`);
const t0 = Date.now();
const buf = await readFile(PATH);
console.log(`   Original size: ${(buf.length / 1024 / 1024).toFixed(2)} MB (${buf.length.toLocaleString()} bytes)`);

// ── Compressor pass (same as lib/mapper/compressor-client.ts) ──
let origPages = 0;
let outBuf = null;
const tCompress0 = Date.now();
try {
  const doc = await PDFDocument.load(buf, { updateMetadata: false });
  origPages = doc.getPageCount();
  console.log(`   Pages:         ${origPages}`);
  doc.setProducer('');
  doc.setCreator('');
  outBuf = await doc.save({ useObjectStreams: true, addDefaultPage: false, objectsPerTick: 200 });
} catch (err) {
  console.log(`   ❌ Compression FAILED: ${err.message}`);
  console.log(`   → Council verdict: skip compression, upload original`);
  process.exit(0);
}
const compressMs = Date.now() - tCompress0;
console.log(`   ⏱  Compress took: ${compressMs}ms`);
console.log(`   Compressed:    ${(outBuf.length / 1024 / 1024).toFixed(2)} MB (${outBuf.length.toLocaleString()} bytes)`);

const saved = buf.length - outBuf.length;
const pct = Math.round((1 - outBuf.length / buf.length) * 100);
console.log(`   Saving:        ${(saved / 1024 / 1024).toFixed(2)} MB (−${pct}%)`);

if (outBuf.length >= buf.length) {
  console.log(`   ℹ  No saving achieved — council would skip and upload original.`);
  process.exit(0);
}

// ── QA pass: re-parse compressed, verify page count ──
const tQa0 = Date.now();
let qaPages = null;
try {
  const reDoc = await PDFDocument.load(outBuf, { updateMetadata: false });
  qaPages = reDoc.getPageCount();
} catch (err) {
  console.log(`   ❌ QA FAILED: compressed file won't reparse — ${err.message}`);
  console.log(`   → Council verdict: BLOCKER, ship original`);
  process.exit(0);
}
const qaMs = Date.now() - tQa0;
console.log(`   ⏱  QA took:       ${qaMs}ms`);
console.log(`   QA pages:      ${qaPages} (original ${origPages})`);

if (qaPages !== origPages) {
  console.log(`\n   🛑 BLOCKER: page count changed ${origPages} → ${qaPages}`);
  console.log(`   → Council verdict: discard compressed, ship original`);
  process.exit(0);
}

// ── Verdict ──
console.log(`\n   ✅ COUNCIL PASSED — grade 10/10`);
console.log(`   → Browser will upload ${(outBuf.length / 1024 / 1024).toFixed(2)} MB instead of ${(buf.length / 1024 / 1024).toFixed(2)} MB`);

// Approximate upload-time savings on typical connections
const savedSec_20 = saved / (20 * 1024 * 1024 / 8);
const savedSec_10 = saved / (10 * 1024 * 1024 / 8);
const savedSec_5  = saved / (5 * 1024 * 1024 / 8);
console.log(`\n   Bandwidth savings estimate:`);
console.log(`     @ 20 Mbps: ~${savedSec_20.toFixed(1)}s saved on upload`);
console.log(`     @ 10 Mbps: ~${savedSec_10.toFixed(1)}s saved`);
console.log(`     @  5 Mbps: ~${savedSec_5.toFixed(1)}s saved`);
console.log(`\n   Total elapsed (compress + QA): ${Date.now() - t0}ms — this is what the browser would spend before upload begins.\n`);
