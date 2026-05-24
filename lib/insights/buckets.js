/**
 * lib/insights/buckets.js
 * Bucket/tab configuration for the insights page. Pure constants + a
 * deterministic chart distributor — no React, no state.
 */

export const BUCKET_META = {
  content:       { label: '📝 Content Insights',       cls: 'content' },
  commerce:      { label: '🛒 Commerce Insights',      cls: 'commerce' },
  communication: { label: '📢 Communication Insights', cls: 'communication' },
  culture:       { label: '🌍 Culture Insights',        cls: 'culture' },
  channel:       { label: '📡 Channel Insights',       cls: 'channel' },
  media:         { label: '🎬 Media Insights',          cls: 'media' },
  creative:      { label: '🎨 Creative Insights',      cls: 'creative' },
  pricing:       { label: '💰 Pricing Insights',       cls: 'pricing' },
  search:        { label: '🔍 Search Insights',        cls: 'search' },
};

export const BUCKET_TABS = [
  { key: 'content',       label: '📝 Content' },
  { key: 'commerce',      label: '🛒 Commerce' },
  { key: 'communication', label: '📢 Communication' },
  { key: 'culture',       label: '🌍 Culture' },
  { key: 'channel',       label: '📡 Channel' },
  { key: 'media',         label: '🎬 Media' },
  { key: 'creative',      label: '🎨 Creative' },
  { key: 'pricing',       label: '💰 Pricing' },
  { key: 'search',        label: '🔍 Search' },
];

// Maps tool domain → human-readable badge shown on cards + tabs
export const SOURCE_BADGE_MAP = {
  // handler.ts tool keys
  gwi:                'GWI',
  'gwi household':    'GWI HOUSEHOLD',
  'gwi_household':    'GWI HOUSEHOLD',
  keywords:           'GOOGLE KEYWORDS',
  helium10:           'HELIUM10',
  trends:             'GOOGLE TRENDS',
  konnect:            'KONNECT INSIGHTS',
  // inference.ts domain labels
  'consumer insights':        'GWI',
  'search & seo':             'GOOGLE KEYWORDS',
  'sales & revenue':          'SALES DATA',
  'marketing & performance':  'MARKETING DATA',
  'social media intelligence':'SOCIAL DATA',
  'content performance':      'CONTENT DATA',
  'data intelligence':        'PRISM ANALYSIS',
  'pdf data':                 'PDF REPORT',
  'pdf_extract':              'PDF REPORT',
  prism:                      'PRISM ANALYSIS',
  'prism analysis':           'PRISM ANALYSIS',
  'user & product analytics': 'PRODUCT DATA',
  'multi-source':             'MULTI-SOURCE',
};

// Maps tool domain → primary PRISM bucket (fallback when chart.bucket is absent)
export const DOMAIN_TO_BUCKET = {
  gwi:                        'culture',
  keywords:                   'commerce',
  helium10:                   'commerce',
  trends:                     'culture',
  konnect:                    'communication',
  'consumer insights':        'culture',
  'search & seo':             'commerce',
  'sales & revenue':          'commerce',
  'marketing & performance':  'communication',
  'social media intelligence':'communication',
  'content performance':      'content',
  'data intelligence':        'content',
};

/**
 * Distribute charts using their pre-assigned chart.bucket field.
 * Falls back to primaryBucket for any chart that has no bucket tag.
 */
export function assignChartsToBuckets(charts, primaryBucket) {
  const result = {
    content: [], commerce: [], communication: [], culture: [],
    channel: [], media: [], creative: [], pricing: [], search: [],
  };
  charts.forEach(c => {
    const b = c.bucket && result[c.bucket] !== undefined ? c.bucket : primaryBucket;
    result[b].push(c);
  });
  return result;
}

// ── 4Cs roll-up (UI grouping) ────────────────────────────────────────────
// PRISM stores 9 granular buckets internally (preserves Gemini's tagging).
// The UI groups them into 4 parent tabs — Content / Commerce / Communication /
// Culture — to keep the experience focused. Each card still shows its
// granular bucket as a small pill, so power-users see the precise lane.
//
// Roll-up rules:
//   Content       ← content
//   Commerce      ← commerce + channel + pricing + search
//   Communication ← communication + creative
//   Culture       ← culture + media
//
// Why this split: spec says "tag by measured variable" — but for the UI we
// collapse along the dimension a client actually thinks in. A search-volume
// card is fundamentally a Commerce question ("what are people trying to
// buy?"); a creative-aesthetic card is fundamentally a Communication
// question ("what message lands?"). Power users open a card and see the
// granular pill (e.g. "SEARCH" or "CREATIVE") so the precision isn't lost.

export const GRANULAR_TO_PARENT = {
  content:       'content',
  commerce:      'commerce',
  channel:       'commerce',
  pricing:       'commerce',
  search:        'commerce',
  communication: 'communication',
  creative:      'communication',
  culture:       'culture',
  media:         'culture',
};

export const PARENT_BUCKETS = ['content', 'commerce', 'communication', 'culture'];

export const PARENT_BUCKET_META = {
  content:       { label: '📝 Content Insights',       cls: 'content',       blurb: 'Subject-matter demand: topics, themes, formats people engage with.' },
  commerce:      { label: '🛒 Commerce Insights',      cls: 'commerce',      blurb: 'Buying behaviour: shop, search, channel, pricing, conversion.' },
  communication: { label: '📢 Communication Insights', cls: 'communication', blurb: 'Message + execution: tone of voice, claims, visual craft.' },
  culture:       { label: '🌍 Culture Insights',        cls: 'culture',       blurb: 'Identity + media diet: who they are, what they consume.' },
};

export const PARENT_BUCKET_TABS = [
  { key: 'content',       label: '📝 Content' },
  { key: 'commerce',      label: '🛒 Commerce' },
  { key: 'communication', label: '📢 Communication' },
  { key: 'culture',       label: '🌍 Culture' },
];

/** Resolve a granular bucket to its 4Cs parent. Unknown buckets → content. */
export function granularToParent(bucket) {
  return GRANULAR_TO_PARENT[bucket] ?? 'content';
}

/**
 * Distribute charts into the 4 parent buckets while preserving each card's
 * granular bucket on the chart object (for the sub-bucket pill on the card).
 */
export function assignChartsToParentBuckets(charts, primaryBucket) {
  const result = { content: [], commerce: [], communication: [], culture: [] };
  charts.forEach(c => {
    const granular = c.bucket && GRANULAR_TO_PARENT[c.bucket]
      ? c.bucket
      : (primaryBucket && GRANULAR_TO_PARENT[primaryBucket] ? primaryBucket : 'content');
    const parent = GRANULAR_TO_PARENT[granular];
    result[parent].push({ ...c, granularBucket: granular });
  });
  return result;
}

// Float phase offsets must match .insight-card:nth-child delays in globals.css.
// Used by AnimatedCard to keep float stagger independent of fade-in stagger.
export const FLOAT_PHASE = [0.4, 0.9, 1.4, 1.9, 0.7, 1.2, 1.7, 1.0];
