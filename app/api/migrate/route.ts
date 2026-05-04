/**
 * GET /api/migrate
 * Runs the complete PRISM schema against the connected database.
 * Safe to call multiple times — all statements use IF NOT EXISTS / IF EXISTS.
 * Uses a direct pg.Client (NOT the db wrapper) so real errors are visible.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

const FULL_SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL UNIQUE,
    name        TEXT,
    image       TEXT,
    provider    TEXT,
    provider_id TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login  TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);

CREATE TABLE IF NOT EXISTS sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    expires       TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);

CREATE TABLE IF NOT EXISTS accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider            TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    type                TEXT NOT NULL DEFAULT 'oauth',
    access_token        TEXT,
    refresh_token       TEXT,
    expires_at          BIGINT,
    token_type          TEXT,
    scope               TEXT,
    id_token            TEXT,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS uploads (
    id         UUID PRIMARY KEY,
    filename   TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_uploads_created ON uploads(created_at DESC);

CREATE TABLE IF NOT EXISTS gwi_time_spent (
    id               SERIAL PRIMARY KEY,
    upload_id        UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name       TEXT NOT NULL,
    question_name    TEXT NOT NULL,
    question_message TEXT,
    time_bucket      TEXT NOT NULL,
    audience         TEXT NOT NULL,
    audience_pct     NUMERIC,
    data_point_pct   NUMERIC,
    universe         NUMERIC,
    index_score      NUMERIC,
    responses        NUMERIC
);
CREATE INDEX IF NOT EXISTS idx_gwi_upload       ON gwi_time_spent(upload_id);
CREATE INDEX IF NOT EXISTS idx_gwi_upload_sheet ON gwi_time_spent(upload_id, sheet_name);
CREATE INDEX IF NOT EXISTS idx_gwi_index_score  ON gwi_time_spent(index_score DESC);

CREATE TABLE IF NOT EXISTS keywords (
    id                   SERIAL PRIMARY KEY,
    upload_id            UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name           TEXT NOT NULL,
    keyword              TEXT NOT NULL,
    avg_monthly_searches NUMERIC,
    competition          TEXT,
    competition_indexed  NUMERIC,
    bid_low              NUMERIC,
    bid_high             NUMERIC,
    tier                 TEXT CHECK (tier IN ('Primary', 'Secondary', 'Tertiary')),
    brand                TEXT,
    categories           TEXT,
    is_price_intent      BOOLEAN,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_kw_upload        ON keywords(upload_id);
CREATE INDEX IF NOT EXISTS idx_kw_upload_sheet  ON keywords(upload_id, sheet_name);

CREATE TABLE IF NOT EXISTS analyses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id    UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name   TEXT NOT NULL,
    filename     TEXT,
    results_json JSONB NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT analyses_upload_sheet_unique UNIQUE (upload_id, sheet_name)
);
CREATE INDEX IF NOT EXISTS idx_analyses_upload  ON analyses(upload_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC);

CREATE TABLE IF NOT EXISTS briefs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand           TEXT NOT NULL,
    category        TEXT,
    objective       TEXT,
    age_ranges      TEXT,
    gender          TEXT,
    sec             TEXT,
    market          TEXT,
    geography       TEXT,
    competitors     TEXT,
    background      TEXT,
    insight_buckets TEXT,
    status          TEXT NOT NULL DEFAULT 'waiting_for_data',
    analysis_id     UUID REFERENCES analyses(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_briefs_status  ON briefs(status);
CREATE INDEX IF NOT EXISTS idx_briefs_created ON briefs(created_at DESC);

CREATE TABLE IF NOT EXISTS upload_jobs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id   UUID REFERENCES uploads(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'processing'
                    CHECK (status IN ('processing', 'done', 'error')),
    error_msg   TEXT,
    sheet_count INTEGER DEFAULT 0,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS presentations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id   UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id   TEXT NOT NULL,
    template_name TEXT NOT NULL,
    brief_name    TEXT NOT NULL,
    headline      TEXT,
    pptx_data     BYTEA,
    pdf_data      BYTEA,
    status        TEXT NOT NULL DEFAULT 'generated'
                      CHECK (status IN ('pending', 'generating', 'generated', 'failed')),
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_presentations_user    ON presentations(user_id);
CREATE INDEX IF NOT EXISTS idx_presentations_created ON presentations(created_at DESC);

ALTER TABLE briefs   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL;
ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL;
ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS sla_hours  INTEGER;
ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE briefs   ADD COLUMN IF NOT EXISTS sla_hours           INTEGER;
ALTER TABLE briefs   ADD COLUMN IF NOT EXISTS sla_due_at          TIMESTAMP WITH TIME ZONE;
ALTER TABLE briefs   ADD COLUMN IF NOT EXISTS actual_completed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_briefs_user    ON briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user  ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user   ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_brief  ON uploads(brief_id);
CREATE INDEX IF NOT EXISTS idx_analyses_brief ON analyses(brief_id);

ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_status_check;
ALTER TABLE briefs ADD CONSTRAINT briefs_status_check
    CHECK (status IN ('draft', 'waiting_for_data', 'processing', 'ready'));
`;

export async function GET(req: NextRequest) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
  }

  // Use a direct Pool with a fresh client — bypasses the silent-error db wrapper
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  const client = await pool.connect();
  const results: string[] = [];
  const errors: string[] = [];

  try {
    // Split on semicolons, skip blank lines and comments
    const statements = FULL_SCHEMA
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        await client.query(stmt);
        const label = stmt.replace(/\s+/g, ' ').slice(0, 70);
        results.push(`✓ ${label}`);
      } catch (err: any) {
        const label = stmt.replace(/\s+/g, ' ').slice(0, 70);
        errors.push(`✗ ${label} → ${err.message}`);
      }
    }

    // Verify the key tables now exist
    const check = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
    );
    const tables = check.rows.map((r: any) => r.table_name);

    return NextResponse.json({
      ok: errors.length === 0,
      tables_now: tables,
      has_tool_data: tables.includes('tool_data'),
      has_uploads: tables.includes('uploads'),
      applied: results.length,
      errors,
      results,
    });
  } finally {
    client.release();
    await pool.end();
  }
}
