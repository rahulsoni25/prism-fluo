/**
 * lib/ai/verify/brand-isolation.ts
 * Agent #6 — Brand Isolation.
 *
 * Catches the client-credibility-killing class of bug: a foreign brand
 * name (Ghadi / Surf Excel / Ariel / etc.) leaking into the output of
 * an analysis for a DIFFERENT brand. Two leak vectors:
 *
 *   1. Gemini few-shot examples in prompts contain branded text
 *      (we now scrub those to "BrandX" placeholders, but the model
 *      occasionally still copies brand names verbatim from training)
 *   2. Cached analyses incorrectly served across briefs (mitigated by
 *      SHA-256 dedup scoping but this agent is the structural guarantee)
 *
 * Rule set:
 *   • Every card SHOULD mention brief.brand in obs/stat/rec at least once
 *   • NO foreign brand from the curated FOREIGN_BRAND list may appear
 *     anywhere in the output (unless it's listed in brief.competitors)
 *   • Placeholder strings ("BrandX", "{BRAND_AUDIENCE}") must NEVER
 *     appear verbatim — that means Gemini didn't substitute the
 *     placeholder, shipped the template
 *
 * Severity:
 *   • blocker  — foreign brand leak / placeholder leak
 *   • major    — brand never mentioned across the whole analysis
 *   • minor    — brand mentioned but only in the title (not in obs/stat/rec)
 */

import type { CardInput, Finding, AgentName } from './types';

const NAME: AgentName = 'brand-isolation';

/** Cross-agent confirmation hook. Brand-isolation is analysis-level — it
 *  can't meaningfully confirm math or stat findings. But it WILL confirm
 *  any other agent's finding about brand naming / brand consistency /
 *  competitor leakage since that's its domain. */
export function brandIsolationConfirms(finding: Finding): boolean {
  // Proofreader has its own brand-stem check ("Sargam" capitalisation, etc.)
  // We confirm those because the spirit overlaps with our brand-isolation goal.
  if (finding.agent === 'proofreader' && /brand\s*(stem|name|spelling)|spelt|capitalis/i.test(finding.issue)) {
    return true;
  }
  // Fact-analyzer findings about a "brand mention" without context overlap with
  // our brand-mention-thin rule. Confirm those.
  if (finding.agent === 'fact-analyzer' && /\bbrand mention\b|\bbrand reference\b/i.test(finding.issue)) {
    return true;
  }
  return false;
}

/**
 * Curated list of common Indian + global brands that have appeared in
 * worked examples or could appear in training data. Used for "foreign
 * brand leak" detection — if any of these appear in output AND aren't
 * the brief's brand AND aren't listed competitors → blocker.
 */
const FOREIGN_BRANDS = [
  // Detergents — frequent worked examples
  'ghadi', 'sargam', 'ariel', 'surf excel', 'surf-excel',
  'nirma', 'rin', 'wheel', 'fena', 'tide',
  // Other FMCG often in templates
  'parle', 'britannia', 'amul', 'maggi', 'nestle',
  // Tech / commerce templates
  'nike', 'adidas', 'puma', 'reebok',
  // Common AI-template defaults
  'acme', 'foobar', 'example brand',
];

/**
 * Placeholder strings that should never reach a user. If Gemini outputs
 * any of these, it failed to substitute the template variable.
 */
const PLACEHOLDER_LEAKS = [
  'brandx', 'brand x', 'brand_x',
  '{brand}', '{brand_audience}', '{brand.name}',
  '${brand}', '${brief.brand}',
  '<brand>', '<your brand>',
];

