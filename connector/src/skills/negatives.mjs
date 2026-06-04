/**
 * Skill #4 — Add negative keywords at scale.
 * One command adds negatives across every campaign in the account.
 *
 * Write action — dryRun defaults to true.
 */
import { fetchGoogleAccount } from '../data/google.mjs';

export default [
  {
    name: 'add_negative_keywords',
    title: 'Add negative keywords at scale',
    description:
      'Add one or more negative keywords across many Google Ads campaigns at once. Either target specific campaigns by name, or pass scope="all" to apply to every campaign. Defaults to a DRY RUN — set dryRun=false to write.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Google customer ID (digits). Optional in demo mode.' },
        keywords: { type: 'array', items: { type: 'string' }, description: 'Negative keyword texts, e.g. ["free","repair","jobs"].' },
        matchType: { type: 'string', enum: ['EXACT', 'PHRASE', 'BROAD'], description: 'Default EXACT.' },
        scope: { type: 'string', enum: ['all'], description: 'Use "all" to apply to every campaign.' },
        campaigns: { type: 'array', items: { type: 'string' }, description: 'Campaign names to target (ignored if scope="all").' },
        dryRun: { type: 'boolean', description: 'Preview only (default true). Set false to apply.' },
      },
      required: ['keywords'],
    },
    async handler(args, ctx) {
      const matchType = (args.matchType || 'EXACT').toUpperCase();
      const dryRun = args.dryRun !== false;
      const texts = (args.keywords || []).map((k) => String(k).trim()).filter(Boolean);
      if (!texts.length) throw new Error('Provide at least one keyword.');

      const snap = await fetchGoogleAccount(ctx, { customerId: args.accountId });
      let targetCampaigns = snap.campaigns;
      if (args.scope !== 'all') {
        const want = new Set((args.campaigns || []).map((c) => c.toLowerCase()));
        if (want.size) targetCampaigns = snap.campaigns.filter((c) => want.has((c.name || '').toLowerCase()));
      }
      if (!targetCampaigns.length) throw new Error('No matching campaigns. Pass scope="all" or valid campaign names.');

      // Build the cartesian product of (campaign × keyword).
      const ops = [];
      for (const c of targetCampaigns) for (const text of texts) {
        ops.push({ campaign: c.resourceName, campaignName: c.name, text, matchType });
      }

      let applied = 0;
      if (!dryRun && !snap._demo) {
        const res = await ctx.clients.google.addNegativeKeywords(snap.customerId, ops);
        applied = res.filter((r) => r.resourceName).length;
      }

      return {
        _demo: snap._demo,
        platform: 'google',
        dryRun: snap._demo ? true : dryRun,
        account: { id: snap.customerId, name: snap.accountName },
        matchType,
        keywords: texts,
        campaignsTargeted: targetCampaigns.map((c) => c.name),
        operationsPlanned: ops.length,
        operationsApplied: applied,
        action: snap._demo
          ? `would add ${ops.length} negatives (demo)`
          : dryRun ? `would add ${ops.length} negatives (dry run)` : `added ${applied} negatives`,
        note: dryRun && !snap._demo ? 'Nothing was written. Re-run with dryRun=false to apply.' : undefined,
      };
    },
  },
];
