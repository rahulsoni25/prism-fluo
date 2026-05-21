/**
 * lib/ai/fallback-monitor.ts
 *
 * "Security guard" for every AI call in the system. Every time an LLM:
 *   • cascades from a primary model to a backup,
 *   • drops out of the LLM path entirely and uses a deterministic
 *     fallback,
 *   • exhausts all retries and serves a stale-cache response,
 * → we record the event so admins can see at a glance whether the AI
 * layer is healthy.
 *
 * Stored in ai_fallback_events (auto-created). Cheap fire-and-forget
 * inserts; failures here never affect the originating LLM call.
 *
 * Severity ladder:
 *   info  — soft cascade (one model tried, second succeeded). Expected.
 *   warn  — multiple models needed (>2 tries). Investigate.
 *   alert — fully exhausted, served extractive/cached. Active incident.
 *
 * Burst detection: 5+ alerts in 5 minutes triggers a one-off SMTP email
 * to NOTIFY_EMAIL so someone wakes up if the LLM stack is down.
 */

import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

let ensured = false;
async function ensureTable() {
  if (ensured) return;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS ai_fallback_events (
        id          BIGSERIAL PRIMARY KEY,
        kind        TEXT NOT NULL,
        severity    TEXT NOT NULL CHECK (severity IN ('info','warn','alert')),
        surface     TEXT NOT NULL,
        primary_model  TEXT,
        actual_model   TEXT,
        attempts    INTEGER NOT NULL DEFAULT 1,
        error_message TEXT,
        details     JSONB,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ai_fallback_created ON ai_fallback_events(created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ai_fallback_severity ON ai_fallback_events(severity, created_at DESC)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_ai_fallback_surface ON ai_fallback_events(surface)`);
    ensured = true;
  } catch (e) {
    // Suppressed — monitor must never break the surface it's monitoring
  }
}

export type FallbackKind   = 'model-cascade' | 'extractive-fallback' | 'cache-stale' | 'all-models-down' | 'rate-limit-fallback';
export type FallbackSeverity = 'info' | 'warn' | 'alert';

interface FallbackEvent {
  kind:         FallbackKind;
  severity:     FallbackSeverity;
  surface:      string;       // 'context-summary' | 'copilot' | 'verify-llm' | 'analyze-data' | 'gemini-overview' | etc.
  primaryModel?: string;
  actualModel?: string;
  attempts?:    number;
  errorMessage?: string;
  details?:     Record<string, unknown>;
}

// In-memory burst counter — survives within one Node process. Used to fire
// the SMTP alert at most once per window (rather than spamming on each event).
let burstCount = 0;
let burstWindowStartedAt = 0;
let lastBurstAlertAt = 0;
const BURST_THRESHOLD = 5;          // 5+ alerts in 5 min triggers email
const BURST_WINDOW_MS = 5 * 60_000;
const ALERT_COOLDOWN_MS = 30 * 60_000; // don't send another alert email within 30 min

async function maybeSendBurstAlert(event: FallbackEvent) {
  if (event.severity !== 'alert') return;
  const now = Date.now();
  if (now - burstWindowStartedAt > BURST_WINDOW_MS) {
    burstWindowStartedAt = now;
    burstCount = 0;
  }
  burstCount++;
  if (burstCount < BURST_THRESHOLD) return;
  if (now - lastBurstAlertAt < ALERT_COOLDOWN_MS) return;

  lastBurstAlertAt = now;
  // Send a no-reply alert email via the existing SMTP transport. Avoids new infra.
  try {
    const { sendBurstAlertEmail } = await import('@/lib/email');
    if (typeof sendBurstAlertEmail === 'function') {
      await sendBurstAlertEmail(
        `AI fallback burst — ${burstCount} alerts in last 5 min`,
        `Surface: ${event.surface}\nKind: ${event.kind}\nLast error: ${event.errorMessage || 'n/a'}\n\nVisit /admin/ai-health for the full event log.`,
      );
    }
  } catch (e) {
    logger.warn('fallback-monitor:burst-alert-failed', { error: (e as Error).message });
  }
}

/**
 * Record a fallback event. Fire-and-forget. Returns immediately; the DB
 * insert happens async.
 */
export function recordFallback(event: FallbackEvent): void {
  // Always console-log so it shows up in Vercel runtime logs immediately
  const tag = event.severity === 'alert' ? '🚨' : event.severity === 'warn' ? '⚠️ ' : 'ℹ️ ';
  logger.warn('ai:fallback', {
    tag,
    kind: event.kind,
    severity: event.severity,
    surface: event.surface,
    primaryModel: event.primaryModel,
    actualModel: event.actualModel,
    attempts: event.attempts,
    errorMessage: event.errorMessage?.slice(0, 200),
  });

  // Persist + maybe email — never await from caller
  (async () => {
    try {
      await ensureTable();
      await db.query(
        `INSERT INTO ai_fallback_events
           (kind, severity, surface, primary_model, actual_model, attempts, error_message, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          event.kind,
          event.severity,
          event.surface,
          event.primaryModel ?? null,
          event.actualModel ?? null,
          event.attempts ?? 1,
          event.errorMessage?.slice(0, 1000) ?? null,
          event.details ? JSON.stringify(event.details) : null,
        ],
      );
      await maybeSendBurstAlert(event);
    } catch {
      // Suppressed — monitor must not break the surface it monitors
    }
  })();
}

/**
 * Recent events for the admin panel. Lightweight read — no auth check
 * here, the caller is responsible (the /api/admin/ai-health route is).
 */
export async function recentFallbackEvents(opts: { limit?: number; severity?: FallbackSeverity } = {}) {
  await ensureTable();
  const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
  const params: any[] = [];
  let where = '';
  if (opts.severity) { params.push(opts.severity); where = 'WHERE severity = $1'; }
  params.push(limit);
  const { rows } = await db.query(
    `SELECT id, kind, severity, surface, primary_model, actual_model, attempts,
            error_message, details, created_at
       FROM ai_fallback_events
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
    params,
  );
  return rows;
}

/** Aggregate counts by (surface, severity) over the last N hours. */
export async function fallbackSummary(hours = 24) {
  await ensureTable();
  const { rows } = await db.query(
    `SELECT surface, severity, COUNT(*)::int AS n
       FROM ai_fallback_events
       WHERE created_at > NOW() - ($1::int || ' hours')::interval
       GROUP BY surface, severity
       ORDER BY n DESC`,
    [hours],
  );
  return rows;
}
