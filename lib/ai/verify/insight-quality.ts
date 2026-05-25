/**
 * lib/ai/verify/insight-quality.ts
 * Agent #7 — Insight Quality / Strategist gate.
 *
 * Catches the cards that are technically valid (no foreign brand, math
 * checks out, no jargon) but are STILL not deck-worthy:
 *   • "The audience values trust" — no number, no bite
 *   • "Continue monitoring this trend" — no verb, no action
 *   • "Drive engagement through digital channels" — no platform, no specificity
 *   • "The data shows that…" — dead opener
 *   • Conviction 92 on a card with zero numbers — inflated self-grade
 *
 * Seven rules total. Designed to be MECHANICAL (no LLM round-trip,
 * fast, deterministic) so it can run on every card without budget impact.
 *
 * Severity tuning (initial release): the harder/fuzzier rules ship at
 * `major` so we can observe what they catch on real briefs before
 * promoting to `blocker`. The mechanical rules (datapoint density,
 * action verb, generic opener) ship at `major` immediately.
 */

import type { CardInput, Finding, AgentName } from './types';

const NAME: AgentName = 'insight-quality';

// ── Vocabulary ─────────────────────────────────────────────────────────

/** Imperative action verbs a recommendation SHOULD open with. A rec
 *  starting with "Continue", "Consider", "Explore" is dead weight. */
const ACTION_VERBS = [
  'build', 'launch', 'run', 'drop', 'kill', 'replace', 'shift', 'test',
  'bid', 'stop', 'start', 'cut', 'double', 'pivot', 'reframe', 'rebrand',
  'reposition', 'pilot', 'ship', 'invest', 'reallocate', 'shoot', 'film',
  'produce', 'partner', 'sponsor', 'amplify', 'seed', 'flight', 'block',
  'whitelist', 'blacklist', 'negotiate', 'audit', 'rewrite', 'redesign',
  'collapse', 'consolidate', 'expand', 'localise', 'localize',
];

/** Dead opener patterns — observation should never begin with these. */
const DEAD_OPENERS = [
  'the data shows',
  'the data indicates',
  'this demonstrates',
  'this indicates',
  'interestingly',
  'notably',
  'it is important to note',
  'it should be noted',
  'it is worth noting',
  'it is interesting',
  'it is observed',
  'data suggests',
  'the analysis reveals',
  'the analysis shows',
  'findings indicate',
  'findings show',
  'this suggests',
  'the audience demonstrates',
  'the audience engages',
  'the audience shows',
];

/** Specific-enough nouns for a rec — platforms / formats / timeframes /
 *  measurable creative angles. Recs naming AT LEAST ONE of these read
 *  actionable. (Proofreader already enforces platform-or-format on a
 *  separate path; this one is stricter — checks for any concrete noun.) */
const CONCRETE_NOUNS = [
  // Platforms (subset — proofreader has fuller list)
  'youtube', 'reels', 'shorts', 'instagram', 'sharechat', 'moj', 'hotstar',
  'jiocinema', 'meesho', 'flipkart', 'amazon', 'whatsapp', 'facebook',
  'twitter', 'x.com', 'tiktok', 'spotify', 'snapchat', 'linkedin',
  'pinterest', 'blinkit', 'zepto', 'swiggy', 'instamart', 'sonyliv',
  'zee5', 'voot', 'prime video',
  // Formats
  'reel', 'pre-roll', 'preroll', 'mid-roll', 'carousel', 'short video',
  'long-form', 'long form', 'search ad', 'display ad', 'shoppable',
  'tutorial', 'unboxing', 'before/after', 'episode', 'podcast', 'livestream',
  'native ad', 'banner', 'interstitial',
  // Timeframes (a rec with "Q3", "30 days", "festive season" is actionable)
  'q1', 'q2', 'q3', 'q4', 'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
  '7 days', '14 days', '30 days', '60 days', '90 days', 'this month',
  'next month', 'next quarter', 'festive', 'diwali', 'holi', 'eid', 'ipl',
  // Measurable creative angles
  'voice-over', 'voiceover', 'first 3 sec', 'first 9 sec', 'thumbnail',
  'cta', 'call-to-action', 'headline a/b', 'a/b test', 'split test',
];

/** Tension hinge words in titles — "but / yet / still / not / —" patterns
 *  signal narrative tension. Titles without ANY hinge OR vivid image
 *  often read as deck-speak. */
const TENSION_HINGES = [
  ' but ', ' yet ', ' still ', ' not ', ' however ', ' though ',
  '—', '–', ':',
];

// ── Helpers ────────────────────────────────────────────────────────────

