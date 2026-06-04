/**
 * Skill #3 — Pause underperformers in bulk.
 * e.g. "pause all ad groups with CPA above $60 across all campaigns".
 *
 * Write action — guarded by a dryRun default of true so nothing is changed
 * until the caller explicitly confirms.
 */
import { fetchGoogleAccount } from '../data/google.mjs';
import { fetchMetaAccount } from '../data/meta.mjs';

export default [
  {
    name: 'pause_underperformers',
    title: 'Pause underperformers in bulk',
    description:
      'Bulk-pause every ad group (Google) or ad set (Meta) whose CPA is above a threshold across the whole account. Defaults to a DRY RUN that returns the exact entities that would be paused — set dryRun=false to actually pause them.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['google', 'meta'] },
        accountId: { type: 'string', description: 'Optional in demo mode.' },
        cpaAbove: { type: 'number', description: 'Pause entities with CPA strictly above this. Default 60.' },
        dryRun: { type: 'boolean', description: 'Preview only (default true). Set false to apply.' },
        dateRange: { type: 'string', enum: ['last_7_days', 'last_14_days', 'last_30_days', 'this_month', 'last_month'], description: 'Google only.' },
      },
      required: ['platform'],
    },
    async handler(args, ctx) {
      const cpaAbove = args.cpaAbove ?? 60;
      const dryRun = args.dryRun !== false; // default true

      if (args.platform === 'meta') {
        const snap = await fetchMetaAccount(ctx, { accountId: args.accountId });
        const targets = snap.adsets.filter((a) => a.cpa != null && a.cpa > cpaAbove);
        let applied = [];
        if (!dryRun && !snap._demo) {
          for (const a of targets) { await ctx.clients.meta.update(a.id, { status: 'PAUSED' }); applied.push(a.id); }
        }
        return result(snap._demo, 'meta', dryRun, cpaAbove, snap, targets.map((a) => ({ id: a.id, name: a.name, campaign: a.campaign, cpa: a.cpa, spend: a.spend })), applied);
      }

      const snap = await fetchGoogleAccount(ctx, { customerId: args.accountId, dateRange: args.dateRange });
      const targets = snap.adGroups.filter((ag) => ag.cpa != null && ag.cpa > cpaAbove);
      let applied = [];
      if (!dryRun && !snap._demo) {
        const res = await ctx.clients.google.pauseAdGroups(snap.customerId, targets.map((t) => t.resourceName));
        applied = res.map((r) => r.resourceName).filter(Boolean);
      }
      return result(snap._demo, 'google', dryRun, cpaAbove, snap, targets.map((ag) => ({ name: ag.name, campaign: ag.campaign, cpa: ag.cpa, spend: ag.cost, resourceName: ag.resourceName })), applied);
    },
  },
];

function result(demo, platform, dryRun, cpaAbove, snap, targets, applied) {
  const noun = platform === 'meta' ? 'ad sets' : 'ad groups';
  const willPause = demo ? 'would pause (demo — no live account)' : dryRun ? 'would pause (dry run)' : 'paused';
  return {
    _demo: demo,
    platform,
    dryRun: demo ? true : dryRun,
    criterion: `CPA > ${snap.currency} ${cpaAbove}`,
    account: { id: snap.customerId || snap.accountId, name: snap.accountName, currency: snap.currency },
    matched: targets.length,
    action: `${willPause} ${targets.length} ${noun}`,
    appliedCount: applied.length,
    targets,
    note: dryRun && !demo ? 'Nothing was changed. Re-run with dryRun=false to apply.' : undefined,
  };
}
