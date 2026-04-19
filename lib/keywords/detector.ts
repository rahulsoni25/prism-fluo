export function isKeywordPlan(headers: string[]): boolean {
  if (!headers || headers.length === 0) return false;
  
  const lower = headers.map(h => String(h || '').toLowerCase());
  const hasKeyword = lower.some(h => h === 'keyword');
  const hasAvgMonthly = lower.some(h => h.includes('avg. monthly searches'));
  
  const hasConcept = lower.some(h => h.startsWith('concept:'));
  const hasSearchesCol = lower.some(h => h.startsWith('searches:'));
  
  return hasKeyword && hasAvgMonthly && (hasConcept || hasSearchesCol);
}
