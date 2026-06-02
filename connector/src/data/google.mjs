/**
 * data/google.mjs — normalized Google Ads data access. Returns the SAME shape
 * whether the rows come from a live GAQL query or from demo fixtures, so every
 * skill (audit, wasted-spend, pause, negatives, reports) shares one model.
 */
import { fromMicros } from '../platforms/google-ads.mjs';
import { googleDemo } from '../demo/fixtures.mjs';

const DATE_RANGES = {
  last_7_days: 'LAST_7_DAYS',
  last_14_days: 'LAST_14_DAYS',
  last_30_days: 'LAST_30_DAYS',
  this_month: 'THIS_MONTH',
  last_month: 'LAST_MONTH',
};
export function gaqlDuring(range) {
  return DATE_RANGES[(range || 'last_30_days').toLowerCase()] || 'LAST_30_DAYS';
}

const cpa = (cost, conv) => (conv > 0 ? round2(cost / conv) : null);
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/** Fetch a normalized snapshot of an account. */
export async function fetchGoogleAccount(ctx, { customerId, dateRange = 'last_30_days' } = {}) {
  if (ctx.isDemo('google')) return demoSnapshot();

  const cid = customerId || ctx.config.google.loginCustomerId;
  if (!cid) throw new Error('No customerId provided and GOOGLE_ADS_LOGIN_CUSTOMER_ID is not set.');
  const during = gaqlDuring(dateRange);
  const g = ctx.clients.google;

  const [campaignRows, keywordRows, stRows, adGroupRows, custRows] = await Promise.all([
    g.query(cid, `SELECT campaign.id, campaign.name, campaign.status, campaign.resource_name, metrics.cost_micros, metrics.conversions, metrics.clicks, metrics.impressions FROM campaign WHERE segments.date DURING ${during}`),
    g.query(cid, `SELECT campaign.name, campaign.resource_name, ad_group.name, ad_group.resource_name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.resource_name, metrics.cost_micros, metrics.conversions, metrics.clicks FROM keyword_view WHERE segments.date DURING ${during}`),
    g.query(cid, `SELECT search_term_view.search_term, campaign.name, ad_group.name, metrics.cost_micros, metrics.conversions, metrics.clicks FROM search_term_view WHERE segments.date DURING ${during}`),
    g.query(cid, `SELECT campaign.name, ad_group.name, ad_group.resource_name, metrics.cost_micros, metrics.conversions FROM ad_group WHERE segments.date DURING ${during}`),
    g.query(cid, `SELECT customer.descriptive_name, customer.currency_code, customer.auto_tagging_enabled, customer.conversion_tracking_setting.conversion_tracking_status FROM customer`),
  ]);

  const aggCampaign = aggregate(campaignRows, (r) => ({
    id: r.campaign?.id, resourceName: r.campaign?.resourceName, name: r.campaign?.name, status: r.campaign?.status,
  }), (r) => ({ ...metrics(r), impressions: Number(r.metrics?.impressions || 0) }));

  const aggKeyword = keywordRows.map((r) => ({
    campaign: r.campaign?.name, campaignResource: r.campaign?.resourceName,
    adGroup: r.adGroup?.name, adGroupResource: r.adGroup?.resourceName,
    criterionResource: r.adGroupCriterion?.resourceName,
    text: r.adGroupCriterion?.keyword?.text, matchType: r.adGroupCriterion?.keyword?.matchType,
    ...metrics(r),
  }));

  const aggSearchTerms = stRows.map((r) => ({
    term: r.searchTermView?.searchTerm, campaign: r.campaign?.name, adGroup: r.adGroup?.name, ...metrics(r),
  }));

  const aggAdGroups = aggregate(adGroupRows, (r) => ({
    campaign: r.campaign?.name, name: r.adGroup?.name, resourceName: r.adGroup?.resourceName,
  }), metrics);

  const c = custRows[0]?.customer || {};
  const tracking = {
    descriptiveName: c.descriptiveName,
    currencyCode: c.currencyCode,
    autoTaggingEnabled: c.autoTaggingEnabled,
    conversionTrackingStatus: c.conversionTrackingSetting?.conversionTrackingStatus,
  };

  return {
    _demo: false,
    customerId: cid,
    accountName: tracking.descriptiveName || cid,
    currency: tracking.currencyCode || ctx.config.currency,
    campaigns: withCpa(aggCampaign),
    keywords: withCpa(aggKeyword),
    searchTerms: withCpa(aggSearchTerms),
    adGroups: withCpa(aggAdGroups),
    tracking,
  };
}

function metrics(r) {
  return {
    cost: fromMicros(r.metrics?.costMicros),
    conversions: Number(r.metrics?.conversions || 0),
    clicks: Number(r.metrics?.clicks || 0),
  };
}

function aggregate(rows, keyFn, metricFn) {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    const id = JSON.stringify(key);
    const m = metricFn(r);
    const cur = map.get(id) || { ...key, cost: 0, conversions: 0, clicks: 0, impressions: 0 };
    cur.cost += m.cost || 0;
    cur.conversions += m.conversions || 0;
    cur.clicks += m.clicks || 0;
    cur.impressions += m.impressions || 0;
    map.set(id, cur);
  }
  return [...map.values()].map((v) => ({ ...v, cost: round2(v.cost) }));
}

function withCpa(rows) {
  return rows.map((r) => ({ ...r, cpa: cpa(r.cost, r.conversions) }));
}

function demoSnapshot() {
  const d = googleDemo;
  const syn = (prefix, i) => `customers/${d.customerId}/${prefix}/${1000 + i}`;
  return {
    _demo: true,
    customerId: d.customerId,
    accountName: d.accountName,
    currency: d.currency,
    campaigns: withCpa(d.campaigns.map((c, i) => ({ ...c, resourceName: syn('campaigns', i) }))),
    keywords: withCpa(d.keywords.map((k, i) => ({
      ...k,
      campaignResource: syn('campaigns', i),
      adGroupResource: syn('adGroups', i),
      criterionResource: syn('adGroupCriteria', i),
    }))),
    searchTerms: withCpa(d.searchTerms),
    adGroups: withCpa(d.adGroups.map((a, i) => ({ ...a, resourceName: syn('adGroups', i) }))),
    tracking: d.tracking,
  };
}
