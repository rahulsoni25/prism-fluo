/**
 * Skill #2 — Find wasted spend instantly.
 * e.g. "show me keywords with zero conversions that spent over $500 this month".
 */
import { fetchGoogleAccount } from '../data/google.mjs';
import { fetchMetaAccount } from '../data/meta.mjs';

export default [
  {
    name: 'find_wasted_spend',
    title: 'Find wasted spend instantly',
    description:
      'Surface the entities burning money with little or nothing to show for it. Filter by minimum spend and a maximum conversion/result threshold. Google ranks wasted keywords + search terms; Meta ranks wasted ad sets. Returns rows sorted by spend, plus the total recoverable amount.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['google', 'meta'] },
        accountId: { type: 'string', description: 'Optional in demo mode.' },
        minSpend: { type: 'number', description: 'Only include entities that spent at least this much. Default 500.' },
        maxConversions: { type: 'number', description: 'Treat anything at or below this many conversions/results as wasted. Default 0.' },
        dateRange: { type: 'string', enum: ['last_7_days', 'last_14_days', 'last_30_days', 'this_month', 'last_month'], description: 'Google only.' },
      },
      required: ['platform'],
    },
    async handler(args, ctx) {
      const minSpend = args.minSpend ?? 500;
      const maxConv = args.maxConversions ?? 0;

      if (args.platform === 'meta') {
        const snap = await fetchMetaAccount(ctx, { accountId: args.accountId });
        const rows = snap.adsets
          .filter((a) => a.spend >= minSpend && a.results <= maxConv)
          .map((a) => ({ type: 'ad_set', name: a.name, campaign: a.campaign, spend: a.spend, results: a.results }))
          .sort((a, b) => b.spend - a.spend);
        return wrap(snap._demo, 'meta', snap, rows, minSpend, maxConv);
      }

      const snap = await fetchGoogleAccount(ctx, { customerId: args.accountId, dateRange: args.dateRange });
      const keywords = snap.keywords
        .filter((k) => k.cost >= minSpend && k.conversions <= maxConv)
        .map((k) => ({ type: 'keyword', text: k.text, matchType: k.matchType, campaign: k.campaign, adGroup: k.adGroup, spend: k.cost, conversions: k.conversions, criterionResource: k.criterionResource }));
      const searchTerms = snap.searchTerms
        .filter((s) => s.cost >= minSpend && s.conversions <= maxConv)
        .map((s) => ({ type: 'search_term', term: s.term, campaign: s.campaign, spend: s.cost, conversions: s.conversions }));
      const rows = [...keywords, ...searchTerms].sort((a, b) => b.spend - a.spend);
      return wrap(snap._demo, 'google', snap, rows, minSpend, maxConv);
    },
  },
];

function wrap(demo, platform, snap, rows, minSpend, maxConv) {
  const recoverable = Math.round(rows.reduce((s, r) => s + r.spend, 0) * 100) / 100;
  const currency = snap.currency;
  return {
    _demo: demo,
    platform,
    account: { id: snap.customerId || snap.accountId, name: snap.accountName, currency },
    filter: { minSpend, maxConversions: maxConv },
    wastedCount: rows.length,
    recoverableSpend: recoverable,
    headline: rows.length
      ? `${rows.length} entit${rows.length === 1 ? 'y is' : 'ies are'} wasting ${currency} ${recoverable} — pause or negative them to recover it.`
      : `No entities matched (spend ≥ ${currency} ${minSpend}, conversions ≤ ${maxConv}). Clean account for this filter.`,
    rows,
  };
}
