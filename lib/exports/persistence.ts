/**
 * lib/exports/persistence.ts
 *
 * Persists Export Gatekeeper verdicts so the admin UI can see which
 * downloads were allowed / asked / blocked. Mirror of lib/mapper/persistence.ts.
 *
 * Schema auto-creates on first call — no migration step.
 */

import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';

let _schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (_schemaReady) return;
  _schemaReady = true;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS export_runs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        analysis_id     UUID,
        format          TEXT NOT NULL,                  -- 'pdf' | 'xlsx'
        action          TEXT NOT NULL,                  -- 'allow' | 'ask' | 'block'
        confidence      SMALLINT,
        bytes           BIGINT,
        inspector_blockers SMALLINT NOT NULL DEFAULT 0,
        inspector_majors   SMALLINT NOT NULL DEFAULT 0,
        content_blockers   SMALLINT NOT NULL DEFAULT 0,
        content_majors     SMALLINT NOT NULL DEFAULT 0,
        reasoning       TEXT,
        elapsed_ms      INT NOT NULL,
        user_id         UUID,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS export_runs_created_at_idx ON export_runs (created_at DESC);
      CREATE INDEX IF NOT EXISTS export_runs_action_idx     ON export_runs (action);
    `);
  } catch (err: any) {
    logger.warn('export:schema_init_failed', { error: err.message });
  }
}

async function maybeRunRetention(): Promise<void> {
  if (Math.random() > 0.01) return;
  try {
    await db.query(`DELETE FROM export_runs WHERE created_at < NOW() - INTERVAL '90 days'`);
  } catch (err: any) {
    logger.warn('export:retention_failed', { error: err.message });
  }
}

export interface ExportRunRecord {
  analysisId:    string | null;
  format:        'pdf' | 'xlsx';
  action:        'allow' | 'ask' | 'block';
  confidence:    number | null;
  bytes:         number;
  inspectorBlockers: number;
  inspectorMajors:   number;
  contentBlockers:   number;
  contentMajors:     number;
  reasoning:     string;
  elapsedMs:     number;
  userId:        string | null;
}

export async function recordExportRun(rec: ExportRunRecord): Promise<void> {
  await ensureSchema();
  await maybeRunRetention();
  try {
    await db.query(
      `INSERT INTO export_runs (
         analysis_id, format, action, confidence, bytes,
         inspector_blockers, inspector_majors, content_blockers, content_majors,
         reasoning, elapsed_ms, user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        rec.analysisId, rec.format, rec.action, rec.confidence, rec.bytes,
        rec.inspectorBlockers, rec.inspectorMajors, rec.contentBlockers, rec.contentMajors,
        rec.reasoning, rec.elapsedMs, rec.userId,
      ],
    );
  } catch (err: any) {
    logger.warn('export:persist_failed', { error: err.message });
  }
}
