/**
 * End-to-end verification of lib/nuggets/synthesize.ts against the same
 * Keyword CSV + Amazon xlsx the user supplied. Confirms deterministic
 * headlines + stats match the offline script's findings.
 */
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { synthesizeNuggets } from '../lib/nuggets/synthesize';

const KW_PATH   = 'C:/Users/habib/Downloads/Keyword Stats 2026-05-15 at 07_49_22.csv';
const AMZN_PATH = 'C:/Users/habib/Downloads/IN_AMAZON_blackBoxProducts_niche_detergents_2026-05-17.xlsx';

function parseKwCsv(): any[] {
  const text = readFileSync(KW_PATH, 'utf16le').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/);
  const headerIdx = lines.findIndex(l => /^"?Keyword"?[\t,]/i.test(l));
  if (headerIdx === -1) return [];
  const sep = lines[headerIdx].includes('\t') ? '\t' : ',';
  const split = (line: string) => {
    const out: string[] = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === sep && !inQ) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[headerIdx]).map(s => s.replace(/^"|"$/g, '').trim());
  const rows: any[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = split(lines[i]).map(s => s.replace(/^"|"$/g, '').trim());
    const r: Record<string, string> = {};
    header.forEach((h, j) => { r[h] = cells[j] ?? ''; });
    rows.push(r);
  }
  return rows;
}

function parseAmazon(): any[] {
  const wb = XLSX.read(readFileSync(AMZN_PATH), { type: 'buffer' });
  const sheet = wb.SheetNames.find(n => !/instructions|readme|notes/i.test(n)) || wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
}

const brief = {
  brand: 'Surf Excel',
  category: 'Laundry detergent',
  objective: 'Identify high-intent search opportunities for 2026 PPC + SEO plan',
  geography: 'India',
  competitors: 'Ariel, Tide, Ghadi, Nirma',
};

const nuggets = synthesizeNuggets({
  keywordRows:  parseKwCsv(),
  helium10Rows: parseAmazon(),
  brief,
  audienceDescriptor: 'Indian families, 18-44, Metro+Tier 1+Tier 2, all SECs',
  categoryIntel: { marketValueINR: '₹45,000 Cr', cagr: '4.1%' },
});

console.log('\n════════════════════════════════════════════════════════════');
console.log('NUGGETS PAYLOAD (deterministic, computed from raw rows)');
console.log('════════════════════════════════════════════════════════════');

for (const [slot, card] of Object.entries(nuggets)) {
  if (!card) continue;
  console.log(`\n────── ${slot.toUpperCase()} ──────`);
  console.log(`Eyebrow:  ${card.eyebrow}`);
  console.log(`Headline: ${card.headline}`);
  console.log(`Stat:     ${card.stat}`);
  console.log(`Hover (${card.hoverLines.length}):`);
  card.hoverLines.forEach(l => console.log(`  • ${l}`));
}