/** Detect at least one specific number-like token (5%, ₹14Cr, 3×, 234, +47bps). */
function hasNumber(text: string): boolean {
  if (!text) return false;
  return /(\d+(?:\.\d+)?\s*%|\d+(?:\.\d+)?\s*[×x]|\d+\s*(?:bps|cr|lakh|mn|bn|k|m)\b|₹\s*\d|[$£€]\s*\d|\d{2,}\s|\d+(?:\.\d+)?\s*pts?|\d+(?:st|nd|rd|th)\b)/i.test(text);
}

/** True if `s` starts with a known imperative action verb (case-insensitive). */
function startsWithAction(s: string): boolean {
  if (!s) return false;
  const firstWord = s.trim().split(/\s+/)[0]?.toLowerCase().replace(/[.,;:!?]+$/, '');
  if (!firstWord) return false;
  return ACTION_VERBS.includes(firstWord);
}

/** Did this string begin with one of the dead-opener phrases? */
function startsWithDeadOpener(s: string): boolean {
  if (!s) return false;
  const lower = s.trim().toLowerCase().slice(0, 60);
  return DEAD_OPENERS.some(p => lower.startsWith(p));
}

/** Does the text mention at least one concrete noun (platform/format/timeframe)? */
function hasConcreteNoun(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return CONCRETE_NOUNS.some(n => lower.includes(n));
}

/** Does the title carry a tension hinge OR a vivid image (e.g. "Reels at 11pm",
 *  "Blinkit grid", "Cricket ad")? A title with any concrete noun (platform,
 *  format, time of day, place name, cultural moment) counts as vivid. */
function hasTensionOrImage(title: string): boolean {
  if (!title) return false;
  const lower = ` ${title.toLowerCase()} `;
  if (TENSION_HINGES.some(h => lower.includes(h))) return true;
  // Vivid time/place/cultural-moment
  if (/\b(\d+(am|pm)|prime time|metro|tier ?\d|delhi|mumbai|bangalore|chennai|kolkata|hyderabad|pune|monsoon|festive|diwali|holi|eid|cricket|ipl|world cup|onam|rakhi)\b/i.test(title)) return true;
  // Concrete noun (platform / format / timeframe) anywhere in title = vivid
  if (CONCRETE_NOUNS.some(n => lower.includes(n))) return true;
  return false;
}

/** Recommendations split into labeled directives ("CREATIVE: …, BRAND: …, MEDIA: …")
 *  should each have an action verb + concrete noun. Returns the labeled parts
 *  if found, else returns the rec as a single unlabeled chunk. */
function splitLabeledRec(rec: string): { label: string; text: string }[] {
  if (!rec) return [];
  // Matches "LABEL: text" patterns where LABEL is CREATIVE/BRAND/MEDIA/STRATEGY etc.
  const re = /(?:^|\s)(CREATIVE|BRAND|MEDIA|STRATEGY|CHANNEL|EXPERIENCE)\s*[:—]\s*([^]+?)(?=(?:\s+(?:CREATIVE|BRAND|MEDIA|STRATEGY|CHANNEL|EXPERIENCE)\s*[:—])|$)/gi;
  const parts: { label: string; text: string }[] = [];
  let m;
  while ((m = re.exec(rec)) !== null) {
    parts.push({ label: m[1].toUpperCase(), text: m[2].trim() });
  }
  return parts.length > 0 ? parts : [{ label: '', text: rec.trim() }];
}

// ── Main agent ─────────────────────────────────────────────────────────

