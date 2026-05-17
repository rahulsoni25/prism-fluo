/**
 * Reproduce the 8-layer keyword path locally against the same CSV the user
 * uploaded, to find why production fell through to generic-tabular.
 *
 * Usage:
 *   node --env-file=.env.local --import tsx scripts/test-keyword-8layer.mts
 */
import { readFileSync } from 'node:fs';
import { analyzeKeywordPlannerForPRISM, isKeywordPlannerShape } from '../lib/ai/gemini';

const CSV_PATH = 'C:/Users/habib/Downloads/Keyword Stats 2026-05-15 at 07_49_22.csv';

function parseCsv(text: string): any[] {
  // Google Keyword Planner exports a BOM + 2 preamble lines before the header.
  let body = text.replace(/^﻿/, '');
  const lines = body.split(/\r?\n/);
  // Find header row (one that contains "Keyword")
  let headerIdx = lines.findIndex(l => /^"?Keyword"?\s*,/i.test(l));
  if (headerIdx === -1) headerIdx = 0;
  const header = parseRow(lines[headerIdx]);
  const out: any[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = parseRow(line);
    const row: Record<string, any> = {};
    header.forEach((h, j) => { row[h] = cells[j] ?? ''; });
    out.push(row);
  }
  return out;
}

function parseRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      out.push(cur); cur = '';
    } else { cur += ch; }
  }
  out.push(cur);
  return out;
}

(async () => {
  console.log('Loading CSV from:', CSV_PATH);
  const text = readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(text);
  console.log(`Parsed ${rows.length} rows.`);
  console.log('First row keys:', Object.keys(rows[0] ?? {}));
  console.log('First row sample:', JSON.stringify(rows[0], null, 2));
  console.log('isKeywordPlannerShape →', isKeywordPlannerShape(rows));

  console.log('\nCalling analyzeKeywordPlannerForPRISM…');
  const t0 = Date.now();
  try {
    const cards = await analyzeKeywordPlannerForPRISM(
      rows,
      'Local repro · detergent niche',
      'KEYWORD_PLANNER',
      'Brand: Surf Excel / category: laundry detergent / market: India / objective: identify high-intent search opportunities for 2026 PPC + SEO plan.',
    );
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\n✅ Returned ${cards.length} cards in ${elapsed}s`);
    const byLayer: Record<string, number> = {};
    const byBucket: Record<string, number> = {};
    cards.forEach((c: any) => {
      const L = String(c.layer ?? '?');
      byLayer[L] = (byLayer[L] ?? 0) + 1;
      byBucket[c.bucket] = (byBucket[c.bucket] ?? 0) + 1;
    });
    console.log('Layers:', byLayer);
    console.log('Buckets:', byBucket);
    console.log('\nFirst 3 cards:');
    cards.slice(0, 3).forEach((c: any, i) => {
      console.log(`  ${i + 1}. [L${c.layer ?? '?'} · ${c.bucket}] ${c.title}`);
      console.log(`     stat: ${c.stat}`);
    });
  } catch (err: any) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.error(`\n❌ THREW after ${elapsed}s:`, err.message);
    console.error(err.stack);
  }
})();
