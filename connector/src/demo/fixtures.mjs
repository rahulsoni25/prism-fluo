/**
 * fixtures.mjs — realistic sample data used when a platform has no credentials
 * (demo mode). Lets anyone see the connector work end-to-end the moment they
 * add it, with output that mirrors the live shape. Everything served from here
 * is flagged `_demo: true` upstream so it's never mistaken for live data.
 */

export const googleDemo = {
  customerId: '4863218790',
  accountName: 'Acme Home & Garden — Search',
  currency: 'USD',
  campaigns: [
    { id: '111', name: 'Brand — Exact', status: 'ENABLED', cost: 2840.55, conversions: 412, clicks: 9800, impressions: 142000 },
    { id: '222', name: 'Generic — Patio Furniture', status: 'ENABLED', cost: 9120.40, conversions: 88, clicks: 14200, impressions: 980000 },
    { id: '333', name: 'Competitor Conquesting', status: 'ENABLED', cost: 4310.00, conversions: 9, clicks: 6100, impressions: 410000 },
    { id: '444', name: 'DSA — Catch-all', status: 'ENABLED', cost: 1560.25, conversions: 31, clicks: 3300, impressions: 220000 },
  ],
  keywords: [
    { campaign: 'Generic — Patio Furniture', adGroup: 'Outdoor Sofas', text: 'outdoor sofa', matchType: 'BROAD', cost: 1840.0, conversions: 0, clicks: 2600 },
    { campaign: 'Generic — Patio Furniture', adGroup: 'Patio Sets', text: 'cheap patio set', matchType: 'BROAD', cost: 920.5, conversions: 0, clicks: 1500 },
    { campaign: 'Competitor Conquesting', adGroup: 'Brand X', text: 'wayfair patio', matchType: 'PHRASE', cost: 1310.0, conversions: 1, clicks: 1700 },
    { campaign: 'Generic — Patio Furniture', adGroup: 'Outdoor Sofas', text: 'outdoor sofa cushions replacement', matchType: 'EXACT', cost: 540.0, conversions: 18, clicks: 720 },
    { campaign: 'Brand — Exact', adGroup: 'Core Brand', text: 'acme patio furniture', matchType: 'EXACT', cost: 410.0, conversions: 96, clicks: 1900 },
  ],
  searchTerms: [
    { term: 'free patio furniture', matchedKeyword: 'patio furniture', cost: 312.4, conversions: 0, clicks: 540 },
    { term: 'patio furniture repair near me', matchedKeyword: 'patio furniture', cost: 188.0, conversions: 0, clicks: 260 },
    { term: 'how to clean outdoor sofa', matchedKeyword: 'outdoor sofa', cost: 240.0, conversions: 0, clicks: 410 },
    { term: 'acme patio coupon', matchedKeyword: 'acme patio furniture', cost: 96.0, conversions: 22, clicks: 300 },
  ],
  adGroups: [
    { campaign: 'Generic — Patio Furniture', name: 'Outdoor Sofas', cost: 2380.0, conversions: 18, cpa: 132.22 },
    { campaign: 'Competitor Conquesting', name: 'Brand X', cost: 1310.0, conversions: 1, cpa: 1310.0 },
    { campaign: 'Generic — Patio Furniture', name: 'Patio Sets', cost: 1640.5, conversions: 24, cpa: 68.35 },
    { campaign: 'Brand — Exact', name: 'Core Brand', cost: 410.0, conversions: 96, cpa: 4.27 },
    { campaign: 'DSA — Catch-all', name: 'Auto Targets', cost: 1560.25, conversions: 31, cpa: 50.33 },
  ],
  tracking: { conversionTrackingStatus: 'CONVERSION_TRACKING_MANAGED_BY_THIS_MANAGER', hasPhoneCalls: false, autoTaggingEnabled: false },
};

export const metaDemo = {
  accountId: 'act_209476611',
  accountName: 'Acme DTC — Prospecting',
  currency: 'USD',
  campaigns: [
    { id: 'c1', name: 'PROSP — Broad Advantage+', status: 'ACTIVE', spend: 6120.0, results: 142, cpa: 43.1, roas: 1.9 },
    { id: 'c2', name: 'PROSP — Interest Stack', status: 'ACTIVE', spend: 3380.0, results: 36, cpa: 93.9, roas: 0.7 },
    { id: 'c3', name: 'RETAR — 7d Site Visitors', status: 'ACTIVE', spend: 1450.0, results: 88, cpa: 16.5, roas: 4.4 },
  ],
  adsets: [
    { campaign: 'PROSP — Broad Advantage+', name: 'AA+ Open', spend: 6120.0, results: 142, cpa: 43.1, status: 'ACTIVE' },
    { campaign: 'PROSP — Interest Stack', name: 'Gardening | Home Decor', spend: 2010.0, results: 12, cpa: 167.5, status: 'ACTIVE' },
    { campaign: 'PROSP — Interest Stack', name: 'Lookalike 3%', spend: 1370.0, results: 24, cpa: 57.1, status: 'ACTIVE' },
    { campaign: 'RETAR — 7d Site Visitors', name: 'DPA 7d', spend: 1450.0, results: 88, cpa: 16.5, status: 'ACTIVE' },
  ],
};

export const ga4Demo = {
  propertyId: '345678901',
  rows: [
    { channel: 'Paid Search', sessions: 18400, conversions: 612, revenue: 84200 },
    { channel: 'Paid Social', sessions: 22100, conversions: 388, revenue: 51200 },
    { channel: 'Organic Search', sessions: 41200, conversions: 944, revenue: 132400 },
    { channel: 'Direct', sessions: 15800, conversions: 410, revenue: 71200 },
  ],
};
