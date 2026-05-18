/**
 * lib/insights/helpers.js
 * Shared timestamp helpers used across the insights surface.
 * Pure, no React, safely importable from server + client code.
 */

export function fmtTs(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function timeAgo(ts) {
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Parse a McKinsey-discipline recommendation into Creative / Brand / Media
 * sub-actions if the label-prefixed structure is present. Returns null for
 * plain prose recommendations. Used by StrategicBetCard and the in-page
 * chart-card renderer.
 */
export function parseRecommendation(rec) {
  if (!rec || typeof rec !== 'string') return null;
  const text = rec.replace(/\s+/g, ' ').trim();

  const labels = ['creative', 'brand', 'media'];
  const re = /(?:^|[\s•\-*]+|\*\*)\s*(creative|brand|media)\s*[:—-]\s*/gi;
  const splits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    splits.push({ label: m[1].toLowerCase(), start: m.index, contentStart: m.index + m[0].length });
  }
  if (splits.length < 2) return null;

  const out = {};
  for (let i = 0; i < splits.length; i++) {
    const end = i + 1 < splits.length ? splits[i + 1].start : text.length;
    const content = text.slice(splits[i].contentStart, end)
      .replace(/[*•\-]+\s*$/, '')
      .trim();
    if (content) out[splits[i].label] = content;
  }
  const filled = labels.filter(k => out[k]).length;
  if (filled < 2) return null;
  return out;
}
