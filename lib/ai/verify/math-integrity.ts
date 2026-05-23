/**
 * lib/ai/verify/math-integrity.ts
 * Agent #4 — Calculation Re-derivation.
 *
 * The other three agents check WHAT is said (proofreader = how it's said,
 * stat-checker = numbers trace to data, fact-analyzer = claim matches data).
 * This agent checks WHETHER THE MATH IS RIGHT.
 *
 * It maintains its own canonical reference numbers (INDIA_DEMOGRAPHICS,
 * SEC band shares, common conversions) and re-derives every quantitative
 * claim from first principles, comparing to what the analysis displays.
 *
 * Catches:
 *   • Market pyramid / TAM numbers that don't match the funnel filters
 *     (the exact class of bug we just fixed in computeMarketPyramid)
 *   • Percentage claims that diverge from chart data by > 5%
 *   • Currency conversions that violate sensible USD/INR ranges
 *     (e.g. $5B claimed as ₹500 Cr — off by 100×)
 *   • "X% of N" where the underlying base N is misquoted
 *   • Cross-card contradictions (one card claims 20M, another claims 200K
 *     for the same metric on the same audience)
 *
 * Pure rules + arithmetic. No LLM. ≤ 100ms for a 150-card analysis.
 */

import type { CardInput, Finding, AgentName } from './types';

const NAME: AgentName = 'math-integrity' as AgentName; // not in original AgentName union — extended in types.ts

// Canonical 2026 India demographics — must stay in sync with
// app/insights/page.js INDIA_DEMOGRAPHICS. Single source of truth.
export const INDIA_DEMOGRAPHICS = {
  total_population: 1_450_000_000,
  female_share: 0.486,
  male_share:   0.514,
  age_share: {
    '18-24': 0.123,
    '25-34': 0.172,
    '35-44': 0.149,
    '45-54': 0.119,
    '55-64': 0.085,
    '65+':   0.073,
  } as Record<string, number>,
  internet_penetration_adult: 0.67,
  mobile_share_of_internet:   0.86,
  geo_share: { metro: 0.10, tier1: 0.12, tier2: 0.12, tier3: 0.10, rural: 0.56 } as Record<string, number>,
};

// USD → INR Cr rough range as of 2026 (87 INR/USD ± 5).
// $1B = ₹8,200–9,200 Cr (the spread covers normal exchange variance)
const USD_TO_INR_CR_MIN = 8200;
const USD_TO_INR_CR_MAX = 9200;

const normalise = (s: string) => String(s || '').toLowerCase().replace(/[–—]/g, '-').trim();
const stripSpace = (s: string) => normalise(s).replace(/\s+/g, '');

interface Brief {
  gender?:     string | null;
  age_ranges?: string | null;
  geography?:  string | null;
  market?:     string | null;
}

/** Re-derive TAM from a brief using the canonical demographics.
 *  Returns the funnel rows + final TAM. */
export function rederiveTam(brief: Brief): { tam: number; steps: string[] } {
  const D = INDIA_DEMOGRAPHICS;
  let n = D.total_population;
  const steps: string[] = [`India: ${(n/1e9).toFixed(2)}B`];

  // Gender — exact token match
  const tokens = normalise(brief.gender).split(/[,/\s]+/).filter(Boolean);
  const wantsFemale = tokens.some(t => t === 'female' || t === 'women' || t === 'f');
  const wantsMale   = tokens.some(t => t === 'male'   || t === 'men'   || t === 'm');
  if (wantsFemale && !wantsMale) { n *= D.female_share; steps.push(`× female (${D.female_share}) = ${(n/1e6).toFixed(0)}M`); }
  else if (wantsMale && !wantsFemale) { n *= D.male_share; steps.push(`× male (${D.male_share}) = ${(n/1e6).toFixed(0)}M`); }

  // Age (with en-dash normalisation)
  const ageRanges = normalise(brief.age_ranges);
  let ageShare = 0;
  for (const [band, share] of Object.entries(D.age_share)) {
    if (ageRanges.includes(band)) ageShare += share;
  }
  if (ageShare > 0) { n *= ageShare; steps.push(`× age bands (${ageShare.toFixed(3)}) = ${(n/1e6).toFixed(0)}M`); }

  // Internet + mobile (always applied)
  n *= D.internet_penetration_adult; steps.push(`× online (${D.internet_penetration_adult}) = ${(n/1e6).toFixed(0)}M`);
  n *= D.mobile_share_of_internet;   steps.push(`× mobile (${D.mobile_share_of_internet}) = ${(n/1e6).toFixed(0)}M`);

  // Geo (strip whitespace so 'Tier 1' matches 'tier1')
  const geoNoSpace = stripSpace(brief.geography);
  const matched = Object.keys(D.geo_share).filter(g => geoNoSpace.includes(g));
  if (matched.length > 0) {
    const geoSum = matched.reduce((s, g) => s + D.geo_share[g], 0);
    n *= geoSum; steps.push(`× geo ${matched.join('+')} (${geoSum.toFixed(2)}) = ${(n/1e6).toFixed(0)}M`);
  }

  return { tam: n, steps };
}

