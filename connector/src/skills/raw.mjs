/**
 * Power tools — raw passthrough to each platform for anything the curated
 * skills don't cover. These are the escape hatch that makes the connector
 * genuinely open-ended ("ask Claude anything about the account").
 */
import { googleDemo, ga4Demo } from '../demo/fixtures.mjs';

export default [
  {
    name: 'google_ads_query',
    title: 'Run a raw GAQL query',
    description:
      'Run an arbitrary Google Ads Query Language (GAQL) SELECT against an account and return the raw rows. Use for anything the higher-level skills don\'t cover.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: { type: 'string', description: 'Google customer ID (digits). Optional in demo mode.' },
        gaql: { type: 'string', description: 'A GAQL SELECT statement.' },
      },
      required: ['gaql'],
    },
    async handler(args, ctx) {
      if (ctx.isDemo('google')) {
        return { _demo: true, note: 'Demo mode — returning sample campaign rows; live mode runs your GAQL verbatim.', query: args.gaql, rows: googleDemo.campaigns };
      }
      const cid = args.accountId || ctx.config.google.loginCustomerId;
      const rows = await ctx.clients.google.query(cid, args.gaql);
      return { _demo: false, query: args.gaql, rowCount: rows.length, rows };
    },
  },
  {
    name: 'meta_ads_insights',
    title: 'Get Meta Ads insights',
    description: 'Fetch Meta Ads insights for an account/campaign/ad set/ad at a chosen level and date preset.',
    inputSchema: {
      type: 'object',
      properties: {
        objectId: { type: 'string', description: 'Object id, e.g. act_123, or a campaign/adset/ad id.' },
        level: { type: 'string', enum: ['account', 'campaign', 'adset', 'ad'], description: 'Default campaign.' },
        datePreset: { type: 'string', description: 'e.g. last_7d, last_30d, this_month. Default last_30d.' },
      },
    },
    async handler(args, ctx) {
      if (ctx.isDemo('meta')) {
        const { metaDemo } = await import('../demo/fixtures.mjs');
        return { _demo: true, note: 'Demo mode — sample insights.', level: args.level || 'campaign', rows: metaDemo.campaigns };
      }
      const objectId = args.objectId || ctx.config.meta.defaultAccountId;
      const rows = await ctx.clients.meta.insights(objectId, { level: args.level || 'campaign', datePreset: args.datePreset || 'last_30d' });
      return { _demo: false, level: args.level || 'campaign', rowCount: rows.length, rows };
    },
  },
  {
    name: 'ga4_run_report',
    title: 'Run a GA4 report',
    description: 'Run a Google Analytics 4 report (runReport) — metrics and dimensions over a date range. Pairs ad spend with on-site outcomes.',
    inputSchema: {
      type: 'object',
      properties: {
        propertyId: { type: 'string', description: 'GA4 property id (digits). Optional in demo mode.' },
        metrics: { type: 'array', items: { type: 'string' }, description: 'e.g. ["sessions","conversions","totalRevenue"].' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'e.g. ["sessionDefaultChannelGroup"].' },
        startDate: { type: 'string', description: 'e.g. 30daysAgo or 2026-05-01. Default 30daysAgo.' },
        endDate: { type: 'string', description: 'e.g. today. Default today.' },
      },
    },
    async handler(args, ctx) {
      if (ctx.isDemo('ga4')) {
        return { _demo: true, note: 'Demo mode — sample channel report.', rows: ga4Demo.rows };
      }
      const pid = args.propertyId || ctx.config.ga4.defaultPropertyId;
      if (!pid) throw new Error('Provide propertyId or set GA4_PROPERTY_ID.');
      const report = await ctx.clients.ga4.runReport(pid, {
        metrics: args.metrics,
        dimensions: args.dimensions || [],
        dateRanges: [{ startDate: args.startDate || '30daysAgo', endDate: args.endDate || 'today' }],
      });
      return { _demo: false, report };
    },
  },
];
