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

// Maps tool domain → primary PRISM bucket (fallback when chart.bucket is absent
// AND classifyByVariable returns null). Kept for backward compat — the
// per-variable engine below is preferred. Updated to spec: keyword/trends
// data is SEARCH (not commerce/culture), GWI defaults to culture but
// classifyByVariable refines per-card.
export const DOMAIN_TO_BUCKET = {
  gwi:                        'culture',
  keywords:                   'search',         // spec: SEARCH-vs-ANY rule
  helium10:                   'commerce',
  trends:                     'search',         // spec: queries are search regardless of subject
  konnect:                    'communication',
  'consumer insights':        'culture',
  'search & seo':             'search',         // spec fix
  'sales & revenue':          'commerce',
  'marketing & performance':  'communication',
  'social media intelligence':'communication',
  'content performance':      'content',
  'data intelligence':        'content',
};

// ── Per-variable classifier (spec-aligned) ─────────────────────────────
// Inspects what a chart actually measures (title + tool label + chart shape)
// and returns the spec-correct bucket. Used as the primary fallback when a
// card has no explicit bucket. Returns null if it can't confidently classify
// — caller then falls back to DOMAIN_TO_BUCKET (which is a weaker hint).
//
// Rules below match the spec's "tag by measured variable" principle.
// Search-vs-Any takes priority — any active-query variable becomes 'search'.

const VARIABLE_RULES = [
  // ── SEARCH (active query axis — highest priority) ────────────────
  { match: /\b(search volume|monthly searches|keyword[s]?|quer(?:y|ies)|query trend|query intent|SEO|SERP|rising query|search intent|cpc|bid|impressions(?!\s+share)|keyword gap)\b/i, bucket: 'search' },
  { match: /\b(google trends|trend(?:ing)? quer|search demand|organic search|paid search)\b/i, bucket: 'search' },

  // ── MEDIA (consumption vehicle axis) ─────────────────────────────
  { match: /\b(account[s]? followed|followers|follow accounts|media diet|time spent on|hours per (week|day)|platforms? used|devices? used|screen time|streaming|podcast|OTT|gaming hours|app usage|YouTube subscribed|Instagram time|TikTok time|social feed|content formats? consumed)\b/i, bucket: 'media' },
  { match: /\b(media mix|ad placements|media spend|media investment|media planning|reach (and|&) frequency)\b/i, bucket: 'media' },

  // ── CHANNEL (brand touchpoint axis) ──────────────────────────────
  { match: /\b(distribution|retail vs DTC|marketplace mix|path[- ]to[- ]purchase|attribution model|paid\/owned\/earned|channel ROI|channel reach|sales channel|in[- ]store vs online)\b/i, bucket: 'channel' },

  // ── PRICING (price-value axis only) ──────────────────────────────
  { match: /\b(price (sensitivity|elasticity|point)|willingness to pay|WTP|premium vs (budget|value)|discount (strategy|response)|promo response|MRP|MSRP)\b/i, bucket: 'pricing' },
  { match: /\bCPC\b|\bcost per click\b/i, bucket: 'pricing' },

  // ── COMMUNICATION (verbal message axis) ──────────────────────────
  { match: /\b(brand (awareness|recall|trust|perception|sentiment|SOV|share of voice)|review(s)? sentiment|ad recall|NPS|word of mouth|message resonance|tone of voice|crisis signal)\b/i, bucket: 'communication' },
  { match: /\breview(s| count| volume)\b|\brating(s)?\b/i, bucket: 'communication' },

  // ── CREATIVE (visual execution axis) ─────────────────────────────
  { match: /\b(creative (asset|test|performance)|ad copy|A\/B test|visual identity|design cue|aesthetic|format craft)\b/i, bucket: 'creative' },

  // ── COMMERCE (purchase act axis) ─────────────────────────────────
  { match: /\b(units sold|revenue|BSR|best seller|conversion|basket|subscription|loyalty|purchase intent|cart|checkout|order frequency|repeat purchase|competitor (steal|share)|shelf (share|space))\b/i, bucket: 'commerce' },
  { match: /\b(quick wins|rising stars|competition (× |x )?cost)\b/i, bucket: 'commerce' },

  // ── CULTURE (identity axis) ──────────────────────────────────────
  { match: /\b(demographics|age (band|distribution|range)|gender (split|share)|income (band|segment)|lifestyle|values|attitudes|beliefs|aspirations|self[- ]perception|identity|cultural trend|sustainability values)\b/i, bucket: 'culture' },

  // ── CONTENT (subject-matter demand) ──────────────────────────────
  { match: /\b(theme cluster|topic interest|subject demand|listing title|A\+ content|headline test|content theme|long[- ]tail (topic|theme))\b/i, bucket: 'content' },
];

