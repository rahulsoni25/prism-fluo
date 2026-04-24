/**
 * lib/keywords.ts
 *
 * Used by lib/inference.ts to detect and enrich keyword plan data
 * that has already been loaded from the DB (i.e., rows have been tidy'd).
 *
 * FIX: The old version had an extra strict check requiring "concept:" or
 * "searches:" column prefixes, which meant most standard Google Keyword
 * Planner exports were NOT recognised here even though handler.ts DID
 * store them correctly.  Detection is now aligned with lib/keywords/detector.ts.
 */

const BRAND_NAMES = [
  'apple', 'boat', 'jbl', 'bose', 'sony', 'samsung', 'sennheiser',
  'mi', 'oneplus', 'realme', 'skullcandy', 'hyperx', 'anker', 'razer', 'marshall',
];

const PRICE_KEYWORDS = ['price', 'cheap', 'cost', 'budget', 'buy', 'online', 'shop'];
const PRICE_PAT = /under\s*(\d+)/i;

const FEATURE_RULES: [string, string[]][] = [
  ['Gaming',           ['gaming', 'ps4', 'xbox', 'latency', 'rgb']],
  ['Noise Cancelling', ['noise cancelling', 'nc 700', 'anc', 'isolation']],
  ['Wireless',         ['wireless', 'bluetooth', 'tws', 'true wireless', 'unplugged']],
  ['Wired',            ['wired', 'aux', 'cable', 'jack']],
  ['Over-ear',         ['over ear', 'over-ear', 'earcup', 'headphones']],
  ['In-ear',           ['earphones', 'earbuds', 'earpods', 'pods']],
];

/**
 * Returns true if the dataset looks like a keyword plan.
 * Matches both the raw GKP export format AND already-tidy'd rows from the DB.
 *
 * Required columns (case-insensitive):
 *   - 'keyword'
 *   - 'avg_monthly_searches' OR 'avg. monthly searches'
 */
export function isKeywordPlan(data: Record<string, unknown>[]): boolean {
  if (!data || data.length === 0) return false;
  const cols = Object.keys(data[0]).map(c => c.trim().toLowerCase());

  const hasKeyword = cols.includes('keyword');
  const hasVolume  = cols.includes('avg_monthly_searches') ||
                     cols.includes('avg. monthly searches');
  return hasKeyword && hasVolume;
}

export interface KeywordClassification {
  brand: string;
  is_price_intent: boolean;
  categories: string;
}

export function classifyKeyword(text: string): KeywordClassification {
  const t = (text || '').toLowerCase();

  const brandMatch = BRAND_NAMES.find(b => t.includes(b));
  const brand      = brandMatch
    ? brandMatch.charAt(0).toUpperCase() + brandMatch.slice(1)
    : 'Non-brand';

  const isPrice = PRICE_PAT.test(t) || PRICE_KEYWORDS.some(kw => t.includes(kw));

  const cats = new Set<string>();
  FEATURE_RULES.forEach(([name, needles]) => {
    if (needles.some(n => t.includes(n))) cats.add(name);
  });
  if (cats.size === 0) cats.add('Generic');

  return { brand, is_price_intent: isPrice, categories: Array.from(cats).sort().join(', ') };
}

export function enrichKeywordData(
  data: Record<string, unknown>[]
): Record<string, unknown>[] {
  if (!data || data.length === 0) return data;

  const originalCols = Object.keys(data[0]);
  // Support both raw ("avg. monthly searches") and tidy'd ("avg_monthly_searches")
  const kwCol  = originalCols.find(c =>
    c.trim().toLowerCase() === 'keyword'
  );
  const volCol = originalCols.find(c =>
    c.trim().toLowerCase() === 'avg_monthly_searches' ||
    c.trim().toLowerCase() === 'avg. monthly searches'
  );
  if (!kwCol || !volCol) return data;

  const enriched = [...data].sort((a, b) => {
    return (parseFloat(String(b[volCol])) || 0) - (parseFloat(String(a[volCol])) || 0);
  });

  const total = enriched.length;
  return enriched.map((row, idx) => {
    const pct  = (idx + 1) / total;
    const tier = pct <= 0.2 ? 'Primary' : pct <= 0.6 ? 'Secondary' : 'Tertiary';
    return {
      ...row,
      tier,
      volume_pct: (pct * 100).toFixed(1),
      ...classifyKeyword(String(row[kwCol])),
    };
  });
}
