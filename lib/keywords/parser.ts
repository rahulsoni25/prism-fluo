import type { Worksheet } from 'exceljs';
import type { KeywordRow } from '@/types/keywords';

const BRAND_NAMES = [
  // audio (legacy — kept so the old .xlsx flow still classifies correctly)
  'apple', 'boat', 'jbl', 'bose', 'sony', 'samsung', 'sennheiser',
  'mi', 'oneplus', 'realme', 'skullcandy', 'hyperx', 'anker', 'razer', 'marshall',
  // FMCG / detergent (added for the Ghadi/SArgam class of briefs)
  'tide', 'surf', 'ariel', 'ghadi', 'henko', 'rin', 'wheel', 'nirma', 'persil', 'omo',
];

export function classifyKeyword(text: string) {
  const t = (text || '').toLowerCase();
  const brandMatch = BRAND_NAMES.find(b => t.includes(b));
  const brand = brandMatch ? brandMatch.charAt(0).toUpperCase() + brandMatch.slice(1) : 'Non-brand';
  
  const isPriceIntent = /under\s*\d+/.test(t) || t.includes('price') || t.includes('cheap') || t.includes('cost');

  const categories: string[] = [];
  if (t.includes('gaming') || t.includes('headset')) categories.push('Gaming');
  if (t.includes('noise cancelling') || t.includes('nc 700') || t.includes('anc')) categories.push('Noise Cancelling');
  if (t.includes('wireless') || t.includes('bluetooth') || t.includes('tws') || t.includes('buds')) categories.push('Wireless');
  if (t.includes('wired')) categories.push('Wired');
  if (t.includes('over ear') || t.includes('over-ear') || t.includes('headphones')) categories.push('Over-ear');
  if (t.includes('earphones') || t.includes('earbuds') || t.includes('earpods')) categories.push('In-ear');
  
  if (!categories.length) categories.push('Generic');

  return { brand, isPriceIntent, categories: categories.join(', ') };
}

export function tidyKeywordPlan(
  uploadId: string,
  sheetName: string,
  worksheet: Worksheet
): KeywordRow[] {
  const rows: any[] = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    rows.push(row.values);
  });

  // 1. Identify Header Row
  let hIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const rowStr = (rows[i] || []).join(' ').toLowerCase();
    if (rowStr.includes('keyword') && rowStr.includes('avg. monthly searches')) {
      hIdx = i;
      break;
    }
  }

  if (hIdx === -1) return [];
  const headers = rows[hIdx] as any[];
  const kwCol = headers.findIndex(h => String(h || '').toLowerCase() === 'keyword');
  const volCol = headers.findIndex(h => String(h || '').toLowerCase().includes('avg. monthly searches'));
  const compCol = headers.findIndex(h => String(h || '').toLowerCase() === 'competition');
  const compIdxCol = headers.findIndex(h => String(h || '').toLowerCase().includes('competition (indexed'));
  const bidLowCol = headers.findIndex(h => String(h || '').toLowerCase().includes('low range'));
  const bidHighCol = headers.findIndex(h => String(h || '').toLowerCase().includes('high range'));

  // 2. Extract Data
  const rawData: any[] = [];
  for (let i = hIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const kw = String(row[kwCol] || '').trim();
    if (!kw) continue;

    const vol = parseFloat(row[volCol]) || 0;
    rawData.push({ row, kw, vol });
  }

  // 3. Sort by volume and assign Tiers
  rawData.sort((a,b) => b.vol - a.vol);
  const total = rawData.length;

  return rawData.map((item, idx) => {
    const pct = (idx + 1) / total;
    let tier: 'Primary' | 'Secondary' | 'Tertiary' = 'Tertiary';
    if (pct <= 0.2) tier = 'Primary';
    else if (pct <= 0.6) tier = 'Secondary';

    const classification = classifyKeyword(item.kw);

    return {
      uploadId,
      sheetName,
      keyword: item.kw,
      avgMonthlySearches: item.vol,
      competition: String(item.row[compCol] || ''),
      competitionIndexed: parseFloat(item.row[compIdxCol]) || null,
      bidLow: parseFloat(item.row[bidLowCol]) || null,
      bidHigh: parseFloat(item.row[bidHighCol]) || null,
      tier,
      brand: classification.brand,
      categories: classification.categories,
      isPriceIntent: classification.isPriceIntent
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Google Keyword Planner CSV path — UTF-16 LE, TAB-delimited, NOT an .xlsx
// ─────────────────────────────────────────────────────────────────────────
// File shape (May 2026 Google export):
//   Line 1: title row    — "Keyword Stats 2026-05-15 at 07_49_22"
//   Line 2: date range   — '"April 1, 2025 - March 31, 2026"'
//   Line 3: TAB header   — Keyword\tCurrency\tAvg. monthly searches\t...
//   Line 4+: TAB rows    — one per keyword
//
// The caller (upload handler) is responsible for decoding the UTF-16 BOM —
// this function takes already-decoded text and returns the full KeywordRow
// shape, including YoY change, ad/organic impression share, organic position
// and the 12-month seasonality curve.
//
// Backwards-compatible with the older tidyKeywordPlan output shape (every
// row still has uploadId, sheetName, keyword, avgMonthlySearches, etc.) —
// the extended fields ride alongside as optional values.

const parseNum = (s: string | undefined): number => {
  if (s == null) return 0;
  const t = String(s).replace(/,/g, '').trim();
  if (!t || t === '-' || t === '–') return 0;
  const n = parseFloat(t);
  return isNaN(n) ? 0 : n;
};
const parseNumOrNull = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = String(s).replace(/,/g, '').trim();
  if (!t || t === '-' || t === '–') return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
};
const parsePctOrNull = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t || t === '-' || t === '–') return null;
  const m = t.match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};
