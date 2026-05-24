/**
 * lib/ai/verify/orchestrator.ts
 * Runs the three verification agents over an analysis and resolves
 * disagreements through cross-confirmation.
 *
 * Flow per card:
 *   1. PARALLEL pass — all three agents independently scan the card
 *   2. CONSULT pass — each finding is routed to the OTHER two agents
 *      asking "do you confirm this?"
 *   3. VERDICT — confirmed (2+ agents agree) / disputed (only originator) /
 *      clean (no agent flagged anything)
 *
 * The result feeds back into the Gemini generator: every confirmed finding
 * is a learning signal — `feedback.txt` summarises systemic problems so the
 * next analysis run can adjust its prompt.
 */

import type {
  CardInput, Finding, ConfirmedFinding, CardVerification,
  VerificationReport, AgentName,
} from './types';
import { proofreadCard, proofreaderConfirms } from './proofreader';
import { checkCardStats, statCheckerConfirms } from './stat-checker';
import { analyzeCardFacts, factAnalyzerConfirms } from './fact-analyzer';
import { checkCardMath, checkAnalysisMath, mathIntegrityConfirms } from './math-integrity';
import { checkCoverage, coverageConfirms } from './coverage';

const ALL_AGENTS: AgentName[] = ['proofreader', 'stat-checker', 'fact-analyzer', 'math-integrity', 'coverage'];

/** A finding has hard evidence if it includes a specific quoted phrase /
 *  number / source-row reference. Hard-evidence findings are confirmed
 *  by 1 agent (themselves) — they don't need a second vote. */
function hasHardEvidence(f: Finding): boolean {
  return Boolean(f.evidence && f.evidence.length > 0 && f.severity === 'blocker');
}

/** Ask the other two agents whether they confirm a finding. Each returns
 *  yes/no synchronously based on its own rules — no LLM round-trip needed. */
function consult(
  finding: Finding,
  card: CardInput,
  brand: string | null,
): { confirmedBy: AgentName[]; disputedBy: AgentName[] } {
  const others = ALL_AGENTS.filter(a => a !== finding.agent);
  const confirmedBy: AgentName[] = [finding.agent]; // originator always confirms own finding
  const disputedBy: AgentName[]  = [];

  for (const a of others) {
    let agrees = false;
    if (a === 'proofreader')     agrees = proofreaderConfirms(finding, card);
    if (a === 'stat-checker')    agrees = statCheckerConfirms(finding, card);
    if (a === 'fact-analyzer')   agrees = factAnalyzerConfirms(finding, card, brand);
    if (a === 'math-integrity')  agrees = mathIntegrityConfirms(finding, card);
    if (a === 'coverage')        agrees = coverageConfirms(finding);
    if (agrees) confirmedBy.push(a);
    else        disputedBy.push(a);
  }
  return { confirmedBy, disputedBy };
}

function resolveVerdict(f: Finding, ctx: { confirmedBy: AgentName[]; disputedBy: AgentName[] }): ConfirmedFinding {
  const confirmedCount = ctx.confirmedBy.length;
  // Verdict policy:
  //   2+ agents agree → confirmed
  //   only originator agrees but finding has hard evidence → confirmed
  //   only originator agrees, no hard evidence → disputed (shown with caveat)
  let verdict: ConfirmedFinding['verdict'] = 'disputed';
  if (confirmedCount >= 2) verdict = 'confirmed';
  else if (hasHardEvidence(f)) verdict = 'confirmed';
  return { ...f, ...ctx, verdict };
}

/** Verify a single card. Returns null if the card is fully clean. */
export async function verifyCard(
  card: CardInput,
  brand: string | null,
  opts: { llm?: boolean } = {},
): Promise<CardVerification> {
  // Step 1 — parallel scan (4 agents now: proofreader + stat-checker +
  // fact-analyzer + math-integrity)
  const [proofFindings, statFindings, factFindings, mathFindings] = await Promise.all([
    proofreadCard(card, brand, { llm: opts.llm }),
    Promise.resolve(checkCardStats(card)),
    analyzeCardFacts(card, brand, { llm: opts.llm }),
    Promise.resolve(checkCardMath(card)),
  ]);
  const all = [...proofFindings, ...statFindings, ...factFindings, ...mathFindings];

  // Step 2 — cross-consult
  const confirmed: ConfirmedFinding[] = all.map(f => resolveVerdict(f, consult(f, card, brand)));

  // Only surface confirmed findings; disputed are kept but marked so the UI
  // can show them collapsed under "advisory" if desired.
  const surfaced = confirmed.filter(c => c.verdict === 'confirmed');

  // Step 3 — worst severity
  const sevRank = { blocker: 3, major: 2, minor: 1 };
  let worst: ConfirmedFinding['severity'] | null = null;
  for (const c of surfaced) {
    if (!worst || sevRank[c.severity] > sevRank[worst]) worst = c.severity;
  }

  return {
    index: card.index,
    title: card.title,
    findings: confirmed,        // all findings, including disputed (UI filters)
    worstSeverity: worst,
    verified: surfaced.length === 0,
  };
}

