export function isGwiTimeSpentFormat(firstColumnValues: string[], headerRow: string[]): boolean {
  if (!headerRow || headerRow.length === 0) return false;
  
  const headerText = headerRow.join(' ').toLowerCase();
  const col0 = firstColumnValues.join(' ').toLowerCase();

  const hasAudience = (headerText.match(/audience %/g) || []).length >= 2;
  const hasDataPoint = headerText.includes('data point %');
  const hasUniverse = headerText.includes('universe');
  const hasIndex = headerText.includes('index');
  const hasResponses = headerText.includes('responses');
  
  // Broadened: detect ANY GWI question type with the canonical tabular
  // shape, not just time-spent. The parser uses inferQuestionType() to
  // classify what the rows actually measure (tv_genres, content_topics,
  // streaming_services, etc.) so downstream genre/interest nuggets can
  // target the right rows.
  const looksLikeGwi =
    col0.includes('source: gwi') ||
    col0.includes('time spent on social media') ||
    col0.includes('time spent in a typical day') ||
    /\btv (shows|genres|programmes)\b/.test(col0) ||
    /\bmusic genres\b/.test(col0) ||
    /\binterests\b.*\b(this question|gwi)\b/.test(col0) ||
    /\bstreaming services\b|\bsocial media (services|platforms|accounts)\b/.test(col0) ||
    /\bownership of devices\b|\bdevices used\b/.test(col0);

  return (hasAudience && hasDataPoint && hasUniverse && hasIndex && hasResponses) || looksLikeGwi;
}
