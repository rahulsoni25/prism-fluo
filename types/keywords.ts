export interface KeywordRow {
  uploadId: string;
  sheetName: string;
  keyword: string;
  avgMonthlySearches: number | null;
  competition: string | null;
  competitionIndexed: number | null;
  bidLow: number | null;
  bidHigh: number | null;
  tier: 'Primary' | 'Secondary' | 'Tertiary';
  brand: string;
  categories: string;
  isPriceIntent: boolean;

  // ── Extended fields populated by the Google Keyword Planner CSV path
  // (UTF-16 TAB-delimited export). Optional so the older .xlsx flow that
  // produced the fields above keeps compiling. Newer analyses use these
  // to surface emerging-trend, ad-pressure and seasonality insights. ──
  currency?:               string;
  threeMonthChangePct?:    number | null;
  yoyChangePct?:           number | null;
  adImpressionShare?:      number | null; // % 0-100
  organicImpressionShare?: number | null;
  organicAvgPosition?:     number | null;
  inAccount?:              boolean | null;
  inPlan?:                 boolean | null;
  /** Month → search volume. Keys preserve Google's "Mon YYYY" labels (e.g. "Apr 2025"). */
  monthlySearches?:        Record<string, number>;
}
