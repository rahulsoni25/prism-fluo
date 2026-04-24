/**
 * Detects Google Trends CSV export format.
 */

export function isGoogleTrendsFormat(firstColumnValues: string[], headers: string[]): boolean {
  const col0 = firstColumnValues.map(v => String(v || '').toLowerCase());
  const hdr  = headers.map(h => String(h || '').toLowerCase());

  const hasTrendsText = col0.some(v =>
    v.includes('interest over time') ||
    v.includes('google trends') ||
    v.includes('category:') ||
    v.includes('web search')
  );

  const hasDateAndValue =
    hdr.some(h => h.includes('week') || h.includes('date') || h.match(/\d{4}-\d{2}-\d{2}/) !== null) &&
    hdr.some(h => h.includes('interest') || h.match(/^[a-z\s]+:\s*(web search|youtube)/i) !== null);

  return hasTrendsText || hasDateAndValue;
}