const parseBoolOrNull = (s: string | undefined): boolean | null => {
  if (s == null) return null;
  const t = String(s).trim().toLowerCase();
  if (!t) return null;
  if (/^(true|yes|y|1)$/.test(t)) return true;
  if (/^(false|no|n|0)$/.test(t)) return false;
  return null;
};

/**
 * Parse a Google Keyword Planner CSV (already decoded from UTF-16 to JS string).
 * Returns rows in the same shape as tidyKeywordPlan but with extended fields:
 * threeMonthChangePct, yoyChangePct, adImpressionShare, organicImpressionShare,
 * organicAvgPosition, inAccount, inPlan, monthlySearches.
 */
export function parseKeywordCsvText(
  uploadId: string,
  sheetName: string,
  text: string,
): KeywordRow[] {
  if (!text) return [];
  // Strip UTF-16 BOM if it survived decoding.
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines.length < 4) return [];

  const headers = lines[2].split('\t').map(h => h.trim());
  const idxOf = (name: string) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

  const iKeyword   = idxOf('Keyword');
  const iCurrency  = idxOf('Currency');
  const iAvgVol    = idxOf('Avg. monthly searches');
  const i3m        = idxOf('Three month change');
  const iYoy       = idxOf('YoY change');
  const iComp      = idxOf('Competition');
  const iCompIdx   = idxOf('Competition (indexed value)');
  const iBidLow    = idxOf('Top of page bid (low range)');
  const iBidHigh   = idxOf('Top of page bid (high range)');
  const iAdShare   = idxOf('Ad impression share');
  const iOrgShare  = idxOf('Organic impression share');
  const iOrgPos    = idxOf('Organic average position');
  const iInAcct    = idxOf('In account?');
  const iInPlan    = idxOf('In plan?');

  // Any header starting with "Searches:" → monthly seasonality column.
  const monthCols: Array<{ idx: number; label: string }> = [];
  headers.forEach((h, i) => {
    const m = h.match(/^Searches:\s+(.+)$/i);
    if (m) monthCols.push({ idx: i, label: m[1].trim() });
  });

  // First pass — read data rows.
  type Tmp = {
    cells: string[];
    keyword: string;
    vol: number;
  };
  const tmp: Tmp[] = [];
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cells = line.split('\t');
    const keyword = (cells[iKeyword] ?? '').trim();
    if (!keyword) continue;
    const vol = parseNum(cells[iAvgVol]);
    tmp.push({ cells, keyword, vol });
  }
  if (tmp.length === 0) return [];

  // Tier assignment by volume percentile (Primary top 20%, Secondary next 40%, Tertiary rest).
  const sortedByVol = [...tmp].sort((a, b) => b.vol - a.vol);
  const tierByKw = new Map<string, KeywordRow['tier']>();
  sortedByVol.forEach((row, idx) => {
    const pct = (idx + 1) / sortedByVol.length;
    tierByKw.set(row.keyword, pct <= 0.2 ? 'Primary' : pct <= 0.6 ? 'Secondary' : 'Tertiary');
  });

  return tmp.map(({ cells, keyword, vol }) => {
    const classification = classifyKeyword(keyword);
    const monthlySearches: Record<string, number> = {};
    for (const { idx, label } of monthCols) monthlySearches[label] = parseNum(cells[idx]);

    const compRaw = (cells[iComp] ?? '').trim();

    return {
      uploadId,
      sheetName,
      keyword,
      avgMonthlySearches:     vol,
      competition:            compRaw || null,
      competitionIndexed:     parseNumOrNull(cells[iCompIdx]),
      bidLow:                 parseNumOrNull(cells[iBidLow]),
      bidHigh:                parseNumOrNull(cells[iBidHigh]),
      tier:                   tierByKw.get(keyword) ?? 'Tertiary',
      brand:                  classification.brand,
      categories:             classification.categories,
      isPriceIntent:          classification.isPriceIntent,
      // Extended fields (Google Keyword Planner CSV path)
      currency:               (cells[iCurrency] ?? '').trim() || undefined,
      threeMonthChangePct:    parsePctOrNull(cells[i3m]),
      yoyChangePct:           parsePctOrNull(cells[iYoy]),
      adImpressionShare:      parsePctOrNull(cells[iAdShare]),
      organicImpressionShare: parsePctOrNull(cells[iOrgShare]),
      organicAvgPosition:     parseNumOrNull(cells[iOrgPos]),
      inAccount:              parseBoolOrNull(cells[iInAcct]),
      inPlan:                 parseBoolOrNull(cells[iInPlan]),
      monthlySearches:        Object.keys(monthlySearches).length > 0 ? monthlySearches : undefined,
    };
  });
}
