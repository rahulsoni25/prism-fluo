/**
 * lib/ai/verify/fact-analyzer.ts
 * Agent #3 — Claim verification.
 *
 * For each insight card, check that the observation's CLAIM is supported by:
 *   (a) the chart's underlying labels/data (e.g. claim mentions a keyword
 *       that actually appears in chartData.labels), OR
 *   (b) the source tool's domain (e.g. a GWI insight shouldn't make claims
 *       about Amazon prices), OR
 *   (c) basic common-sense / sanity checks (no self-contradictions, no
 *       claims that violate the brief's stated audience/geo)
 *
 * Combines deterministic rules + optional LLM "does this claim make sense
 * given the data" pass.
 */

import { callOpenRouterText } from '@/lib/ai/openrouter';
import type { CardInput, Finding, AgentName } from './types';

const NAME: AgentName = 'fact-analyzer';

// Domain → topics this source CAN'T legitimately speak to
const OUT_OF_SCOPE: Record<string, RegExp[]> = {
  KEYWORD_PLANNER: [/in-store/, /shelf placement/, /packaging/],
  HELIUM10:        [/print advert/, /TV spot/, /tv reach/],
  GWI:             [/CPC|cost per click|impression share/i],
  TRENDS:          [/ROI|cost per acquisition|CAC\b/],
};

function flattenLabels(data: any): string[] {
  if (!data) return [];
  const labels: string[] = [];
  if (Array.isArray(data.labels)) data.labels.forEach((l: any) => l && labels.push(String(l)));
  if (Array.isArray(data.datasets)) {
    data.datasets.forEach((ds: any) => { if (ds.label) labels.push(String(ds.label)); });
  }
  return labels.map(l => l.toLowerCase());
}

export function checkCardFacts(card: CardInput, brand: string | null): Finding[] {
  const findings: Finding[] = [];

  // Tool-scope check: does the claim wander into a domain the source can't speak to?
  if (card.toolLabel && card.obs) {
    const banned = OUT_OF_SCOPE[card.toolLabel.toUpperCase().replace(/\s+/g, '_')];
    if (banned) {
      for (const re of banned) {
        if (re.test(card.obs)) {
          findings.push({
            agent: NAME,
            field: 'obs',
            severity: 'major',
            issue: `Observation makes a claim about "${re.source}" which this data source (${card.toolLabel}) cannot legitimately speak to.`,
            evidence: card.toolLabel,
            suggest: 'Re-anchor the claim to what this dataset actually measures, or move the insight to a card backed by the right source.',
          });
        }
      }
    }
  }

  // Quoted-keyword check: any quoted string in obs/rec should appear in
  // the chart's labels (otherwise the card invented a keyword).
  if (card.obs || card.rec) {
    const labels = flattenLabels(card.computedChartData);
    if (labels.length > 0) {
      const quoted = [...(card.obs || '').matchAll(/['"]([^'"]{3,40})['"]/g)]
        .concat([...(card.rec || '').matchAll(/['"]([^'"]{3,40})['"]/g)])
        .map(m => m[1]);

      const skipWords = new Set(['the','a','an','and','or','for','with','best','luxury','eco']);

      for (const q of quoted) {
        const ql = q.toLowerCase();
        if (skipWords.has(ql)) continue;
        // Allow partial match — the label "tide washing powder" matches "tide"
        const found = labels.some(l => l.includes(ql) || ql.includes(l));
        if (!found) {
          findings.push({
            agent: NAME,
            field: card.obs?.includes(q) ? 'obs' : 'rec',
            severity: 'minor',
            issue: `Quoted term "${q}" doesn't appear in the chart's labels — verify the source has this term.`,
            evidence: q,
          });
        }
      }
    }
  }

  // Self-contradiction: obs says "rising" and stat says "fell" or vice versa
  if (card.obs && card.stat) {
    const obsRising  = /\b(rising|rise|grew|growing|increased|up|surge|spike|gain)\b/i.test(card.obs);
    const obsFalling = /\b(falling|fall|fell|dropped|declining|decreased|down)\b/i.test(card.obs);
    const statRising  = /\b(rising|rise|grew|growing|up|surge|spike|gain|\+\d)\b/i.test(card.stat);
    const statFalling = /\b(falling|fall|fell|dropped|declining|down|-\d)\b/i.test(card.stat);
    if ((obsRising && statFalling) || (obsFalling && statRising)) {
      findings.push({
        agent: NAME,
        field: 'obs',
        severity: 'blocker',
        issue: 'Observation and stat describe opposite directions (one says rising, the other falling).',
        evidence: `obs=${obsRising ? 'rising' : 'falling'}, stat=${statRising ? 'rising' : 'falling'}`,
      });
    }
  }

  // Brand mention without context — "Sargam" appearing only in rec without
  // grounding in obs feels parachuted
  if (brand && card.rec && !card.obs?.toLowerCase().includes(brand.split(' ')[0].toLowerCase())) {
    const stem = brand.split(/\s+/)[0].toLowerCase();
    if (card.rec.toLowerCase().includes(stem)) {
      findings.push({
        agent: NAME,
        field: 'rec',
        severity: 'minor',
        issue: `Recommendation invokes "${stem}" but the observation never mentions the brand — bridge the leap.`,
      });
    }
  }

  return findings;
}

async function llmConsistencyPass(card: CardInput): Promise<Finding[]> {
  if (!process.env.OPENROUTER_API_KEY) return [];
  const labels = flattenLabels(card.computedChartData).slice(0, 20).join(', ');
  const prompt = `You are a fact-checker for a brand strategy insight card. Given the underlying chart labels + the card text, decide if the OBSERVATION claim is fully supported by the chart, partially supported, or invented. Return ONLY a JSON array of findings — empty [] if the card is faithful.

CHART LABELS (the only ground truth this card has): ${labels || '(none)'}
TITLE: ${card.title}
OBS:   ${card.obs || ''}
STAT:  ${card.stat || ''}

Look for: claims about trends that aren't in the labels; named brands/products that aren't in the labels; geographic or audience claims with no support; absolute superlatives that the data can't support.

Return shape: [{"field":"title|obs|stat|rec","severity":"blocker|major|minor","issue":"description","evidence":"the unsupported phrase"}]
Return ONLY the JSON array. No prose.`;
  try {
    const raw = await callOpenRouterText(prompt, 500, 'verify-fact-analyzer');
    const m = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').match(/\[[\s\S]*\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x: any) => x && ['title','obs','stat','rec'].includes(x.field) && ['blocker','major','minor'].includes(x.severity) && typeof x.issue === 'string')
      .map((x: any) => ({ ...x, agent: NAME }));
  } catch { return []; }
}

export async function analyzeCardFacts(card: CardInput, brand: string | null, opts: { llm?: boolean } = {}): Promise<Finding[]> {
  const findings = checkCardFacts(card, brand);
  if (opts.llm) findings.push(...await llmConsistencyPass(card));
  return findings;
}

export function factAnalyzerConfirms(finding: Finding, card: CardInput, brand: string | null): boolean {
  // Re-run our own checks. If the same finding (same field, similar evidence) emerges, confirm.
  const ours = checkCardFacts(card, brand);
  return ours.some(f => f.field === finding.field &&
    (finding.evidence ? f.evidence?.toLowerCase().includes(finding.evidence.toLowerCase()) : false));
}
