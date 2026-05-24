/**
 * lib/agents/councils/index.ts
 *
 * Barrel that imports every council descriptor. Each import has a side
 * effect: the descriptor calls `registerCouncil()` at module load time,
 * which adds it to the registry consumed by:
 *
 *   • lib/agents/master.ts                — runCouncilForStage()
 *   • app/api/admin/agents-overview/      — dashboard payload builder
 *   • app/admin/agents/page.tsx           — UI iterates the API response
 *
 * Adding a 5th / 6th / Nth council:
 *
 *   1. Create lib/agents/councils/<your-id>.ts following the existing
 *      shape — see mapper.ts / verification.ts as references.
 *   2. Fill in the CouncilDescriptor: id, name, emoji, stage, agentNames,
 *      description, link, and either getSnapshot() (always-on monitor) or
 *      both run() + getSnapshot() (per-request council). Optionally add
 *      computeGrade() to contribute to the system-wide grade.
 *   3. Add ONE line below to import it:    import './<your-id>';
 *
 * No other edits required — the dashboard, lifecycle diagram, master
 * orchestrator, and per-stage routing all pick it up automatically.
 */

import './mapper';
import './verification';
import './ai-health';
import './export';

// Re-export the registry helpers so callers only need a single import path.
export { registerCouncil, getCouncils, getCouncilById, getCouncilForStage } from '../registry';
export type { CouncilDescriptor, CouncilSnapshot, MasterCouncilVerdict, Stage } from '../registry';
