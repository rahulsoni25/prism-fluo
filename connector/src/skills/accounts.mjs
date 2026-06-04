/**
 * Skill: list connected ad accounts across platforms.
 */
import { googleDemo, metaDemo } from '../demo/fixtures.mjs';

export default [
  {
    name: 'list_ad_accounts',
    title: 'List connected ad accounts',
    description:
      'List every Google Ads and Meta Ads account this connector can reach. Run this first to discover the account IDs the other skills need.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['all', 'google', 'meta'], description: 'Which platform(s) to list. Defaults to all.' },
      },
    },
    async handler(args, ctx) {
      const platform = args.platform || 'all';
      const out = { accounts: [] };

      if (platform === 'all' || platform === 'google') {
        if (ctx.isDemo('google')) {
          out.accounts.push({ platform: 'google', _demo: true, id: googleDemo.customerId, name: googleDemo.accountName, currency: googleDemo.currency });
        } else {
          const names = await ctx.clients.google.listAccessibleCustomers();
          for (const rn of names) out.accounts.push({ platform: 'google', id: rn.replace('customers/', ''), resourceName: rn });
        }
      }

      if (platform === 'all' || platform === 'meta') {
        if (ctx.isDemo('meta')) {
          out.accounts.push({ platform: 'meta', _demo: true, id: metaDemo.accountId, name: metaDemo.accountName, currency: metaDemo.currency });
        } else {
          const accts = await ctx.clients.meta.listAdAccounts();
          for (const a of accts) out.accounts.push({ platform: 'meta', id: `act_${a.account_id}`, name: a.name, currency: a.currency, status: a.account_status });
        }
      }

      out.count = out.accounts.length;
      return out;
    },
  },
];
