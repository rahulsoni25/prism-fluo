/**
 * Detects Konnect Insights export format.
 */

const KONNECT_SIGNALS = [
  'total mentions', 'positive mentions', 'negative mentions', 'neutral mentions',
  'sentiment score', 'konnect', 'share of voice', 'net sentiment'
];

export function isKonnectFormat(headers: string[]): boolean {
  const lower = headers.map(h => String(h || '').toLowerCase());
  const matchCount = KONNECT_SIGNALS.filter(s => lower.some(h => h.includes(s))).length;
  return matchCount >= 2;
}
