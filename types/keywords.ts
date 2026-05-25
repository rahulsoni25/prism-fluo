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
  /** Google Keyword Planner "Three month change" column (%, can be negative).
   *  Surfaced as "Trending queries (last 90 days)" in the intent nugget. */
  threeMonthChange?: number | null;
  /** Google Keyword Planner "YoY change" column (%, can be negative). */
  yoyChange?: number | null;
}
