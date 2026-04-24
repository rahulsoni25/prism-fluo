-- ============================================================
-- PRISM DATABASE SCHEMA  (Railway Postgres / Supabase Postgres)
-- Run via:  node scripts/init_db.mjs
-- ============================================================

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
