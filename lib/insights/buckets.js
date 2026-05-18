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

// Float phase offsets must match .insight-card:nth-child delays in globals.css.
// Used by AnimatedCard to keep float stagger independent of fade-in stagger.
export const FLOAT_PHASE = [0.4, 0.9, 1.4, 1.9, 0.7, 1.2, 1.7, 1.0];
