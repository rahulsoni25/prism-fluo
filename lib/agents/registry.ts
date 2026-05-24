/**
 * lib/agents/registry.ts
 *
 * Single source of truth for every council in PRISM. Each council
 * registers itself once via `registerCouncil({...})`; everything else
 * (master orchestrator, dashboard API, /admin/agents page, lifecycle
 * diagram) iterates the registry instead of hard-coding council names.
 *
 * Adding a new council = create a file under lib/agents/councils/, fill in
 * the CouncilDescriptor, and import it from lib/agents/councils/index.ts.
 * No other edits required — it appears in the dashboard automatically.
 */

export type Stage = 'upload' | 'analyze' | 'verify' | 'export' | string;

export interface CouncilLifetime {
  /** Free-form key/value pairs shown in the dashboard's "Lifetime" section.
   *  Keys are auto-formatted (camelCase → "camel case") in the UI. */
  [k: string]: any;
}

export interface CouncilRecentItem {
  filename?: string;
  brand?:    string | null;
  model?:    string;
  mode?:     string;
  grade?:    number;
  ready?:    boolean;
  rate?:     number | null;
  quarantined?: boolean;
  blockers?: number;
  majors?:   number;
  at?:       string;
  /** Any other field the council wants to surface — rendered as a string. */
  label?:    string;
}

export interface CouncilSnapshot {
  lifetime: CouncilLifetime;
  recent:   CouncilRecentItem[];
}

export interface MasterCouncilVerdict {
  stage:     Stage;
  council:   string;
  grade:     number;
  ready:     boolean;
  attempts:  number;
  elapsedMs: number;
  blockers:  number;
  majors:    number;
  summary:   string;
  raw?:      any;
}

export interface CouncilDescriptor {
  /** Stable lower-case id, e.g. 'mapper'. Used as the key in the registry. */
  id:    string;
  /** Human-readable name shown in the dashboard. */
  name:  string;
  /** Single-char emoji for the card header. */
  emoji: string;
  /** Lifecycle stage this council owns. */
  stage: Stage;
  /** Names of the individual agents inside this council (renders as chips). */
  agentNames: string[];
  /** Short description for the lifecycle diagram on /admin/agents. */
  description: string;

  /**
   * Optional run function — invoked by the master orchestrator when callers
   * request this stage. Councils without a `run` (e.g. always-on monitors
   * like AI Health) can omit this and just expose a snapshot.
   */
  run?: (args: any) => Promise<MasterCouncilVerdict>;

  /** Returns lifetime totals + the latest 5 activity rows for the dashboard. */
  getSnapshot: () => Promise<CouncilSnapshot>;

  /**
   * Returns a 0–10 grade for the system-wide average. If omitted, the
   * dashboard treats this council as ungradeable (skipped from the avg).
   */
  computeGrade?: (snapshot: CouncilSnapshot) => number;

  /** Link to the council's own deep-dive admin page (or null). */
  link: string | null;
}

// ── Registry ─────────────────────────────────────────────────────────────

const COUNCILS = new Map<string, CouncilDescriptor>();

export function registerCouncil(c: CouncilDescriptor): void {
  if (COUNCILS.has(c.id)) {
    // Hot-reload (Next.js dev) will re-import — overwrite is fine.
    COUNCILS.set(c.id, c);
    return;
  }
  COUNCILS.set(c.id, c);
}

/** Iterate all registered councils (stable insertion order). */
export function getCouncils(): CouncilDescriptor[] {
  return Array.from(COUNCILS.values());
}

export function getCouncilById(id: string): CouncilDescriptor | undefined {
  return COUNCILS.get(id);
}

/** Find the council that owns a given lifecycle stage. */
export function getCouncilForStage(stage: Stage): CouncilDescriptor | undefined {
  return Array.from(COUNCILS.values()).find(c => c.stage === stage);
}
