/**
 * Skill #1 — Run a full account audit.
 * Scans campaigns, keywords, search terms and tracking, and flags every issue
 * with a severity and a concrete recommendation.
 */
import { fetchGoogleAccount } from '../data/google.mjs';
import { fetchMetaAccount } from '../data/meta.mjs';

function finding(severity, area, issue, detail, recommendation) {
  return { severity, area, issue, detail, recommendation };
}

export default [
  {
    name: 'account_audit',
    title: 'Run a full account audit',
    description:
      'Full health scan of an ad account. For Google Ads it reviews campaigns, keywords, search terms and conversion tracking; for Meta it reviews campaigns and ad sets. Returns a prioritized list of findings (high/medium/low) with recommendations.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['google', 'meta'], description: 'Which platform to audit.' },
        accountId: { type: 'string', description: 'Google customer ID (digits) or Meta act_ id. Optional in demo mode.' },
        dateRange: { type: 'string', enum: ['last_7_days', 'last_14_days', 'last_30_days', 'this_month', 'last_month'], description: 'Google only. Defaults to last_30_days.' },
        cpaTarget: { type: 'number', description: 'Target CPA used to flag overspending entities. Defaults to 60.' },
      },
      required: ['platform'],
    },
    async handler(args, ctx) {
      const cpaTarget = args.cpaTarget ?? 60;
      return args.platform === 'meta'
        ? auditMeta(await fetchMetaAccount(ctx, { accountId: args.accountId }), cpaTarget)
        : auditGoogle(await fetchGoogleAccount(ctx, { customerId: args.accountId, dateRange: args.dateRange }), cpaTarget);
    },
  },
];

function auditGoogle(snap, cpaTarget) {
  const findings = [];
  const totalCost = round2(snap.campaigns.reduce((s, c) => s + c.cost, 0));
  const totalConv = snap.campaigns.reduce((s, c) => s + c.conversions, 0);

  // Tracking health.
  const t = snap.tracking || {};
  if (!t.autoTaggingEnabled) {
    findings.push(finding('high', 'tracking', 'Auto-tagging is OFF', 'Without auto-tagging, GCLID-based conversion import and GA4 attribution are unreliable.', 'Enable auto-tagging in Account Settings.'));
  }
  if (t.conversionTrackingStatus && /NOT_CONVERSION_TRACKED|NO_CONVERSION/i.test(t.conversionTrackingStatus)) {
    findings.push(finding('high', 'tracking', 'No conversion tracking detected', 'Bidding and optimization are flying blind without conversions.', 'Install a conversion action (purchase/lead) and verify it records.'));
  }

  // Zero-conversion spend on keywords.
  for (const k of snap.keywords) {
    if (k.conversions === 0 && k.cost >= 250) {
      findings.push(finding(k.cost >= 1000 ? 'high' : 'medium', 'keywords', `Keyword spending with zero conversions: "${k.text}"`, `${snap.currency} ${k.cost} spent, ${k.clicks} clicks, 0 conversions (${k.campaign} › ${k.adGroup}).`, `Pause or add as negative; "${k.text}" is pure waste this period.`));
    }
  }

  // Ad groups over CPA target.
  for (const ag of snap.adGroups) {
    if (ag.cpa != null && ag.cpa > cpaTarget) {
      findings.push(finding(ag.cpa > cpaTarget * 2 ? 'high' : 'medium', 'ad_groups', `Ad group above CPA target: ${ag.name}`, `CPA ${snap.currency} ${ag.cpa} vs target ${snap.currency} ${cpaTarget} (${ag.campaign}).`, 'Tighten targeting, refresh creative, or pause if it can\'t be fixed.'));
    }
  }

  // Wasteful search terms.
  for (const st of snap.searchTerms) {
    if (st.conversions === 0 && st.cost >= 150) {
      findings.push(finding('medium', 'search_terms', `Wasteful search term: "${st.term}"`, `${snap.currency} ${st.cost} on ${st.clicks} clicks, 0 conversions.`, `Add "${st.term}" as a negative keyword.`));
    }
  }

  return {
    _demo: snap._demo,
    platform: 'google',
    account: { id: snap.customerId, name: snap.accountName, currency: snap.currency },
    summary: {
      spend: totalCost,
      conversions: round2(totalConv),
      blendedCpa: totalConv > 0 ? round2(totalCost / totalConv) : null,
      findingCount: findings.length,
      bySeverity: countBy(findings, 'severity'),
    },
    findings: sortBySeverity(findings),
  };
}

function auditMeta(snap, cpaTarget) {
  const findings = [];
  const totalSpend = round2(snap.campaigns.reduce((s, c) => s + c.spend, 0));
  const totalResults = snap.campaigns.reduce((s, c) => s + c.results, 0);

  for (const as of snap.adsets) {
    if (as.results === 0 && as.spend >= 250) {
      findings.push(finding('high', 'ad_sets', `Ad set spending with zero results: ${as.name}`, `${snap.currency} ${as.spend} spent, 0 results (${as.campaign}).`, 'Pause this ad set or rebuild its audience/creative.'));
    } else if (as.cpa != null && as.cpa > cpaTarget) {
      findings.push(finding(as.cpa > cpaTarget * 2 ? 'high' : 'medium', 'ad_sets', `Ad set above CPA target: ${as.name}`, `CPA ${snap.currency} ${as.cpa} vs target ${snap.currency} ${cpaTarget}.`, 'Reduce budget, consolidate into a better performer, or pause.'));
    }
  }

  return {
    _demo: snap._demo,
    platform: 'meta',
    account: { id: snap.accountId, name: snap.accountName, currency: snap.currency },
    summary: {
      spend: totalSpend,
      results: totalResults,
      blendedCpa: totalResults > 0 ? round2(totalSpend / totalResults) : null,
      findingCount: findings.length,
      bySeverity: countBy(findings, 'severity'),
    },
    findings: sortBySeverity(findings),
  };
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const RANK = { high: 0, medium: 1, low: 2 };
function sortBySeverity(f) { return [...f].sort((a, b) => RANK[a.severity] - RANK[b.severity]); }
function countBy(arr, key) {
  return arr.reduce((acc, x) => { acc[x[key]] = (acc[x[key]] || 0) + 1; return acc; }, {});
}