/** Verify an entire analysis. Concurrency-limited so we don't melt the LLM.
 *
 *  Token-optimization notes:
 *  • Rule-based passes run in O(n) over cards, no token cost.
 *  • LLM passes are SKIPPED entirely on cards where the rule passes already
 *    flagged a finding the LLM would just duplicate (e.g. blocker-grade
 *    truncated-title — no point asking the LLM to find what regex caught).
 *  • Cross-confirm step is pure-rule. No LLM round-trips for confirmation.
 *  • Higher concurrency = same total tokens, less wall time. We cap at 8
 *    so we don't exhaust the OpenRouter rate limit on a 200-card analysis.
 */
export async function verifyAnalysis(
  analysisId: string,
  cards: CardInput[],
  brand: string | null,
  opts: {
    llm?: boolean;
    concurrency?: number;
    /** Cross-talk: Mapper Council's verdict on the source file. When the
     *  source is flagged as thin / image-only / scanned, downstream
     *  FactAnalyzer + Coverage findings get downgraded one severity tier
     *  (blocker→major, major→minor) because thin-text input genuinely
     *  limits what the AI could extract — the verification council
     *  shouldn't punish the AI for the source's limitations. */
    mapperVerdict?: { blockers: number; majors: number; topFinding?: string } | null;
  } = {},
): Promise<VerificationReport> {
  const limit = Math.max(1, opts.concurrency ?? 8);
  const out: CardVerification[] = [];

  // Run a quick rules-only pass first to identify cards that already have
  // hits — when LLM mode is on, we only re-scan cards with NO rule hits
  // (LLM serves as a "second pair of eyes" on the otherwise-clean cards).
  // This routes the expensive token budget to where rules can't see.
  if (opts.llm) {
    // First pass: rules only, parallel chunks
    for (let i = 0; i < cards.length; i += limit) {
      const chunk = cards.slice(i, i + limit);
      const verified = await Promise.all(chunk.map(c => verifyCard(c, brand, { llm: false })));
      out.push(...verified);
    }
    // Second pass: LLM only on cards that survived the rule pass with zero findings
    const cleanCards = cards.filter((_c, i) => out[i].findings.length === 0);
    for (let i = 0; i < cleanCards.length; i += limit) {
      const chunk = cleanCards.slice(i, i + limit);
      const verifiedAgain = await Promise.all(chunk.map(c => verifyCard(c, brand, { llm: true })));
      // Merge any new LLM findings back into the corresponding out[i]
      verifiedAgain.forEach(v => {
        const target = out.find(o => o.index === v.index);
        if (target && v.findings.length > 0) {
          target.findings.push(...v.findings);
          if (v.worstSeverity) target.worstSeverity = v.worstSeverity;
          target.verified = false;
        }
      });
    }
  } else {
    // Rule-only mode: single pass, parallel chunks
    for (let i = 0; i < cards.length; i += limit) {
      const chunk = cards.slice(i, i + limit);
      const verified = await Promise.all(chunk.map(c => verifyCard(c, brand, opts)));
      out.push(...verified);
    }
  }

  // ── ANALYSIS-LEVEL math pass ────────────────────────────────────
  // Re-derives the market pyramid from brand + audience and flags any
  // card whose TAM-style claim diverges > 2× from the canonical funnel.
  // This is the bug class that produced "84M addressable audience" when
  // the actual answer was 41M.
  const briefForMath = (cards.length > 0 && (cards[0] as any).brief)
    ? (cards[0] as any).brief
    : (brand ? { brand } : null);
  if (briefForMath) {
    // Coverage pass — runs across whole analysis, not per-card. Findings
    // attach to the synthetic card-0 since they're analysis-wide.
    const coverageFindings = checkCoverage(briefForMath, cards);
    for (const f of coverageFindings) {
      if (out[0]) {
        out[0].findings.push({
          ...f,
          confirmedBy: ['coverage'],
          disputedBy: [],
          verdict: 'confirmed',
        } as any);
        if (f.severity === 'blocker') {
          out[0].worstSeverity = 'blocker';
          out[0].verified = false;
        } else if (f.severity === 'major' && out[0].worstSeverity !== 'blocker') {
          out[0].worstSeverity = 'major';
          out[0].verified = false;
        }
      }
    }

    const analysisFindings = checkAnalysisMath(briefForMath, cards);
    for (const f of analysisFindings) {
      // Attach to the matching card if we can identify it; otherwise
      // append a synthetic card-0 entry so the issue surfaces.
      const targetIndex = cards.findIndex(c => {
        const t = `${c.title || ''} ${c.obs || ''} ${c.stat || ''}`;
        return f.evidence && t.includes(f.evidence.split(' vs ')[0]);
      });
      if (targetIndex >= 0 && out[targetIndex]) {
        // 2-agent consensus rule: math-integrity finding gets auto-confirmed
        // because its evidence is mathematical, not opinion. Hard-evidence
        // policy in resolveVerdict handles this via blocker severity.
        out[targetIndex].findings.push({
          ...f,
          confirmedBy: ['math-integrity'],
          disputedBy: [],
          verdict: 'confirmed',
        } as any);
        out[targetIndex].worstSeverity = 'blocker';
        out[targetIndex].verified = false;
      }
    }
  }

  // ── CROSS-TALK: Mapper Council severity downgrade ──
  // If the source file was flagged thin/scanned/image-only, demote
  // FactAnalyzer + Coverage findings by one severity tier and tag them
  // with a `mapperContext` note so the dashboard explains why the grade
  // softened. Math/Stat/Proofreader findings are untouched — those still
  // reflect AI mistakes regardless of source quality.
  const mapperWeakSource = !!(opts.mapperVerdict && (
    opts.mapperVerdict.blockers > 0 ||
    /scan|image-only|extractable|thin|ocr/i.test(opts.mapperVerdict.topFinding ?? '')
  ));
  let mapperDowngrades = 0;
  if (mapperWeakSource) {
    const DOWNGRADE = { blocker: 'major', major: 'minor', minor: 'minor' } as const;
    const SOFTENABLE_AGENTS = new Set(['fact-analyzer', 'coverage', 'fact_analyzer']);
    for (const card of out) {
      for (const f of card.findings as any[]) {
        const agents: string[] = Array.isArray(f.confirmedBy) ? f.confirmedBy : [];
        const fromSofteningAgent = agents.some(a => SOFTENABLE_AGENTS.has(a));
        if (fromSofteningAgent && f.severity && DOWNGRADE[f.severity as keyof typeof DOWNGRADE]) {
          const next = DOWNGRADE[f.severity as keyof typeof DOWNGRADE];
          if (next !== f.severity) {
            f.severity = next;
            f.mapperContext = `Severity softened: source file was flagged by Mapper as thin/scanned (${opts.mapperVerdict?.topFinding ?? 'limited extractable text'}).`;
            mapperDowngrades++;
          }
        }
      }
      // Recompute worst severity after downgrades
      const sevs = (card.findings as any[]).map(f => f.severity);
      card.worstSeverity = sevs.includes('blocker') ? 'blocker'
                         : sevs.includes('major')   ? 'major'
                         : sevs.includes('minor')   ? 'minor' : undefined;
      card.verified = !card.findings.some((f: any) => f.severity === 'blocker' || f.severity === 'major');
    }
  }

  // Summary
  const cardsWithIssues = out.filter(c => !c.verified).length;
  const allConfirmed    = out.flatMap(c => c.findings).filter(f => f.verdict === 'confirmed');
  const bySeverity = {
    blocker: allConfirmed.filter(f => f.severity === 'blocker').length,
    major:   allConfirmed.filter(f => f.severity === 'major').length,
    minor:   allConfirmed.filter(f => f.severity === 'minor').length,
  };

  return {
    analysisId,
    generatedAt: new Date().toISOString(),
    agentsRun: ALL_AGENTS,
    summary: {
      totalCards: out.length,
      verifiedCards: out.length - cardsWithIssues,
      cardsWithIssues,
      confirmedFindings: allConfirmed.length,
      disputedFindings: out.flatMap(c => c.findings).filter(f => f.verdict === 'disputed').length,
      bySeverity,
      ...(mapperWeakSource ? { mapperDowngrades, mapperContext: 'Source file flagged thin/scanned by Mapper — fact/coverage severities softened.' } : {}),
    } as any,
    cards: out,
  };
}

/** Build a learning signal for Gemini — a short summary of the most common
 *  issue patterns across this analysis. Plug this into the next generation
 *  run as a system-prompt addendum. */
export function buildGeminiFeedback(report: VerificationReport): string {
  const patterns = new Map<string, number>();
  for (const card of report.cards) {
    for (const f of card.findings) {
      if (f.verdict !== 'confirmed') continue;
      const key = `${f.agent}: ${f.issue.split('—')[0].split(':')[0].trim()}`;
      patterns.set(key, (patterns.get(key) || 0) + 1);
    }
  }
  const sorted = [...patterns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (sorted.length === 0) return '';
  const lines = sorted.map(([msg, count]) => `• ${msg} (${count}× across this analysis)`);
  return `RECURRING ISSUES FROM PRIOR VERIFICATION — DO NOT REPEAT:\n${lines.join('\n')}`;
}
