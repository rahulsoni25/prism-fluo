/**
 * Detects Helium10 export formats (Cerebro, Magnet, Black Box, etc.)
 */

const H10_CEREBRO_SIGNALS  = ['cerebro iq score', 'competing products', 'sponsored asin'];
const H10_MAGNET_SIGNALS   = ['magnet iq score', 'search volume', 'word count'];
const H10_BLACKBOX_SIGNALS = ['monthly revenue', 'monthly sales', 'review count', 'review rating'];
const H10_GENERIC_SIGNALS  = ['asin', 'helium 10', 'helium10'];

export type H10Variant = 'cerebro' | 'magnet' | 'blackbox' | 'generic';

export function isHelium10Format(headers: string[]): boolean {
  const lower = headers.map(h => String(h || '').toLowerCase());
  const hasAny = (signals: string[]) => signals.some(s => lower.some(h => h.includes(s)));
  return hasAny(H10_CEREBRO_SIGNALS) || hasAny(H10_MAGNET_SIGNALS) ||
         hasAny(H10_BLACKBOX_SIGNALS) || hasAny(H10_GENERIC_SIGNALS);
}

export function detectH10Variant(headers: string[]): H10Variant {
  const lower = headers.map(h => String(h || '').toLowerCase());
  const has = (s: string) => lower.some(h => h.includes(s));
  if (has('cerebro iq score')) return 'cerebro';
  if (has('magnet iq score'))  return 'magnet';
  if (has('monthly revenue') || has('monthly sales')) return 'blackbox';
  return 'generic';
}
