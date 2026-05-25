/**
 * lib/insights/relabel.ts
 *
 * Per-brief audience label substitution. GWI exports use generic labels
 * ("Female", "Female 2", "Male 3") for custom audience slices. This module
 * substitutes them at render time with semantic labels the user defines
 * via the Data Mapper page (e.g. "Sargam | Females 25-34 | Suburban/Rural").
 *
 * Substitution happens at DISPLAY only — the database stores the original
 * GWI labels. Lets the user iterate on labels without burning Gemini tokens.
 *
 * Used by:
 *   • /insights page (card titles, obs, stat, rec, chart legends)
 *   • PPTX export pipeline
 *   • Nuggets + strategic bets cards
 */

export type AudienceLabelMap = Record<string, string>;  // original → display

/**
 * Replace audience labels in a text string. Uses word-boundary regex so
 * "Female 2" doesn't accidentally match inside "Female 25-34" or similar.
 *
 * Substitution is LONGEST-FIRST — so "Female 2" is replaced before "Female",
 * preventing "Female" from accidentally matching first and leaving a stray
 * " 2" suffix.
 */
export function relabelText(text: string, labels: AudienceLabelMap | null | undefined): string {
  if (!text || !labels) return text || '';
  const keys = Object.keys(labels).filter(k => k && labels[k]);
  if (keys.length === 0) return text;

  // Sort by length desc so longer patterns replace first ("Female 2" before "Female")
  const sortedKeys = [...keys].sort((a, b) => b.length - a.length);

  let out = text;
  for (const k of sortedKeys) {
    const replacement = labels[k];
    if (!replacement || replacement === k) continue;
    // Word-boundary escape: handle spaces/digits via lookbehind/lookahead on
    // word characters. This catches "Female 2" but NOT "Female 25-34".
    // We use the regex's word-boundary anchors at both ends — pattern itself
    // is escaped for regex specials.
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Boundary: start = lookbehind for non-word OR string-start.
    // End = lookahead for non-word (NOT a digit — "Female 2" should NOT
    // match inside "Female 25-34").
    const re = new RegExp(`(?<![\\w])${escaped}(?![\\w])`, 'g');
    out = out.replace(re, replacement);
  }
  return out;
}

/**
 * Walk a chart-data object and relabel any audience strings in its `labels`
 * array and series names. Mutates a shallow copy — does not mutate input.
 */
export function relabelChartData<T extends Record<string, any> | null | undefined>(
  data: T,
  labels: AudienceLabelMap | null | undefined,
): T {
  if (!data || !labels) return data;
  const copy: any = { ...data };
  // Common Chart.js / our pattern: top-level labels array
  if (Array.isArray(copy.labels)) {
    copy.labels = copy.labels.map((l: any) => typeof l === 'string' ? relabelText(l, labels) : l);
  }
  // Series-name patterns (datasets[].label OR seriesNames[])
  if (Array.isArray(copy.datasets)) {
    copy.datasets = copy.datasets.map((d: any) => ({
      ...d,
      label: typeof d?.label === 'string' ? relabelText(d.label, labels) : d?.label,
    }));
  }
  if (Array.isArray(copy.seriesNames)) {
    copy.seriesNames = copy.seriesNames.map((n: any) => typeof n === 'string' ? relabelText(n, labels) : n);
  }
  // Some charts use the keys "audienceA" / "audienceB" in the values array
  // with the audience string elsewhere — caller can extend if needed.
  return copy as T;
}

/**
 * Walk a whole `card` object and relabel every text field + chart data.
 * Returns a new card object — does not mutate input.
 */
export function relabelCard<T extends Record<string, any>>(
  card: T,
  labels: AudienceLabelMap | null | undefined,
): T {
  if (!labels) return card;
  return {
    ...card,
    title:             card.title             ? relabelText(card.title, labels) : card.title,
    obs:               card.obs               ? relabelText(card.obs, labels) : card.obs,
    stat:              card.stat              ? relabelText(card.stat, labels) : card.stat,
    rec:               card.rec               ? relabelText(card.rec, labels) : card.rec,
    computedChartData: card.computedChartData ? relabelChartData(card.computedChartData, labels) : card.computedChartData,
  };
}

/**
 * Walk every card on an analysis + relabel inline. Used by /insights page
 * + PPTX export to apply the label map across the whole output.
 */
export function relabelAnalysisCharts<T extends { charts?: any[] }>(
  results: T,
  labels: AudienceLabelMap | null | undefined,
): T {
  if (!labels || !results?.charts) return results;
  return {
    ...results,
    charts: results.charts.map(c => relabelCard(c, labels)),
  } as T;
}
