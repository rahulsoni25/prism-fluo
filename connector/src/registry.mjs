/**
 * registry.mjs — collect every skill into one tool list and build the runtime
 * context (platform clients, demo detection) handed to each handler.
 *
 * Adding a skill = drop a module in src/skills/ and import it here. The curated
 * set ships ~12 tools; the raw passthrough tools make it open-ended. (The
 * marketing "300+ skills" = the full surface of GAQL + Graph + GA4 reachable
 * through these, plus the registry pattern for adding more.)
 */
import config, { isDemo } from './config.mjs';
import { GoogleAdsClient } from './platforms/google-ads.mjs';
import { MetaAdsClient } from './platforms/meta-ads.mjs';
import { Ga4Client } from './platforms/ga4.mjs';

import accounts from './skills/accounts.mjs';
import audit from './skills/audit.mjs';
import wastedSpend from './skills/wasted-spend.mjs';
import pause from './skills/pause.mjs';
import negatives from './skills/negatives.mjs';
import reports from './skills/reports.mjs';
import schedule from './skills/schedule.mjs';
import raw from './skills/raw.mjs';
import exportDeck from './skills/export.mjs';

const MODULES = [accounts, audit, wastedSpend, pause, negatives, reports, schedule, raw, exportDeck];

/** Flat array of skill definitions, with uniqueness enforced. */
export const skills = (() => {
  const seen = new Set();
  const all = [];
  for (const mod of MODULES) {
    for (const s of mod) {
      if (seen.has(s.name)) throw new Error(`Duplicate skill name: ${s.name}`);
      seen.add(s.name);
      all.push(s);
    }
  }
  return all;
})();

/** The MCP-facing tool list (name/title/description/inputSchema only). */
export function toolList() {
  return skills.map((s) => ({
    name: s.name,
    title: s.title,
    description: s.description,
    inputSchema: s.inputSchema || { type: 'object', properties: {} },
  }));
}

/** Runtime context shared by all handlers. Clients are created once. */
export function buildContext(cfg = config) {
  const clients = {
    google: new GoogleAdsClient(cfg.google, { timeoutMs: cfg.httpTimeoutMs }),
    meta: new MetaAdsClient(cfg.meta, { timeoutMs: cfg.httpTimeoutMs }),
    ga4: new Ga4Client(cfg.ga4, { timeoutMs: cfg.httpTimeoutMs }),
  };
  return {
    config: cfg,
    clients,
    isDemo: (platform) => isDemo(cfg, platform),
    log: (...a) => process.stderr.write(`[connector] ${a.join(' ')}\n`),
  };
}

const byName = new Map(skills.map((s) => [s.name, s]));

/** Execute a skill by name. Returns the handler's result object. */
export async function callSkill(name, args, ctx) {
  const skill = byName.get(name);
  if (!skill) {
    const err = new Error(`Unknown tool: ${name}`);
    err.code = 'UNKNOWN_TOOL';
    throw err;
  }
  return skill.handler(args || {}, ctx);
}
