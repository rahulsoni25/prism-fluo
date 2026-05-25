/**
 * lib/ai/verify/types.ts
 * Shared types for the three-agent insight verification council.
 */

export type AgentName = 'proofreader' | 'stat-checker' | 'fact-analyzer' | 'math-integrity' | 'coverage' | 'brand-isolation';
export type Severity  = 'blocker' | 'major' | 'minor';
export type Field     = 'title' | 'obs' | 'stat' | 'rec';
export type Verdict   = 'confirmed' | 'disputed' | 'clean';

export interface Finding {
  agent:    AgentName;
  field:    Field;
  severity: Severity;
  issue:    string;
  suggest?: string;
  /** Hard evidence — a number/quote/source row reference. When present,
   *  the orchestrator weights this finding heavily even on disagreement. */
  evidence?: string;
  /** Optional rule identifier — used by BrandIsolation (and any future
   *  agent with multiple distinct rules) so consumers can branch on the
   *  specific failure mode without parsing the issue text. */
  rule?: string;
  /** Optional target card index — used by analysis-level agents
   *  (BrandIsolation, Coverage) to route a finding to a specific card
   *  rather than always attaching to card 0. */
  card_index?: number;
  /** Optional mapper context — softened-by-mapper findings include this
   *  note so the dashboard can explain WHY the severity was lowered. */
  mapperContext?: string;
}

/** A finding after the cross-confirmation pass — keeps the originator and
 *  the verdicts of the other two agents. */
export interface ConfirmedFinding extends Finding {
  confirmedBy: AgentName[];   // agents who said YES this is a real issue
  disputedBy:  AgentName[];   // agents who said NO
  verdict:     Verdict;
}

export interface CardInput {
  index:  number;
  title:  string;
  obs?:   string;
  stat?:  string;
  rec?:   string;
  bucket?: string;
  /** Underlying chart data — used by stat-checker to verify numbers. */
  computedChartData?: any;
  /** Tool / source label (e.g. 'GWI', 'KEYWORD_PLANNER') — used by fact-analyzer. */
  toolLabel?: string;
}

export interface CardVerification {
  index:  number;
  title:  string;
  findings: ConfirmedFinding[];
  /** Highest severity among confirmed findings, or null if clean. */
  worstSeverity: Severity | null;
  /** True only if every agent that ran said the card is clean. */
  verified: boolean;
}

export interface VerificationReport {
  analysisId: string;
  generatedAt: string;
  agentsRun: AgentName[];
  summary: {
    totalCards: number;
    verifiedCards: number;
    cardsWithIssues: number;
    confirmedFindings: number;
    disputedFindings: number;
    bySeverity: { blocker: number; major: number; minor: number };
  };
  cards: CardVerification[];
}
