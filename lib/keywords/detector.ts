export function isKeywordPlan(headers: string[]): boolean {
  if (!headers || headers.length === 0) return false;

  const lower = headers.map(h => String(h || '').toLowerCase());
  const hasKeyword = lower.some(h => h === 'keyword');
  const hasAvgMonthly = lower.some(h => h.includes('avg. monthly searches'));

  const hasConcept = lower.some(h => h.startsWith('concept:'));
  const hasSearchesCol = lower.some(h => h.startsWith('searches:'));

  return hasKeyword && hasAvgMonthly && (hasConcept || hasSearchesCol);
}

/**
 * Detect a Google Keyword Planner CSV from already-decoded text (the upload
 * handler is responsible for stripping any UTF-16 BOM and decoding bytes to
 * a JS string before calling this).
 *
 * Signature:
 *   Line 1 — title row matching /Keyword (Stats|Plan|Ideas|Forecasts)/
 *   Line 3 — TAB-delimited header starting with "Keyword\tCurrency"
 *
 * Returns true ONLY when both anchors match — strict enough that ordinary
 * comma-separated CSVs and Excel keyword plans don't accidentally trip it.
 */
export function isGoogleKeywordPlanCsv(text: string): boolean {
  if (!text) return false;
  // Strip BOM (zero-width no-break space) if it survived decoding.
  const clean = text.replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).slice(0, 5);
  if (lines.length < 3) return false;

  const titleOK  = /^Keyword (Stats|Plan|Ideas|Forecasts)/i.test(lines[0].trim());
  const headerOK = /^Keyword\tCurrency/i.test(lines[2]);
  return titleOK && headerOK;
}
