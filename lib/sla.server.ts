'use server';

/**
 * lib/sla.server.ts
 * Server-only SLA functions that require database access
 */

import { db } from '@/lib/db/client';
import { computeSla, SlaResult } from './sla';

/** Count briefs currently in flight across the system. */
export async function countActiveBriefs(): Promise<number> {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n
       FROM briefs
      WHERE status IN ('waiting_for_data', 'processing')`,
  );
  return rows[0]?.n ?? 0;
}

/** Convenience — fetches active count, computes, returns the bundle. */
export async function calculateSla(now: Date = new Date()): Promise<SlaResult> {
  const activeBriefs = await countActiveBriefs();
  return computeSla(activeBriefs, now);
}
