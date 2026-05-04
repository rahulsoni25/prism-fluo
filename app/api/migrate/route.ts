/**
 * GET /api/migrate
 * One-shot schema migration endpoint.
 * Hit this once from the browser when deploying to a fresh DB or after
 * schema changes. Safe to run multiple times (all statements are idempotent).
 *
 * Secured by MIGRATION_SECRET env var — set it in Vercel dashboard and
 * call: /api/migrate?secret=YOUR_SECRET
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';

const MIGRATION_SQL = `
-- Add optional columns to uploads if they don't exist yet
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS user_id    UUID REFERENCES users(id)   ON DELETE CASCADE;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS brief_id   UUID REFERENCES briefs(id)  ON DELETE SET NULL;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS sla_hours  INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_uploads_user      ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_brief     ON uploads(brief_id);
CREATE INDEX IF NOT EXISTS idx_uploads_sla_due_at ON uploads(sla_due_at);

-- SLA + status fields on briefs
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS sla_hours           INTEGER;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS sla_due_at          TIMESTAMP WITH TIME ZONE;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS actual_completed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS user_id             UUID REFERENCES users(id) ON DELETE CASCADE;

-- Extend status check to include waiting_for_data
ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_status_check;
ALTER TABLE briefs ADD  CONSTRAINT briefs_status_check
  CHECK (status IN ('draft', 'waiting_for_data', 'processing', 'ready'));

CREATE INDEX IF NOT EXISTS idx_briefs_user ON briefs(user_id);

-- Generic Tool Data table (Helium10, Google Trends, GWI Core, Konnect, PDF…)
CREATE TABLE IF NOT EXISTS tool_data (
  id          SERIAL PRIMARY KEY,
  upload_id   UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  sheet_name  TEXT NOT NULL,
  tool_type   TEXT NOT NULL DEFAULT 'generic',
  row_data    JSONB NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tool_data_upload       ON tool_data(upload_id);
CREATE INDEX IF NOT EXISTS idx_tool_data_upload_sheet ON tool_data(upload_id, sheet_name);
CREATE INDEX IF NOT EXISTS idx_tool_data_tool_type    ON tool_data(tool_type);
`;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  const expected = process.env.MIGRATION_SECRET;

  if (expected && secret !== expected) {
    return NextResponse.json({ error: 'Forbidden — pass ?secret=YOUR_MIGRATION_SECRET' }, { status: 403 });
  }

  const results: string[] = [];
  const errors:  string[] = [];

  // Run each statement individually so one failure doesn't abort the rest
  const stmts = MIGRATION_SQL
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of stmts) {
    try {
      await db.query(stmt);
      results.push(`✓ ${stmt.slice(0, 80)}…`);
    } catch (err: any) {
      errors.push(`✗ ${stmt.slice(0, 80)}… → ${err.message}`);
    }
  }

  return NextResponse.json({
    ok:      errors.length === 0,
    applied: results.length,
    errors,
    results,
  });
}
