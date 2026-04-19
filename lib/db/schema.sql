-- PRISM DATABASE SCHEMA
-- Target: Railway Postgres / Supabase Postgres

CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY,
    filename TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gwi_time_spent (
    id SERIAL PRIMARY KEY,
    upload_id UUID REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    question_name TEXT NOT NULL,
    question_message TEXT,
    time_bucket TEXT NOT NULL,
    audience TEXT NOT NULL,
    audience_pct NUMERIC,
    data_point_pct NUMERIC,
    universe NUMERIC,
    index_score NUMERIC,
    responses NUMERIC
);

CREATE TABLE IF NOT EXISTS keywords (
    id SERIAL PRIMARY KEY,
    upload_id UUID REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    keyword TEXT NOT NULL,
    avg_monthly_searches NUMERIC,
    competition TEXT,
    competition_indexed NUMERIC,
    bid_low NUMERIC,
    bid_high NUMERIC,
    tier TEXT CHECK (tier IN ('Primary', 'Secondary', 'Tertiary')),
    brand TEXT,
    categories TEXT,
    is_price_intent BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for fast retrieval
CREATE INDEX IF NOT EXISTS idx_gwi_upload ON gwi_time_spent(upload_id);
CREATE INDEX IF NOT EXISTS idx_kw_upload ON keywords(upload_id);
