/**
 * lib/audit.ts
 *
 * Audit log — every meaningful action a user takes gets a row in
 * `audit_events`. Powers the /admin/audit-log page and the procurement-
 * facing "downloadable audit trail" feature priced at ₹10K/mo.
 *
 * Design notes:
 *   - Auto-migrates: first write attempts `CREATE TABLE IF NOT EXISTS`
 *   - Fire-and-forget at call sites — never block a user action on logging
 *   - JSONB metadata so we can extend without schema changes
 *   - Indexed on (user_id, occurred_at) for the most common admin query
 *
 * Event kinds (keep narrow + meaningful):
 *   - `brief.create`     — new brief
 *   - `brief.read`       — opened the /insights page
 *   - `upload.create`    — file uploaded
 *   - `analysis.run`     — analysis triggered
 *   - `analysis.export.pptx` / .pdf / .xlsx
 *   - `copilot.ask`      — question asked of the Co-Pilot
 *   - `share.create`     — public share link generated
 *   - `share.revoke`     — share link disabled
 *   - `share.view`       — someone opened a share link (visitor, not user)
 *   - `auth.login` / .logout / .signup
 *   - `admin.*`          — anything done from an admin page
 */

import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

let _schemaReady = false;
async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  _schemaReady = true;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id           BIGSERIAL PRIMARY KEY,
        occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        user_id      UUID,
        user_email   TEXT,
        kind         TEXT NOT NULL,
        target_type  TEXT,
        target_id    TEXT,
        ip           TEXT,
        user_agent   TEXT,
        metadata     JSONB DEFAULT '{}'::jsonb
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS audit_events_user_ts_idx
                    ON audit_events (user_id, occurred_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS audit_events_kind_ts_idx
                    ON audit_events (kind, occurred_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS audit_events_target_idx
                    ON audit_events (target_type, target_id)`);
  } catch (err: any) {
    logger.warn('audit:schema_init_failed', { error: err.message });
  }
}

export type AuditEventKind =
  | 'brief.create' | 'brief.read' | 'brief.update'
  | 'upload.create' | 'upload.supersede'
  | 'analysis.run' | 'analysis.export.pptx' | 'analysis.export.pdf' | 'analysis.export.xlsx'
  | 'copilot.ask'
  | 'share.create' | 'share.revoke' | 'share.view'
  | 'auth.login' | 'auth.logout' | 'auth.signup'
  | 'admin.read' | 'admin.update'
  | 'audience_labels.save';

export interface AuditWrite {
  kind:        AuditEventKind;
  userId?:     string | null;
  userEmail?:  string | null;
  targetType?: string | null;
  targetId?:   string | null;
  ip?:         string | null;
  userAgent?:  string | null;
  metadata?:   Record<string, unknown>;
}

/**
 * Record an audit event. Fire-and-forget — never throws, never blocks.
 * Safe to call from any API route or server action.
 */
export async function audit(ev: AuditWrite): Promise<void> {
  // Don't await this in production hot paths — the caller can fire-and-forget.
  try {
    await ensureSchema();
    await db.query(
      `INSERT INTO audit_events
         (user_id, user_email, kind, target_type, target_id, ip, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        ev.userId ?? null,
        ev.userEmail ?? null,
        ev.kind,
        ev.targetType ?? null,
        ev.targetId ?? null,
        ev.ip ?? null,
        (ev.userAgent ?? null)?.slice(0, 500),  // cap for safety
        JSON.stringify(ev.metadata ?? {}),
      ],
    );
  } catch (err: any) {
    // Logging only — never propagate to caller. An audit insert failing must
    // not break the user's actual action.
    logger.warn('audit:insert_failed', { kind: ev.kind, error: err.message });
  }
}

/**
 * Pull a page of audit events for the admin UI. Most recent first.
 */
export async function listAuditEvents(opts: {
  kind?:       AuditEventKind | string;
  userId?:     string;
  targetType?: string;
  targetId?:   string;
  since?:      Date;
  until?:      Date;
  limit?:      number;
  offset?:     number;
}): Promise<{ rows: any[]; total: number }> {
  await ensureSchema();
  const where: string[] = [];
  const params: any[]   = [];
  const add = (clause: string, val: any) => { params.push(val); where.push(clause.replace('$', `$${params.length}`)); };

  if (opts.kind)       add('kind = $',         opts.kind);
  if (opts.userId)     add('user_id = $',      opts.userId);
  if (opts.targetType) add('target_type = $',  opts.targetType);
  if (opts.targetId)   add('target_id = $',    opts.targetId);
  if (opts.since)      add('occurred_at >= $', opts.since.toISOString());
  if (opts.until)      add('occurred_at <= $', opts.until.toISOString());

  const w     = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const limit  = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
  const offset = Math.max(opts.offset ?? 0, 0);

  const [{ rows: data }, { rows: countRows }] = await Promise.all([
    db.query(
      `SELECT id, occurred_at, user_id, user_email, kind, target_type, target_id, ip, metadata
         FROM audit_events ${w}
        ORDER BY occurred_at DESC, id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      params,
    ),
    db.query(`SELECT COUNT(*)::int AS n FROM audit_events ${w}`, params),
  ]);
  return { rows: data, total: countRows[0]?.n ?? 0 };
}

/**
 * Stream every matching event as CSV — used by the admin "Export CSV"
 * button. Cap at 50,000 rows to stop accidental memory blow-ups.
 */
export async function exportAuditEventsCsv(opts: Parameters<typeof listAuditEvents>[0]): Promise<string> {
  const { rows } = await listAuditEvents({ ...opts, limit: 50000, offset: 0 });
  const header = ['occurred_at', 'user_email', 'kind', 'target_type', 'target_id', 'ip', 'metadata'];
  const escape = (v: any) => {
    if (v == null) return '';
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.occurred_at?.toISOString?.() ?? r.occurred_at,
      r.user_email,
      r.kind,
      r.target_type,
      r.target_id,
      r.ip,
      r.metadata,
    ].map(escape).join(','));
  }
  return lines.join('\n');
}

/**
 * Helper for API routes — extract IP + UA from a NextRequest into the
 * AuditWrite-compatible shape.
 */
export function reqMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null;
  const userAgent = req.headers.get('user-agent') || null;
  return { ip, userAgent };
}
