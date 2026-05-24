/**
 * lib/admin/history-filters.ts
 *
 * Pure filter + count helpers used by the 3 admin history pages
 * (mapper / verification / export). No React, no DOM — testable as
 * plain functions.
 */

export type RangeKey = '24h' | '7d' | '30d' | '90d' | 'all';

const RANGE_MS: Record<Exclude<RangeKey, 'all'>, number> = {
  '24h': 24 * 3600_000,
  '7d':  7  * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
  '90d': 90 * 24 * 3600_000,
};

/**
 * Filter rows by `range` using a `dateField`. Falls back to common
 * alternative date-field names if the named field is missing on a row.
 */
export function filterByRange<T extends Record<string, any>>(
  rows: T[] | null | undefined,
  range: RangeKey,
  dateField: string,
): T[] {
  if (range === 'all' || !rows) return rows ?? [];
  const cutoff = Date.now() - RANGE_MS[range];
  return rows.filter(r => {
    const v = r[dateField] || r.createdAt || r.created_at || r.at || r.generatedAt;
    const t = v ? new Date(v).getTime() : 0;
    return t >= cutoff;
  });
}

/** Compute counts per range bucket for badge display in HistoryControls. */
export function rangeCounts<T extends Record<string, any>>(
  rows: T[] | null | undefined,
  dateField: string,
): Record<RangeKey, number> {
  const out: Record<RangeKey, number> = { '24h': 0, '7d': 0, '30d': 0, '90d': 0, all: rows?.length ?? 0 };
  if (!rows) return out;
  const now = Date.now();
  for (const r of rows) {
    const v = r[dateField] || r.createdAt || r.created_at || r.at || r.generatedAt;
    const age = now - (v ? new Date(v).getTime() : 0);
    if (age <= RANGE_MS['24h']) out['24h']++;
    if (age <= RANGE_MS['7d'])  out['7d']++;
    if (age <= RANGE_MS['30d']) out['30d']++;
    if (age <= RANGE_MS['90d']) out['90d']++;
  }
  return out;
}

/** Build a CSV string from a flat-row dataset. Used by HistoryControls's
 *  "Export CSV" button. Pure — easy to test. */
export function rowsToCsv<T extends Record<string, any>>(rows: T[]): string {
  if (!rows || rows.length === 0) return '';
  const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}))))
    .filter(k => typeof rows[0][k] !== 'object' || rows[0][k] === null);
  const esc = (v: any) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [keys.join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\r\n');
}
