export function isGwiTimeSpentFormat(firstColumnValues: string[], headerRow: string[]): boolean {
  if (!headerRow || headerRow.length === 0) return false;
  
  const headerText = headerRow.join(' ').toLowerCase();
  const col0 = firstColumnValues.join(' ').toLowerCase();

  const hasAudience = (headerText.match(/audience %/g) || []).length >= 2;
  const hasDataPoint = headerText.includes('data point %');
  const hasUniverse = headerText.includes('universe');
  const hasIndex = headerText.includes('index');
  const hasResponses = headerText.includes('responses');
  
  const looksLikeGwi = 
    col0.includes('source: gwi') || 
    col0.includes('time spent on social media') || 
    col0.includes('time spent in a typical day');

  return (hasAudience && hasDataPoint && hasUniverse && hasIndex && hasResponses) || looksLikeGwi;
}
