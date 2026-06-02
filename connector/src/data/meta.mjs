/**
 * data/meta.mjs — normalized Meta Ads data access (live Graph API or demo).
 */
import { metaDemo } from '../demo/fixtures.mjs';

const PURCHASE_TYPES = new Set([
  'purchase', 'omni_purchase', 'offsite_conversion.fct_purchase', 'onsite_conversion.purchase', 'lead', 'omni_lead',
]);
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

function resultsFromActions(row) {
  const actions = row.actions || [];
  let r = 0;
  for (const a of actions) if (PURCHASE_TYPES.has(a.action_type)) r += Number(a.value || 0);
  return r;
}

export async function fetchMetaAccount(ctx, { accountId, datePreset = 'last_30d' } = {}) {
  if (ctx.isDemo('meta')) {
    const d = metaDemo;
    return {
      _demo: true,
      accountId: d.accountId,
      accountName: d.accountName,
      currency: d.currency,
      campaigns: d.campaigns.map((c) => ({ ...c })),
      adsets: d.adsets.map((a) => ({ ...a })),
    };
  }

  const acct = accountId || ctx.config.meta.defaultAccountId;
  if (!acct) throw new Error('No accountId provided. Pass accountId (e.g. act_123) or set a default.');
  const m = ctx.clients.meta;

  const [campRows, adsetRows] = await Promise.all([
    m.insights(acct, { level: 'campaign', datePreset }),
    m.insights(acct, { level: 'adset', datePreset }),
  ]);

  const campaigns = campRows.map((r) => {
    const results = resultsFromActions(r);
    const spend = round2(r.spend);
    return { id: r.campaign_id, name: r.campaign_name, spend, results, cpa: results > 0 ? round2(spend / results) : null };
  });
  const adsets = adsetRows.map((r) => {
    const results = resultsFromActions(r);
    const spend = round2(r.spend);
    return { id: r.adset_id, name: r.adset_name, campaign: r.campaign_name, spend, results, cpa: results > 0 ? round2(spend / results) : null };
  });

  return { _demo: false, accountId: acct, accountName: acct, currency: ctx.config.currency, campaigns, adsets };
}