/**
 * Classify a chart into its spec-aligned bucket based on the MEASURED
 * VARIABLE (title + tool label inspection). Returns null if no rule
 * matches confidently — caller falls back to DOMAIN_TO_BUCKET.
 *
 * @param chart  Object with .title and optionally .toolLabel / .stat
 * @returns      Bucket string or null
 */
export function classifyByVariable(chart) {
  if (!chart) return null;
  const haystack = [
    chart.title,
    chart.toolLabel,
    chart.stat,
    chart.obs?.slice?.(0, 200), // first part of obs only (cheap)
  ].filter(Boolean).join(' ');
  for (const rule of VARIABLE_RULES) {
    if (rule.match.test(haystack)) return rule.bucket;
  }
  return null;
}

/**
 * Resolve a chart's bucket using the priority:
 *   1. chart.bucket (Gemini's explicit tag) if it's a valid value
 *   2. classifyByVariable() (per-variable spec rules)
 *   3. domainFallback (DOMAIN_TO_BUCKET[domain] — weakest hint)
 *   4. 'content' as ultimate fallback
 */
export function resolveCardBucket(chart, domain) {
  const VALID = ['content', 'commerce', 'communication', 'culture', 'channel', 'media', 'creative', 'pricing', 'search'];
  if (chart?.bucket && VALID.includes(chart.bucket)) return chart.bucket;
  const byVar = classifyByVariable(chart);
  if (byVar) return byVar;
  const byDomain = DOMAIN_TO_BUCKET[(domain || '').toLowerCase()];
  if (byDomain) return byDomain;
  return 'content';
}

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
 * Distribute charts into the 4 parent buckets. For each card:
 *   • If c.bucket is already a valid value, use it (preserves Gemini's tag)
 *   • Else run classifyByVariable() — spec-aligned per-variable rules
 *   • Else fall back to primaryBucket (domain hint)
 *   • Else default to 'content'
 * The chosen bucket is stamped on the card as `granularBucket` so the UI
 * sub-pill stays accurate regardless of which path resolved it.
 *
 * @param charts          Array of chart objects
 * @param primaryBucket   Domain-level fallback (one of the 9 granular buckets)
 */
export function assignChartsToParentBuckets(charts, primaryBucket) {
  const result = { content: [], commerce: [], communication: [], culture: [] };
  charts.forEach(c => {
    // Step 1: trust Gemini's explicit tag if valid
    let granular = c.bucket && GRANULAR_TO_PARENT[c.bucket] ? c.bucket : null;
    // Step 2: classify by measured variable (spec-aligned)
    if (!granular) granular = classifyByVariable(c);
    // Step 3: domain-level fallback (primaryBucket from DOMAIN_TO_BUCKET)
    if (!granular || !GRANULAR_TO_PARENT[granular]) {
      granular = primaryBucket && GRANULAR_TO_PARENT[primaryBucket] ? primaryBucket : 'content';
    }
    const parent = GRANULAR_TO_PARENT[granular];
    result[parent].push({ ...c, granularBucket: granular });
  });
  return result;
}

// Float phase offsets must match .insight-card:nth-child delays in globals.css.
// Used by AnimatedCard to keep float stagger independent of fade-in stagger.
export const FLOAT_PHASE = [0.4, 0.9, 1.4, 1.9, 0.7, 1.2, 1.7, 1.0];
