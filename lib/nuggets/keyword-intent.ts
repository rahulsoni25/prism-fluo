/**
 * lib/nuggets/keyword-intent.ts
 *
 * "Keyword Intent" nugget — breaks down a brief's uploaded Google Keyword
 * Planner data into the 4 outputs the user asked for:
 *
 *   1. Intent mix (Transactional / Informational / Brand-led / Category) %
 *   2. Top branded search terms relevant to the category — with volumes
 *   3. Top non-branded/category searches — with volumes
 *   4. Trending queries from the last 90 days (sorted by 3-month change %)
 *
 * Falls back to null when no Keyword Planner data exists for the brief
 * (UI then hides the card — same honest-skip pattern as GenreNuggetCard).
 */

import { db } from '@/lib/db/client';
import { classifyIntent, type KeywordIntent } from '@/lib/keywords/intent';

export interface KeywordIntentMix {
  intent:  KeywordIntent;
  count:   number;
  volume:  number;     // sum of avg_monthly_searches in this intent bucket
  pctOfVolume: number; // share of TOTAL volume (so a 50K-search "buy x" counts more than 50 informational queries)
}

export interface KeywordRanking {
  keyword:           string;
  volume:            number;
  intent:            KeywordIntent;
  threeMonthChange:  number | null;
  yoyChange:         number | null;
}

export interface KeywordIntentNugget {
  totalKeywords:     number;
  totalVolume:       number;
  intentMix:         KeywordIntentMix[];   // sorted by pctOfVolume desc
  topBranded:        KeywordRanking[];     // brand-led keywords, top 5 by volume
  topNonBranded:     KeywordRanking[];     // category/transactional/informational, top 5 by volume
  topTransactional:  KeywordRanking[];     // top 5 transactional
  topInformational:  KeywordRanking[];     // top 5 informational
  trending90d:       KeywordRanking[];     // top 5 by three_month_change %
  source:            string;               // "Google Keyword Planner"
  sourceUploads:     { id: string; filename: string }[];
}

const TOP_N = 5;

export async function buildKeywordIntentNugget(
  briefId: string,
  briefBrand: string | null,
  briefCompetitors: string | null,
): Promise<KeywordIntentNugget | null> {
  // 1. Get non-superseded uploads for the brief
  const upRes = await db.query(
    `SELECT id, filename FROM uploads
      WHERE brief_id = $1 AND superseded_by IS NULL`,
    [briefId],
  ).catch(() => ({ rows: [] as any[] }));
  if (upRes.rows.length === 0) return null;
  const uploadIds = upRes.rows.map((r: any) => r.id);

  // 2. Pull keyword rows. Schema migration ensures three_month_change/yoy_change
  //    exist; older uploads will have null for these.
  const kwRes = await db.query(
    `SELECT keyword, avg_monthly_searches, three_month_change, yoy_change
       FROM keywords
      WHERE upload_id = ANY($1::uuid[])
        AND keyword IS NOT NULL AND keyword <> ''
        AND avg_monthly_searches IS NOT NULL`,
    [uploadIds],
  ).catch(() => ({ rows: [] as any[] }));

  if (kwRes.rows.length === 0) return null;

  // 3. Classify every row + bucket
  type Classified = KeywordRanking;
  const all: Classified[] = kwRes.rows.map((r: any) => ({
    keyword:          String(r.keyword),
    volume:           Number(r.avg_monthly_searches) || 0,
    intent:           classifyIntent({ keyword: r.keyword, briefBrand, briefCompetitors }),
    threeMonthChange: r.three_month_change != null ? Number(r.three_month_change) : null,
    yoyChange:        r.yoy_change != null ? Number(r.yoy_change) : null,
  }));

  const totalVolume = all.reduce((s, r) => s + r.volume, 0);

  // 4. Intent mix — count + volume share
  const buckets: Record<KeywordIntent, Classified[]> = {
    'brand-led':     [],
    'transactional': [],
    'informational': [],
    'category':      [],
  };
  for (const r of all) buckets[r.intent].push(r);

  const intentMix: KeywordIntentMix[] = (Object.keys(buckets) as KeywordIntent[])
    .map(intent => {
      const rows = buckets[intent];
      const vol = rows.reduce((s, r) => s + r.volume, 0);
      return {
        intent,
        count:       rows.length,
        volume:      vol,
        pctOfVolume: totalVolume > 0 ? (vol / totalVolume) * 100 : 0,
      };
    })
    .sort((a, b) => b.pctOfVolume - a.pctOfVolume);

  // 5. Ranked lists — sort by volume desc, take top N
  const byVolDesc = (a: Classified, b: Classified) => b.volume - a.volume;
  const topBranded       = [...buckets['brand-led']].sort(byVolDesc).slice(0, TOP_N);
  const topTransactional = [...buckets['transactional']].sort(byVolDesc).slice(0, TOP_N);
  const topInformational = [...buckets['informational']].sort(byVolDesc).slice(0, TOP_N);
  const topNonBranded    = all.filter(r => r.intent !== 'brand-led').sort(byVolDesc).slice(0, TOP_N);

  // 6. Trending — has a non-null three_month_change > 0, sorted desc
  const trending90d = all
    .filter(r => r.threeMonthChange != null && r.threeMonthChange > 0)
    .sort((a, b) => (b.threeMonthChange ?? 0) - (a.threeMonthChange ?? 0))
    .slice(0, TOP_N);

  return {
    totalKeywords:    all.length,
    totalVolume,
    intentMix,
    topBranded,
    topNonBranded,
    topTransactional,
    topInformational,
    trending90d,
    source:           'Google Keyword Planner',
    sourceUploads:    upRes.rows.map((r: any) => ({ id: r.id, filename: r.filename })),
  };
}
