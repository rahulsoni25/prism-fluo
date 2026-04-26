/**
 * lib/sla.ts
 * Deterministic SLA calculation for briefs.
 *
 * Formula (per spec):
 *   sla_hours = ceil(4 + min(2, N * 0.5))
 *   sla_due_at = now + sla_hours
 *
 * Where N is the number of currently-active briefs (status in
 * 'waiting_for_data' or 'processing'). Resolves to:
 *   N=0 → 4h
 *   N=1 → 5h        (4 + 0.5 = 4.5 → ceil 5)
 *   N=2 → 5h        (4 + 1.0 = 5)
 *   N=3 → 6h        (4 + 1.5 = 5.5 → ceil 6)
 *   N=4 → 6h        (4 + 2.0 = 6)
 *   N≥4 → 6h        (the +2 cap holds)
 *
 * Stays under-promise / over-deliver — never exceeds 6h baseline.
 */

import { db } from '@/lib/db/client';

export interface SlaResult {
  slaHours:  number;
  slaDueAt:  Date;
  activeBriefs: number;
}

/** Count briefs currently in flight across the system. */
export async function countActiveBriefs(): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM briefs
      WHERE status IN ('waiting_for_data', 'processing')`,
  );
  return rows[0]?.n ?? 0;
}

/** Pure formula — no DB access. Useful for tests and the UI. */
export function computeSla(activeBriefs: number, now: Date = new Date()): SlaResult {
  const raw       = 4 + Math.min(2, activeBriefs * 0.5);
  const slaHours  = Math.ceil(raw);
  const slaDueAt  = new Date(now.getTime() + slaHours * 60 * 60 * 1000);
  return { slaHours, slaDueAt, activeBriefs };
}

/** Convenience — fetches active count, computes, returns the bundle. */
export async function calculateSla(now: Date = new Date()): Promise<SlaResult> {
  const activeBriefs = await countActiveBriefs();
  return computeSla(activeBriefs, now);
}
