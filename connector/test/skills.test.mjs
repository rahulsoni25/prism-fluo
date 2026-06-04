/**
 * Unit tests for the skills, exercised in demo mode (no credentials needed).
 * Run: node --test connector/test/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Force demo so these run anywhere, deterministically.
process.env.CONNECTOR_DEMO = '1';

const { toolList, buildContext, callSkill } = await import('../src/registry.mjs');
const ctx = buildContext();

test('registry exposes the six headline skills + power tools', () => {
  const names = toolList().map((t) => t.name);
  for (const n of [
    'list_ad_accounts', 'account_audit', 'find_wasted_spend',
    'pause_underperformers', 'add_negative_keywords', 'build_report',
    'schedule_task', 'google_ads_query', 'meta_ads_insights', 'ga4_run_report',
  ]) assert.ok(names.includes(n), `missing skill: ${n}`);
});

test('every tool has a valid name + object inputSchema', () => {
  for (const t of toolList()) {
    assert.match(t.name, /^[a-zA-Z0-9_-]{1,64}$/);
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.description.length > 10);
  }
});

test('list_ad_accounts returns demo accounts for both platforms', async () => {
  const r = await callSkill('list_ad_accounts', { platform: 'all' }, ctx);
  assert.ok(r.count >= 2);
  assert.ok(r.accounts.every((a) => a._demo === true));
  assert.deepEqual([...new Set(r.accounts.map((a) => a.platform))].sort(), ['google', 'meta']);
});

test('account_audit (google) flags zero-conversion spend and over-CPA groups', async () => {
  const r = await callSkill('account_audit', { platform: 'google', cpaTarget: 60 }, ctx);
  assert.equal(r.platform, 'google');
  assert.ok(r.summary.findingCount > 0);
  assert.ok(r.findings.some((f) => f.area === 'keywords'));
  // Findings are severity-sorted (high first).
  const ranks = { high: 0, medium: 1, low: 2 };
  const seq = r.findings.map((f) => ranks[f.severity]);
  assert.deepEqual(seq, [...seq].sort((a, b) => a - b));
});

test('find_wasted_spend respects minSpend / maxConversions and totals recoverable', async () => {
  const r = await callSkill('find_wasted_spend', { platform: 'google', minSpend: 500, maxConversions: 0 }, ctx);
  assert.ok(r.rows.every((row) => row.spend >= 500 && row.conversions <= 0));
  const sum = Math.round(r.rows.reduce((s, x) => s + x.spend, 0) * 100) / 100;
  assert.equal(r.recoverableSpend, sum);
});

test('pause_underperformers defaults to a dry run and never applies in demo', async () => {
  const r = await callSkill('pause_underperformers', { platform: 'google', cpaAbove: 60 }, ctx);
  assert.equal(r.dryRun, true);
  assert.equal(r.appliedCount, 0);
  assert.ok(r.matched >= 1);
  assert.ok(r.targets.every((t) => t.cpa > 60));
});

test('pause_underperformers does not apply even with dryRun=false in demo mode', async () => {
  const r = await callSkill('pause_underperformers', { platform: 'google', cpaAbove: 60, dryRun: false }, ctx);
  assert.equal(r.appliedCount, 0); // demo guards the write
  assert.equal(r._demo, true);
});

test('add_negative_keywords builds campaign×keyword operations across all campaigns', async () => {
  const r = await callSkill('add_negative_keywords', { keywords: ['free', 'jobs'], scope: 'all' }, ctx);
  assert.equal(r.operationsPlanned, r.campaignsTargeted.length * 2);
  assert.equal(r.operationsApplied, 0); // dry run + demo
});

test('add_negative_keywords throws on empty keyword list', async () => {
  await assert.rejects(() => callSkill('add_negative_keywords', { keywords: [] }, ctx));
});

test('build_report returns the requested number of slides with a cover + recommendations', async () => {
  const r = await callSkill('build_report', { platform: 'google', slides: 8 }, ctx);
  assert.equal(r.slideCount, 8);
  assert.equal(r.deck.slides[0].layout, 'cover');
  assert.ok(r.deck.slides.some((s) => s.layout === 'bullets' && /Recommendations/i.test(s.title)));
});

test('schedule_task persists and list/delete round-trips', async () => {
  const created = await callSkill('schedule_task', {
    name: 'Monday budget pacing', skill: 'account_audit', cadence: 'weekly', dayOfWeek: 'mon',
    args: { platform: 'google' }, alertIf: 'pacing > 110%',
  }, ctx);
  assert.ok(created.task.id);
  const list = await callSkill('list_scheduled_tasks', {}, ctx);
  assert.ok(list.tasks.some((t) => t.id === created.task.id));
  const del = await callSkill('delete_scheduled_task', { id: created.task.id }, ctx);
  assert.equal(del.removed, true);
});

test('export_deck_pptx is registered and errors clearly when PRISM_RENDER_URL is unset', async () => {
  assert.ok(toolList().some((t) => t.name === 'export_deck_pptx'));
  const deck = { title: 'T', slides: [{ layout: 'cover', title: 'T' }] };
  await assert.rejects(() => callSkill('export_deck_pptx', { deck }, ctx), /PRISM_RENDER_URL/);
});

test('unknown skill rejects with UNKNOWN_TOOL', async () => {
  await assert.rejects(() => callSkill('nope', {}, ctx), (e) => e.code === 'UNKNOWN_TOOL');
});
