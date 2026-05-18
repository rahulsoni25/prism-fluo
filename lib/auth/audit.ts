/**
 * lib/auth/audit.ts
 * Lightweight audit-log helper for admin actions. Writes one row per action
 * to admin_audit_log (table auto-created on first call so deploys don't need
 * a manual migration).
 *
 * Designed for low-volume admin events — fire-and-forget, never blocks the
 * caller path. Errors are logged but swallowed so a busted audit never breaks
 * the action it's logging.
 */

import { db } from '@/lib/db/client';

let ensured = false;

async function ensureTable(): Promise<void> {
  if (ensured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS admin_audit_log (
        id         BIGSERIAL PRIMARY KEY,
        actor_id   UUID,
        actor_email TEXT,
        action     TEXT NOT NULL,
        target_id  TEXT,
        target_email TEXT,
        details    JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log(created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_actor   ON admin_audit_log(actor_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_audit_action  ON admin_audit_log(action)`);
    ensured = true;
  } catch (e) {
    console.warn('[audit] ensureTable failed:', (e as Error).message);
  }
}

export async function logAdminAction(input: {
  actorId:     string;
  actorEmail?: string | null;
  action:      string;       // 'user.promote' | 'user.demote' | 'user.delete' | 'user.reset_password' | 'user.rename' | 'page.publish' | 'page.unpublish' …
  targetId?:   string | null;
  targetEmail?: string | null;
  details?:    Record<string, unknown> | null;
}): Promise<void> {
  await ensureTable();
  try {
    await db.query(
      `INSERT INTO admin_audit_log (actor_id, actor_email, action, target_id, target_email, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.actorId,
        input.actorEmail ?? null,
        input.action,
        input.targetId ?? null,
        input.targetEmail ?? null,
        input.details ? JSON.stringify(input.details) : null,
      ],
    );
  } catch (e) {
    console.warn('[audit] insert failed:', (e as Error).message, 'action=', input.action);
  }
}
