/**
 * Skill #5 — Build reports and presentations.
 * e.g. "create an 8-slide audit deck with charts and recommendations".
 * Produces a structured deck spec (slides + chart specs) that any deck
 * generator can render — including PRISM's own PptxGenJS pipeline.
 */
import { fetchGoogleAccount } from '../data/google.mjs';
import { fetchMetaAccount } from '../data/meta.mjs';

export default [
  {
    name: 'build_report',
    title: 'Build reports and presentations',
    description:
      'Assemble a presentation-ready audit report from live account data: an executive summary, spend/conversion KPIs, top wasted spend, CPA outliers and prioritized recommendations. Returns a structured slide deck spec (title + bullets + chart spec per slide) ready to render to PPTX/Google Slides.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['google', 'meta'] },
        accountId: { type: 'string', description: 'Optional in demo mode.' },
        slides: { type: 'number', description: 'Target slide count (4-12). Default 8.' },
        cpaTarget: { type: 'number', description: 'Target CPA for outlier slides. Default 60.' },
      },
      required: ['platform'],
    },
    async handler(args, ctx) {
      const target = Math.min(12, Math.max(4, args.slides || 8));
      const cpaTarget = args.cpaTarget ?? 60;
      const snap = args.platform === 'meta'
        ? await fetchMetaAccount(ctx, { accountId: args.accountId })
        : await fetchGoogleAccount(ctx, { customerId: args.accountId });

      const entities = args.platform === 'meta' ? snap.adsets : snap.adGroups;
      const spendKey = args.platform === 'meta' ? 'spend' : 'cost';
      const resultKey = args.platform === 'meta' ? 'results' : 'conversions';
      const items = args.platform === 'meta' ? snap.campaigns : snap.campaigns;

      const totalSpend = round2(items.reduce((s, c) => s + (c[spendKey] || 0), 0));
      const totalResults = round2(items.reduce((s, c) => s + (c[resultKey] || 0), 0));
      const blendedCpa = totalResults > 0 ? round2(totalSpend / totalResults) : null;

      const wasted = entities
        .filter((e) => (e.cpa == null && (e[resultKey] || 0) === 0 && (e[spendKey] || 0) > 0) || (e.cpa != null && e.cpa > cpaTarget))
        .sort((a, b) => (b[spendKey] || 0) - (a[spendKey] || 0))
        .slice(0, 6);
      const recoverable = round2(wasted.reduce((s, e) => s + (e[spendKey] || 0), 0));

      const slides = [
        {
          layout: 'cover',
          title: `${snap.accountName} — ${args.platform === 'meta' ? 'Meta' : 'Google'} Ads Audit`,
          subtitle: `Spend ${snap.currency} ${totalSpend} · ${totalResults} ${args.platform === 'meta' ? 'results' : 'conversions'} · Blended CPA ${blendedCpa ?? 'n/a'}`,
        },
        {
          layout: 'kpi',
          title: 'Account at a glance',
          kpis: [
            { label: 'Spend', value: `${snap.currency} ${totalSpend}` },
            { label: args.platform === 'meta' ? 'Results' : 'Conversions', value: totalResults },
            { label: 'Blended CPA', value: blendedCpa != null ? `${snap.currency} ${blendedCpa}` : 'n/a' },
            { label: 'Recoverable', value: `${snap.currency} ${recoverable}` },
          ],
        },
        {
          layout: 'bar-chart',
          title: 'Spend by campaign',
          chart: { type: 'bar', labels: items.map((c) => c.name), series: [{ name: 'Spend', data: items.map((c) => round2(c[spendKey] || 0)) }] },
        },
        {
          layout: 'bar-chart',
          title: `Top wasted / over-CPA ${args.platform === 'meta' ? 'ad sets' : 'ad groups'}`,
          chart: { type: 'bar', labels: wasted.map((e) => e.name), series: [{ name: 'Spend', data: wasted.map((e) => round2(e[spendKey] || 0)) }] },
          bullets: wasted.map((e) => `${e.name}: ${snap.currency} ${round2(e[spendKey] || 0)}${e.cpa != null ? ` @ CPA ${e.cpa}` : ' · 0 results'}`),
        },
        {
          layout: 'bullets',
          title: 'Recommendations',
          bullets: buildRecs(args.platform, wasted, recoverable, snap, cpaTarget),
        },
        {
          layout: 'closing',
          title: 'Next steps',
          bullets: [
            `Recover ~${snap.currency} ${recoverable} by actioning the items above.`,
            'Re-audit in 7 days to confirm CPA movement.',
            'Schedule a weekly budget-pacing check (see schedule_task).',
          ],
        },
      ];

      // Pad/trim to the requested length with detail slides.
      while (slides.length < target) {
        slides.splice(slides.length - 1, 0, {
          layout: 'table',
          title: `${args.platform === 'meta' ? 'Ad set' : 'Ad group'} detail (${slides.length})`,
          rows: entities.slice((slides.length - 4) * 8, (slides.length - 4) * 8 + 8).map((e) => ({ name: e.name, spend: round2(e[spendKey] || 0), cpa: e.cpa })),
        });
      }
      const finalSlides = slides.slice(0, target);

      return {
        _demo: snap._demo,
        platform: args.platform,
        account: { id: snap.customerId || snap.accountId, name: snap.accountName, currency: snap.currency },
        slideCount: finalSlides.length,
        deck: { title: `${snap.accountName} — Ads Audit`, slides: finalSlides },
        recoverableSpend: recoverable,
      };
    },
  },
];

function buildRecs(platform, wasted, recoverable, snap, cpaTarget) {
  const recs = [];
  if (wasted.length) {
    recs.push(`Pause/restructure ${wasted.length} ${platform === 'meta' ? 'ad sets' : 'ad groups'} over CPA ${snap.currency} ${cpaTarget} to recover ~${snap.currency} ${recoverable}.`);
  }
  recs.push('Add negative keywords for non-converting search terms (use add_negative_keywords).');
  recs.push('Shift freed budget into the best-CPA campaigns.');
  recs.push('Tighten audience/match types on broad, low-intent entities.');
  return recs;
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
