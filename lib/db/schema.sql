-- ============================================================
-- PRISM DATABASE SCHEMA  (Railway Postgres / Supabase Postgres)
-- Run via:  node scripts/init_db.mjs
-- ============================================================

-- ── Users (Auth.js + multi-tenant ownership) ────────────────
-- Created BEFORE briefs/analyses/uploads so their user_id FKs resolve.

CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL UNIQUE,
    name        TEXT,
    image       TEXT,
    provider    TEXT,                  -- 'google' | 'linkedin' | 'demo'
    provider_id TEXT,                  -- the provider's user id
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login  TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider, provider_id);

-- Auth.js sessions (DB strategy — survives restarts, supports revocation)
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

-- Auth.js OAuth account links (one user can have multiple providers)
CREATE TABLE IF NOT EXISTS accounts (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider           TEXT NOT NULL,
    provider_account_id TEXT NOT NULL,
    type               TEXT NOT NULL DEFAULT 'oauth',
    access_token       TEXT,
    refresh_token      TEXT,
    expires_at         BIGINT,
    token_type         TEXT,
    scope              TEXT,
    id_token           TEXT,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

-- ── Core Upload Registry ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS uploads (
    id          UUID PRIMARY KEY,
    filename    TEXT NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── GWI Time-Spent Data ──────────────────────────────────────

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

-- ── Keyword Plans ────────────────────────────────────────────

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

-- ── Saved Analyses  (must be created BEFORE briefs) ──────────

CREATE TABLE IF NOT EXISTS analyses (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id    UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name   TEXT NOT NULL,
    filename     TEXT,
    results_json JSONB NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Prevents duplicate analysis rows for the same sheet
    CONSTRAINT analyses_upload_sheet_unique UNIQUE (upload_id, sheet_name)
);

-- ── Insight Briefs  (references analyses) ────────────────────

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
    status          TEXT NOT NULL DEFAULT 'processing'
                        CHECK (status IN ('draft', 'processing', 'ready')),
    analysis_id     UUID REFERENCES analyses(id) ON DELETE SET NULL,
    created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ── Upload Jobs (background processing status) ────────────────

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

-- ============================================================
-- INDEXES
-- Keeps dashboard queries and upload lookups fast even at scale
-- ============================================================

-- Uploads
CREATE INDEX IF NOT EXISTS idx_uploads_created     ON uploads(created_at DESC);

-- GWI
CREATE INDEX IF NOT EXISTS idx_gwi_upload          ON gwi_time_spent(upload_id);
CREATE INDEX IF NOT EXISTS idx_gwi_upload_sheet    ON gwi_time_spent(upload_id, sheet_name);
CREATE INDEX IF NOT EXISTS idx_gwi_index_score     ON gwi_time_spent(index_score DESC);
CREATE INDEX IF NOT EXISTS idx_gwi_audience        ON gwi_time_spent(audience);

-- Keywords
CREATE INDEX IF NOT EXISTS idx_kw_upload           ON keywords(upload_id);
CREATE INDEX IF NOT EXISTS idx_kw_upload_sheet     ON keywords(upload_id, sheet_name);
CREATE INDEX IF NOT EXISTS idx_kw_tier             ON keywords(tier);
CREATE INDEX IF NOT EXISTS idx_kw_searches         ON keywords(avg_monthly_searches DESC);
CREATE INDEX IF NOT EXISTS idx_kw_brand            ON keywords(brand);

-- Analyses
CREATE INDEX IF NOT EXISTS idx_analyses_upload     ON analyses(upload_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created    ON analyses(created_at DESC);

-- Briefs
CREATE INDEX IF NOT EXISTS idx_briefs_status       ON briefs(status);
CREATE INDEX IF NOT EXISTS idx_briefs_created      ON briefs(created_at DESC);

-- Jobs
CREATE INDEX IF NOT EXISTS idx_jobs_upload         ON upload_jobs(upload_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status         ON upload_jobs(status);

-- ============================================================
-- MULTI-USER MIGRATION (additive — safe to re-run)
-- Adds user_id ownership to existing tables + SLA fields to briefs.
-- ============================================================

-- Ownership FKs (nullable so existing rows are not orphaned)
ALTER TABLE briefs   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_briefs_user    ON briefs(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_user  ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user   ON uploads(user_id);

-- Brief linkage on uploads/analyses — files attach to the right brief
ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_uploads_brief  ON uploads(brief_id);
CREATE INDEX IF NOT EXISTS idx_analyses_brief ON analyses(brief_id);

-- SLA fields on uploads — allow custom SLA per upload
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS sla_hours INTEGER;
ALTER TABLE uploads ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_uploads_sla_due_at ON uploads(sla_due_at);

-- SLA fields on briefs
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS sla_hours           INTEGER;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS sla_due_at          TIMESTAMP WITH TIME ZONE;
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS actual_completed_at TIMESTAMP WITH TIME ZONE;

-- Extend status check to include the new lifecycle states
-- (drop + re-add — the only way to alter a CHECK in Postgres)
ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_status_check;
ALTER TABLE briefs ADD CONSTRAINT briefs_status_check
    CHECK (status IN ('draft', 'waiting_for_data', 'processing', 'ready'));

-- ── Generic Tool Data (Helium10, Google Trends, Konnect, etc.) ─
CREATE TABLE IF NOT EXISTS tool_data (
    id          SERIAL PRIMARY KEY,
    upload_id   UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name  TEXT NOT NULL,
    tool_type   TEXT NOT NULL DEFAULT 'generic',
    row_data    JSONB NOT NULL,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tool_data_upload_sheet ON tool_data(upload_id, sheet_name);
CREATE INDEX IF NOT EXISTS idx_tool_data_tool_type    ON tool_data(tool_type);