export function checkInsightQuality(card: CardInput): Finding[] {
  const findings: Finding[] = [];
  const conviction = Number((card as any).conviction) || 0;

  const obs  = String(card.obs  || '').trim();
  const stat = String(card.stat || '').trim();
  const rec  = String(card.rec  || '').trim();
  const title = String(card.title || '').trim();

  // ── Rule 1: Datapoint density ──
  // obs should contain at least ONE specific number. If obs has zero
  // numbers AND stat is also empty/non-numeric, the card has no
  // quantitative grounding — it's vibes.
  if (obs && !hasNumber(obs) && !hasNumber(stat)) {
    findings.push({
      agent: NAME, field: 'obs', severity: 'major',
      issue: 'Observation contains no specific datapoint (no %, ₹, ×, number). Reads as opinion, not insight.',
      suggest: 'Add one specific number from the source data — a %, multiplier, count, or rupee figure.',
      rule: 'no-datapoint',
      card_index: card.index,
    });
  }

  // ── Rule 2: Action-verb opener for rec ──
  // Each labeled directive in the rec should start with an imperative verb.
  // "Continue exploring" / "Consider testing" → not actionable.
  if (rec) {
    const parts = splitLabeledRec(rec);
    for (const p of parts) {
      if (!startsWithAction(p.text)) {
        const firstWord = p.text.split(/\s+/)[0] || '(empty)';
        findings.push({
          agent: NAME, field: 'rec', severity: 'major',
          issue: `Recommendation ${p.label ? `(${p.label}) ` : ''}opens with "${firstWord}" — not an imperative action verb. A client should be able to read this and know what to ship/build/test.`,
          suggest: `Open with an action verb: Build / Launch / Run / Drop / Kill / Replace / Shift / Test / Bid / Cut / Pilot / Replace / Reframe.`,
          rule: 'no-action-verb',
          card_index: card.index,
        });
      }
    }
  }

  // ── Rule 3: Concrete-specific in rec ──
  // Rec should name at least one specific platform / format / timeframe /
  // measurable creative angle. Generic "drive engagement through digital
  // channels" = no.
  if (rec && !hasConcreteNoun(rec)) {
    findings.push({
      agent: NAME, field: 'rec', severity: 'major',
      issue: 'Recommendation names no specific platform, format, or timeframe. Cannot be executed as written.',
      suggest: 'Name at least one: a platform (Reels / YouTube / Hotstar / Blinkit), a format (9-sec ad / carousel / tutorial), or a timeframe (Q3 / festive / next 30 days).',
      rule: 'no-concrete-noun',
      card_index: card.index,
    });
  }

  // ── Rule 4: Dead opener in obs ──
  if (obs && startsWithDeadOpener(obs)) {
    findings.push({
      agent: NAME, field: 'obs', severity: 'major',
      issue: `Observation opens with a dead phrase ("${obs.slice(0, 40)}…"). Open with the human or the moment, not "The data shows".`,
      suggest: 'Lead with the most surprising number OR a vivid scene. The data point is the punchline, not the lead.',
      rule: 'dead-opener',
      card_index: card.index,
    });
  }

  // ── Rule 5: Bare stat without context ──
  // A stat field that's JUST a number (e.g. "47%") without context inside
  // obs ("vs 33% for Female") makes the number meaningless.
  if (stat && /^[+\-]?\d+(?:\.\d+)?\s*(?:%|x|×|pts?|bps|cr|lakh|mn|bn)?\s*$/i.test(stat)) {
    // Stat is bare. Check obs for a comparator.
    if (!/\bvs\b|\bcompared|\bversus|\bagainst|\bbenchmark|\bcategory avg|\bcategory average|\bvs\s+\w+/i.test(obs)) {
      findings.push({
        agent: NAME, field: 'stat', severity: 'minor',
        issue: `Stat "${stat}" is a bare number without context. A client sees the number but can't tell if it's high, low, or expected.`,
        suggest: 'Add the comparator in obs (e.g. "vs 33% category average", "1.7× the Female baseline").',
        rule: 'no-stat-context',
        card_index: card.index,
      });
    }
  }

  // ── Rule 6: Conviction inflation ──
  // High self-reported conviction (≥85) on a card with zero numbers in obs+stat
  // is the model grading itself generously. Flag for human review.
  if (conviction >= 85 && !hasNumber(obs) && !hasNumber(stat)) {
    findings.push({
      agent: NAME, field: 'stat', severity: 'minor',
      issue: `Card self-reports conviction ${conviction} but has no specific numbers in obs/stat to back it up. Likely inflated.`,
      suggest: 'Add evidence in obs/stat to justify the conviction score, OR reduce conviction to ≤70.',
      rule: 'conviction-inflated',
      card_index: card.index,
    });
  }

  // ── Rule 7: Tension hinge in title ──
  // Titles without a hinge OR a vivid image read as deck-speak.
  if (title && !hasTensionOrImage(title) && title.length > 12) {
    findings.push({
      agent: NAME, field: 'title', severity: 'minor',
      issue: `Title "${title}" has no tension hinge (but/yet/still/—) and no vivid image. Reads as a data readout, not a hook.`,
      suggest: 'Add a tension word ("but", "yet", "still", "not") OR a vivid time/place ("Reels at 11pm", "Tier 2 metros", "Festive shopping").',
      rule: 'no-tension-hinge',
      card_index: card.index,
    });
  }

  return findings;
}

/** Cross-agent confirmation hook — same shape as other agents.
 *  InsightQuality findings are mostly self-evident (no number = no number)
 *  so we confirm any finding from another agent that overlaps with our
 *  domain (rec specificity, generic patterns). */
export function insightQualityConfirms(finding: Finding, card: CardInput): boolean {
  // Confirm any proofreader finding about rec specificity — we share that judgement
  if (finding.agent === 'proofreader' && finding.field === 'rec' && /specific|platform|format/i.test(finding.issue)) {
    return true;
  }
  // Confirm fact-analyzer findings about thin evidence — relates to our datapoint-density rule
  if (finding.agent === 'fact-analyzer' && /evidence|grounded|specific/i.test(finding.issue)) {
    return true;
  }
  return false;
}
