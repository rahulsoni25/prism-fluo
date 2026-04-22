-- PRISM DATABASE SCHEMA (SQLite Version)
-- Target: Zero-Config Local Development

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id),
    filename TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS gwi_time_spent (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id TEXT REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    question_name TEXT NOT NULL,
    question_message TEXT,
    time_bucket TEXT NOT NULL,
    audience TEXT NOT NULL,
    audience_pct REAL,
    data_point_pct REAL,
    universe REAL,
    index_score REAL,
    responses REAL
);

CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id TEXT REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    keyword TEXT NOT NULL,
    avg_monthly_searches REAL,
    competition TEXT,
    competition_indexed REAL,
    bid_low REAL,
    bid_high REAL,
    tier TEXT CHECK (tier IN ('Primary', 'Secondary', 'Tertiary')),
    brand TEXT,
    categories TEXT,
    is_price_intent INTEGER, -- SQLite uses 0/1 for boolean
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Generic data storage for non-standard sheets (Helium10, SimilarWeb, etc)
CREATE TABLE IF NOT EXISTS generic_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id TEXT NOT NULL,
    sheet_name TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    row_data TEXT NOT NULL, -- JSON string of row key-values
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_gwi_upload ON gwi_time_spent(upload_id);
CREATE INDEX IF NOT EXISTS idx_kw_upload ON keywords(upload_id);
CREATE INDEX IF NOT EXISTS idx_generic_upload ON generic_data(upload_id);

CREATE TABLE IF NOT EXISTS datasets (
    dataset_id TEXT PRIMARY KEY,
    upload_id TEXT REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    source TEXT NOT NULL,      -- e.g. 'GWI', 'GoogleTrends'
    topic TEXT NOT NULL,       -- e.g. 'TimeSpent', 'SearchDemand'
    geography TEXT,            -- e.g. 'India'
    period TEXT,               -- e.g. 'Q2 2024'
    metric_type TEXT,          -- e.g. 'ShareOfAudience'
    grain TEXT,                -- e.g. 'TimeSeries'
    primary_keys TEXT,         -- JSON array of primary key columns
    entities TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generated_insights (
    id TEXT PRIMARY KEY,
    upload_id TEXT NOT NULL,
    topic TEXT NOT NULL, -- content, commerce, communication, culture
    content JSON NOT NULL, -- The full insight card JSON
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dataset_upload ON datasets(upload_id);
CREATE INDEX IF NOT EXISTS idx_dataset_topic ON datasets(topic);
CREATE INDEX IF NOT EXISTS idx_gen_ins_upload ON generated_insights(upload_id);

