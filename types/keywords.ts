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
}
