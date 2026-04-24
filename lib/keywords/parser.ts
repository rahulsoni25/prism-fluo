import type { Worksheet } from 'exceljs';
import type { KeywordRow } from '@/types/keywords';

const BRAND_NAMES = [
  'apple', 'boat', 'jbl', 'bose', 'sony', 'samsung', 'sennheiser',
  'mi', 'oneplus', 'realme', 'skullcandy', 'hyperx', 'anker', 'razer', 'marshall',
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
