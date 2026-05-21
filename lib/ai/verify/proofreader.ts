/**
 * lib/ai/verify/proofreader.ts
 * Agent #1 — Language quality gate.
 *
 * Catches: grammar, spelling, jargon ban-list, brand-name consistency,
 *          number-formatting style, length caps, generic-rec patterns.
 *
 * Deterministic rule pass + optional LLM grammar overlay.
 */

import { callOpenRouterText } from '@/lib/ai/openrouter';
import type { CardInput, Finding, AgentName } from './types';

const NAME: AgentName = 'proofreader';

const JARGON_BANLIST = [
  'leverage', 'synergy', 'holistic', 'robust', 'utilize', 'paradigm',
  'seamless', 'ecosystem', 'unlock', 'supercharge', 'over-index', 'touchpoint',
  'optimize the funnel', 'best-in-class', 'best in class',
  'state-of-the-art', 'state of the art', 'cutting-edge', 'cutting edge',
];

const PLATFORMS = [
  'youtube','reels','shorts','instagram','sharechat','moj','hotstar',
  'jiocinema','meesho','flipkart','amazon','whatsapp','facebook','twitter',
  'x.com','google','search','play store','app store','spotify',
];
const FORMATS = [
  'reel','pre-roll','preroll','mid-roll','carousel','static','short video',
  'long-form','long form','search ad','display ad','sponsored','demo',
  'tutorial','unboxing','before/after',
];

const wc = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function rulePass(card: CardInput, brandCanonical: string | null): Finding[] {
  const findings: Finding[] = [];

  // Title
  if (card.title) {
    if (wc(card.title) > 14)
      findings.push({ agent: NAME, field: 'title', severity: 'major',
        issue: `Title is ${wc(card.title)} words — keep under 12.` });
    if (card.title === card.title.toLowerCase())
      findings.push({ agent: NAME, field: 'title', severity: 'minor',
        issue: 'Title is entirely lowercase — use sentence-case.' });
    if (/[.;]$/.test(card.title.trim()))
      findings.push({ agent: NAME, field: 'title', severity: 'minor',
        issue: 'Title ends in a period — drop trailing punctuation.' });
    if (/,\s*$|\bNot Just\s*$|\band Just\s*$/.test(card.title.trim()))
      findings.push({ agent: NAME, field: 'title', severity: 'blocker',
        issue: 'Title appears truncated mid-sentence.',
        evidence: card.title });
  }

  // Brand consistency
  if (brandCanonical) {
    const stem = brandCanonical.split(/\s+/)[0];
    const re = new RegExp(`\\b(${stem})\\b`, 'g');
    const allText = `${card.title || ''} ${card.obs || ''} ${card.stat || ''} ${card.rec || ''}`;
    let m;
    while ((m = re.exec(allText.toLowerCase())) !== null) {
      const found = allText.slice(m.index, m.index + stem.length);
      if (found !== stem[0].toUpperCase() + stem.slice(1).toLowerCase()) {
        findings.push({ agent: NAME, field: 'title', severity: 'blocker',
          issue: `Brand stem "${found}" should be capitalised as "${stem}".`,
          evidence: found });
        break;
      }
    }
  }

  // Jargon ban-list across all fields
  (['title', 'obs', 'stat', 'rec'] as const).forEach(f => {
    const t = (card as any)[f];
    if (!t) return;
    const lower = t.toLowerCase();
    for (const word of JARGON_BANLIST) {
      if (lower.includes(word)) {
        findings.push({ agent: NAME, field: f, severity: 'major',
          issue: `Banned PRISM jargon: "${word}".`,
          evidence: word,
          suggest: 'Rewrite in plain English. Use a concrete verb or specific noun.' });
      }
    }
  });

  // Observation length
  if (card.obs) {
    const sentenceCount = card.obs.split(/(?<=[.!?])\s+/).filter(Boolean).length;
    if (sentenceCount > 3)
      findings.push({ agent: NAME, field: 'obs', severity: 'major',
        issue: `Observation is ${sentenceCount} sentences — keep to 1–2.` });
    if (wc(card.obs) > 60)
      findings.push({ agent: NAME, field: 'obs', severity: 'minor',
        issue: `Observation is ${wc(card.obs)} words — aim for ≤ 50.` });
  }

  // Recommendation specificity
  if (card.rec) {
    const lower = card.rec.toLowerCase();
    const hasPlatform = PLATFORMS.some(p => lower.includes(p));
    const hasFormat   = FORMATS.some(f => lower.includes(f));
    if (!hasPlatform && !hasFormat) {
      findings.push({ agent: NAME, field: 'rec', severity: 'major',
        issue: 'Recommendation names no specific platform or format — a media planner cannot execute this directly.',
        suggest: 'Add at least one platform (YouTube/Reels/ShareChat/Meesho/etc.) AND one format (15s Reel, search ad, carousel).' });
    }
  }

  // Currency / number formatting
  (['obs', 'stat', 'rec'] as const).forEach(f => {
    const t = (card as any)[f];
    if (!t) return;
    if (/₹\s*[\d.,]+/.test(t) && /\bRs\.?\s*[\d.,]+/.test(t)) {
      findings.push({ agent: NAME, field: f, severity: 'minor',
        issue: 'Mixes ₹ and Rs. — pick one currency style.' });
    }
    if (/\d(Cr|L)\b/.test(t)) {
      findings.push({ agent: NAME, field: f, severity: 'minor',
        issue: 'Missing space between number and Cr/L unit (e.g. "₹12.7Cr" → "₹12.7 Cr").' });
    }
  });

  return findings;
}

async function llmPass(card: CardInput): Promise<Finding[]> {
  if (!process.env.OPENROUTER_API_KEY) return [];
  const prompt = `You are a sharp copy-editor. Find grammar errors that change meaning, dangling modifiers, and subject-verb disagreement in this card. Return ONLY a JSON array of findings — empty [] if clean.

TITLE: ${card.title}
OBS:   ${card.obs || ''}
STAT:  ${card.stat || ''}
REC:   ${card.rec || ''}

Shape: [{"field":"title|obs|stat|rec","severity":"blocker|major|minor","issue":"description","suggest":"optional rewrite"}]
Return ONLY the JSON array. No markdown, no prose.`;
  try {
    const raw = await callOpenRouterText(prompt, 500);
    const m = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').match(/\[[\s\S]*\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x: any) => x && ['title','obs','stat','rec'].includes(x.field) && ['blocker','major','minor'].includes(x.severity) && typeof x.issue === 'string')
      .map((x: any) => ({ ...x, agent: NAME }));
  } catch { return []; }
}

/** Confirm-or-deny step: when another agent flags an issue on the LANGUAGE
 *  side, this proofreader weighs in. Pure rules — fast and deterministic. */
export function proofreaderConfirms(finding: Finding, card: CardInput): boolean {
  // Confirm jargon / banned-word findings if the word appears in the text
  if (finding.evidence && JARGON_BANLIST.includes(finding.evidence.toLowerCase())) {
    const t = (card as any)[finding.field];
    return !!(t && t.toLowerCase().includes(finding.evidence.toLowerCase()));
  }
  // Confirm grammar / length issues from other agents
  if (finding.severity === 'blocker') return true;  // err on the side of agreeing on blockers
  return false; // unknown — abstain
}

/** Run both passes and return all findings. */
export async function proofreadCard(card: CardInput, brandCanonical: string | null, opts: { llm?: boolean } = {}): Promise<Finding[]> {
  const findings = rulePass(card, brandCanonical);
  if (opts.llm) findings.push(...await llmPass(card));
  return findings;
}