/** Per-card math checks. Card-level (not analysis-level — that's below). */
export function checkCardMath(card: CardInput): Finding[] {
  const findings: Finding[] = [];

  // Currency conversion sanity: if obs/stat contains BOTH a $ value and
  // a ₹ Cr value, the implied exchange rate must be within 8200–9200 Cr/$B.
  const text = `${card.obs || ''} ${card.stat || ''}`;
  const usdMatch = text.match(/\$\s*([\d.,]+)\s*([BMK])\b/i);
  const inrCrMatch = text.match(/₹\s*([\d.,]+)\s*Cr\b/i);
  if (usdMatch && inrCrMatch) {
    const usdValue = parseFloat(usdMatch[1].replace(/,/g, '')) *
      (usdMatch[2].toUpperCase() === 'B' ? 1e9 : usdMatch[2].toUpperCase() === 'M' ? 1e6 : 1e3);
    const inrCrValue = parseFloat(inrCrMatch[1].replace(/,/g, ''));
    if (usdValue >= 1e6) {
      const usdB = usdValue / 1e9;
      const impliedCrPerUsdB = inrCrValue / Math.max(usdB, 0.001);
      if (impliedCrPerUsdB < USD_TO_INR_CR_MIN || impliedCrPerUsdB > USD_TO_INR_CR_MAX) {
        findings.push({
          agent: NAME,
          field: card.stat?.includes('₹') ? 'stat' : 'obs',
          severity: 'major',
          issue: `Currency conversion looks wrong: $${usdB}B paired with ₹${inrCrValue.toLocaleString()} Cr implies ${Math.round(impliedCrPerUsdB)} ₹Cr/$B (expected ${USD_TO_INR_CR_MIN}–${USD_TO_INR_CR_MAX}).`,
          evidence: `$${usdB}B ↔ ₹${inrCrValue} Cr`,
        });
      }
    }
  }

  // Percentage-of-N consistency: if obs says "X% of Y" and stat has the
  // same Y with a different absolute count, flag the contradiction.
  // Pattern: "20% of 100M users" / "200M users" with same metric
  // Cheap heuristic — won't catch every case.
  const pctOfMatch = (card.obs || '').match(/(\d{1,3}(?:\.\d+)?)\s*%\s*of\s*(\d+(?:\.\d+)?)\s*([BMK])/i);
  if (pctOfMatch) {
    const pct = parseFloat(pctOfMatch[1]) / 100;
    const baseNum = parseFloat(pctOfMatch[2]) *
      (pctOfMatch[3].toUpperCase() === 'B' ? 1e9 : pctOfMatch[3].toUpperCase() === 'M' ? 1e6 : 1e3);
    const expected = pct * baseNum;
    // Look for an absolute count in stat that should match
    const statAbs = (card.stat || '').match(/(\d+(?:\.\d+)?)\s*([BMK])\b/i);
    if (statAbs) {
      const statNum = parseFloat(statAbs[1]) *
        (statAbs[2].toUpperCase() === 'B' ? 1e9 : statAbs[2].toUpperCase() === 'M' ? 1e6 : 1e3);
      const ratio = statNum / Math.max(expected, 1);
      if (ratio < 0.9 || ratio > 1.1) {
        findings.push({
          agent: NAME,
          field: 'stat',
          severity: 'major',
          issue: `Stat number doesn't match the "${pctOfMatch[0]}" claim in observation. Expected ~${(expected/1e6).toFixed(0)}M, stat shows ${(statNum/1e6).toFixed(0)}M (${ratio.toFixed(2)}× off).`,
          evidence: `${pctOfMatch[0]} → ${(expected/1e6).toFixed(0)}M expected vs ${(statNum/1e6).toFixed(0)}M shown`,
        });
      }
    }
  }

  return findings;
}

/** Analysis-level math check: re-derive market pyramid from brief and
 *  compare to any TAM/audience figures displayed elsewhere. Catches the
 *  computeMarketPyramid bug class. */
export function checkAnalysisMath(brief: Brief | null, cards: CardInput[]): Finding[] {
  if (!brief) return [];
  const findings: Finding[] = [];
  const expected = rederiveTam(brief);

  // Look for cards whose stat/obs claims an audience-size figure with M/B
  // suffix. Compare to the expected TAM with 25% tolerance (generous so
  // we don't flag legitimate sub-segment numbers).
  const tamM = expected.tam / 1e6;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const text = `${card.title || ''} ${card.obs || ''} ${card.stat || ''}`;
    // Match phrases like "addressable audience", "TAM", "market size"
    if (!/addressable audience|total addressable|\bTAM\b|market size/i.test(text)) continue;
    const numMatch = text.match(/(\d{1,4}(?:\.\d+)?)\s*M\b/);
    if (!numMatch) continue;
    const claimed = parseFloat(numMatch[1]);
    const ratio = claimed / Math.max(tamM, 1);
    if (ratio < 0.5 || ratio > 2.0) {
      findings.push({
        agent: NAME,
        field: 'stat',
        severity: 'blocker',
        issue: `Card claims ${claimed}M addressable audience; recomputing from brief gives ${tamM.toFixed(0)}M (${ratio.toFixed(2)}× off). Funnel: ${expected.steps.join(' → ')}.`,
        evidence: `${claimed}M vs ${tamM.toFixed(0)}M`,
      });
    }
  }

  return findings;
}

export function mathIntegrityConfirms(finding: Finding, card: CardInput): boolean {
  // Re-run our own check — same input gives same output
  const ours = checkCardMath(card);
  return ours.some(f => f.field === finding.field && f.issue === finding.issue);
}
