/**
 * lib/ai/verify/coverage.ts
 * Agent #5 — Methodology Coverage.
 *
 * Other agents check whether what's IN the analysis is correct (grammar,
 * stats, facts, math). This one checks whether what SHOULD be in the
 * analysis is actually there.
 *
 * Reads the Fluo "Digital Audience Research Framework" blueprints
 * (lib/research/blueprints.ts) and walks every analysis card's title +
 * obs + rec text looking for keyword matches against each expected
 * metric. Outputs findings:
 *
 *   • blocker — an entire blueprint SECTION has 0% coverage
 *   • major   — < 30% of metrics in a section addressed (significant gap)
 *   • minor   — individual metric missed (only surfaces top 5 per section
 *               so the report doesn't drown in nits)
 *
 * Pure rules, no LLM, deterministic. ~50ms for a 150-card analysis.
 */

import type { CardInput, Finding, AgentName } from './types';
import { expectedKeywordsForBrief, BLUEPRINT_SECTIONS } from '@/lib/research/blueprints';

const NAME: AgentName = 'coverage';

interface CoverageBrief {
  competitors?: string | null;
  category?:    string | null;
  objective?:   string | null;
}

function cardCorpus(cards: CardInput[]): string {
  return cards
    .map(c => `${c.title || ''} ${c.obs || ''} ${c.rec || ''}`)
    .join(' | ')
    .toLowerCase();
}

/** Returns true if ANY of the metric's keywords appears in the corpus. */
function isAddressed(keywords: string[], corpus: string): boolean {
  return keywords.some(kw => corpus.includes(kw.toLowerCase()));
}

export function checkCoverage(brief: CoverageBrief | null, cards: CardInput[]): Finding[] {
  const findings: Finding[] = [];
  if (!brief || cards.length === 0) return findings;
  const corpus = cardCorpus(cards);

  // Group expected metrics by section so we can summarise per-section
  const expected = expectedKeywordsForBrief(brief);
  const bySection = new Map<string, Array<{ metric: string; keywords: string[] }>>();
  for (const e of expected) {
    if (!bySection.has(e.section)) bySection.set(e.section, []);
    bySection.get(e.section)!.push({ metric: e.metric, keywords: e.keywords });
  }

  for (const [sectionId, metrics] of bySection) {
    if (metrics.length === 0) continue;
    const sectionMeta = BLUEPRINT_SECTIONS.find(s => s.id === sectionId);
    const sectionTitle = sectionMeta?.title || sectionId;

    const missed = metrics.filter(m => !isAddressed(m.keywords, corpus));
    const addressed = metrics.length - missed.length;
    const coverage = addressed / metrics.length;

    // Section-level severity
    if (coverage === 0) {
      findings.push({
        agent: NAME,
        field: 'rec',
        severity: 'blocker',
        issue: `Section ${sectionId} (${sectionTitle}) has 0% coverage — none of its ${metrics.length} expected metrics are addressed.`,
        evidence: sectionId,
        suggest: `Add at least one card covering ${metrics.slice(0, 3).map(m => `"${m.metric}"`).join(', ')} from the Fluo research framework.`,
      });
      continue; // don't double-flag individual metrics if the whole section is empty
    }
    if (coverage < 0.3) {
      findings.push({
        agent: NAME,
        field: 'rec',
        severity: 'major',
        issue: `Section ${sectionId} (${sectionTitle}) has ${addressed}/${metrics.length} metrics addressed (${Math.round(coverage * 100)}%) — significant coverage gap.`,
        evidence: sectionId,
        suggest: `Top missed: ${missed.slice(0, 3).map(m => `"${m.metric}"`).join(', ')}.`,
      });
    }

    // Per-metric minor findings — cap at 5 per section so the report
    // doesn't drown in nits
    for (const m of missed.slice(0, 5)) {
      findings.push({
        agent: NAME,
        field: 'rec',
        severity: 'minor',
        issue: `Metric not addressed: ${sectionId}.${m.metric} — no card mentions ${m.keywords.slice(0, 2).map(k => `"${k}"`).join(' or ')}.`,
        evidence: `${sectionId}.${m.metric}`,
      });
    }
  }

  return findings;
}

/** Coverage findings are deterministic — same input gives same output —
 *  so we self-confirm. Other agents abstain unless they have an
 *  independent reason. */
export function coverageConfirms(finding: Finding): boolean {
  // No need to inspect — coverage findings are reproducible from the
  // same blueprint + card corpus. We simply trust them.
  return finding.agent === NAME;
}