/** Normalise a brand name to a canonical lowercased form for matching. */
function canon(s: string | null | undefined): string {
  return String(s || '').toLowerCase().replace(/[.,;:!?"'()]/g, '').replace(/\s+/g, ' ').trim();
}

/** Split a comma/semicolon-separated competitor list into tokens. */
function competitorTokens(raw: string | null | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    String(raw).split(/[,;]+/).map(s => canon(s)).filter(Boolean),
  );
}

export interface BrandIsolationInput {
  cards: CardInput[];
  briefBrand: string | null;
  briefCompetitors: string | null;
}

export interface BrandIsolationReport {
  agent: AgentName;
  findings: Finding[];
  /** Cards where the brief brand appears in obs/stat/rec — for stats. */
  cardsCitingBrand: number;
  /** Tokens flagged as foreign brand leaks. */
  foreignLeaks: string[];
  /** Placeholders that escaped templating. */
  placeholderLeaks: string[];
}

export function checkBrandIsolation(input: BrandIsolationInput): BrandIsolationReport {
  const findings: Finding[] = [];
  const briefBrand = canon(input.briefBrand);
  // Allowed strings: the full brief brand + each competitor name.
  // We check FOREIGN tokens against these via includes() in either
  // direction, so "ariel" in foreign list matches "Ariel India Pvt Ltd"
  // in competitors, and "Sargam Detergent" allows "sargam" foreign-list
  // entry to pass.
  const allowedFullStrings = [briefBrand, ...competitorTokens(input.briefCompetitors)]
    .filter(Boolean);
  const isAllowed = (foreign: string): boolean => {
    for (const a of allowedFullStrings) {
      if (a === foreign) return true;
      if (a.includes(foreign)) return true;   // "sargam detergent" contains "sargam"
      if (foreign.includes(a)) return true;   // foreign "surf excel" contains competitor "surf"
    }
    return false;
  };

  const foreignLeaks = new Set<string>();
  const placeholderLeaks = new Set<string>();
  let cardsCitingBrand = 0;

  for (const card of input.cards) {
    const fields: { field: 'title' | 'obs' | 'stat' | 'rec'; text: string }[] = [
      { field: 'title', text: card.title || '' },
      { field: 'obs',   text: (card.obs as any)   || '' },
      { field: 'stat',  text: (card.stat as any)  || '' },
      { field: 'rec',   text: (card.rec as any)   || '' },
    ];
    const combinedLower = fields.map(f => f.text).join(' ').toLowerCase();

    // ── Check 1: brief brand presence ──
    const brandMentioned = briefBrand && combinedLower.includes(briefBrand);
    if (brandMentioned) cardsCitingBrand++;

    // ── Check 2: foreign brand leaks ──
    for (const f of fields) {
      const textLower = f.text.toLowerCase();
      for (const foreign of FOREIGN_BRANDS) {
        // Use word-boundary regex (NOT includes()) so short brand tokens
        // like "rin" don't match inside common English words like
        // "exploRINg" / "duRINg" / "stiRRING". Multi-word brands
        // ("surf excel") allow flexible whitespace between words.
        const escaped = foreign.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const re = new RegExp(`\\b${escaped}\\b`, 'i');
        if (!re.test(f.text)) continue;
        if (isAllowed(foreign)) continue;  // brief's own brand or listed competitor
        foreignLeaks.add(foreign);
        findings.push({
          agent: NAME,
          severity: 'blocker',
          field: f.field,
          card_index: card.index,
          rule: 'foreign-brand-leak',
          issue: `Card ${card.index} ${f.field} contains foreign brand "${foreign}" — brief is for "${input.briefBrand || '(no brand set)'}" and "${foreign}" is not in competitors. Likely a Gemini leak from prompt examples.`,
          evidence: f.text.slice(0, 200),
        });
      }

      // ── Check 3: placeholder leaks ──
      for (const ph of PLACEHOLDER_LEAKS) {
        if (textLower.includes(ph)) {
          placeholderLeaks.add(ph);
          findings.push({
            agent: NAME,
            severity: 'blocker',
            field: f.field,
            card_index: card.index,
            rule: 'placeholder-leak',
            issue: `Card ${card.index} ${f.field} contains template placeholder "${ph}" — Gemini failed to substitute the brand variable. This will look broken to a client.`,
            evidence: f.text.slice(0, 200),
          });
        }
      }
    }
  }

  // ── Check 4: brand never appears anywhere (analysis-level) ──
  if (briefBrand && cardsCitingBrand === 0 && input.cards.length > 0) {
    findings.push({
      agent: NAME,
      severity: 'major',
      field: 'obs',
      card_index: 0,
      rule: 'brand-never-mentioned',
      issue: `Brief is for "${input.briefBrand}" but none of the ${input.cards.length} cards mention it in obs/stat/rec. The analysis reads as generic — clients expect their brand named.`,
      evidence: `0 of ${input.cards.length} cards cite "${input.briefBrand}"`,
    });
  }

  // ── Check 5: brand mentioned but weakly (only ≤25% of cards) ──
  if (briefBrand && input.cards.length >= 4) {
    const pct = (cardsCitingBrand / input.cards.length) * 100;
    if (cardsCitingBrand > 0 && pct < 25) {
      findings.push({
        agent: NAME,
        severity: 'minor',
        field: 'obs',
        card_index: 0,
        rule: 'brand-mention-thin',
        issue: `Brand "${input.briefBrand}" appears in only ${cardsCitingBrand} of ${input.cards.length} cards (${pct.toFixed(0)}%). Analysis would feel more grounded with the brand named on at least 50% of cards.`,
      });
    }
  }

  return {
    agent: NAME,
    findings,
    cardsCitingBrand,
    foreignLeaks: Array.from(foreignLeaks),
    placeholderLeaks: Array.from(placeholderLeaks),
  };
}
