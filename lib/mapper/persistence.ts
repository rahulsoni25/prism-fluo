/**
 * lib/mapper/persistence.ts
 *
 * Persists Data Mapper Council verdicts so the admin UI can show what each
 * run decided (graded, compressed, kept original, etc.). Schema is auto-
 * created on first call — no migration step needed.
 */

import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import type { MapperVerdict } from './types';

let _schemaReady = false;

async function ensureMapperSchema(): Promise<void> {
  if (_schemaReady) return;
  _schemaReady = true;
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS mapper_runs (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename        TEXT NOT NULL,
        kind            TEXT,                          -- pdf | pptx | xlsx | csv | image | other
        original_bytes  BIGINT NOT NULL,
        final_bytes     BIGINT NOT NULL,
        grade           SMALLINT NOT NULL,
        ready           BOOLEAN NOT NULL,
        attempts        SMALLINT NOT NULL,
        elapsed_ms      INT NOT NULL,
        blockers        SMALLINT NOT NULL DEFAULT 0,
        majors          SMALLINT NOT NULL DEFAULT 0,
        minors          SMALLINT NOT NULL DEFAULT 0,
        strategies      TEXT[],
        findings_json   JSONB,
        user_id         UUID,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS mapper_runs_created_at_idx ON mapper_runs (created_at DESC);
      CREATE INDEX IF NOT EXISTS mapper_runs_grade_idx      ON mapper_runs (grade);
    `);
  } catch (err: any) {
    logger.warn('mapper:schema_init_failed', { error: err.message });
  }
}

function detectKind(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf'))  return 'pdf';
  if (lower.endsWith('.pptx')) return 'pptx';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return 'xlsx';
  if (lower.endsWith('.csv'))  return 'csv';
  if (/\.(png|jpe?g|webp|gif)$/.test(lower)) return 'image';
  return 'other';
}

/** Probabilistic retention: ~1% of recordMapperRun calls also delete rows
 *  older than 90 days. Avoids running a cron job for a low-traffic table. */
async function maybeRunRetention(): Promise<void> {
  if (Math.random() > 0.01) return;
  try {
    await db.query(`DELETE FROM mapper_runs WHERE created_at < NOW() - INTERVAL '90 days'`);
  } catch (err: any) {
    logger.warn('mapper:retention_failed', { error: err.message });
  }
}

export async function recordMapperRun(
  filename: string,
  verdict: MapperVerdict,
  userId: string | null | undefined,
): Promise<void> {
  await ensureMapperSchema();
  await maybeRunRetention();
  try {
    const blockers = verdict.findings.filter(f => f.severity === 'blocker').length;
    const majors   = verdict.findings.filter(f => f.severity === 'major').length;
    const minors   = verdict.findings.filter(f => f.severity === 'minor').length;
    const strategies = verdict.compressor?.strategiesApplied ?? [];

    await db.query(
      `INSERT INTO mapper_runs (
         filename, kind, original_bytes, final_bytes, grade, ready, attempts,
         elapsed_ms, blockers, majors, minors, strategies, findings_json, user_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        filename,
        detectKind(filename),
        verdict.compressor?.originalSize ?? verdict.finalBuffer.length,
        verdict.finalBuffer.length,
        verdict.grade,
        verdict.ready,
        verdict.attempts,
        verdict.elapsedMs,
        blockers, majors, minors,
        strategies,
        JSON.stringify(verdict.findings),
        userId ?? null,
      ],
    );
  } catch (err: any) {
    // Persistence is best-effort — never block an upload because the log write failed
    logger.warn('mapper:persist_failed', { filename, error: err.message });
  }
}
