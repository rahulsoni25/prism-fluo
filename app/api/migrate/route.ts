/**
 * GET /api/migrate  — one-shot full schema migration
 * Uses a DIRECT Supabase connection (port 5432, not 6543 pooler)
 * because the transaction pooler rejects DDL statements.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const maxDuration = 60;

// Full PRISM schema — identical to lib/db/schema.sql
const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE, name TEXT, image TEXT,
    provider TEXT, provider_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(), last_login TIMESTAMPTZ)`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,

  `CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    expires TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id)`,

  `CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, provider_account_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'oauth',
    access_token TEXT, refresh_token TEXT, expires_at BIGINT,
    token_type TEXT, scope TEXT, id_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (provider, provider_account_id))`,

  `CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY, filename TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_uploads_created ON uploads(created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS gwi_time_spent (
    id SERIAL PRIMARY KEY,
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL, question_name TEXT NOT NULL,
    question_message TEXT, time_bucket TEXT NOT NULL, audience TEXT NOT NULL,
    audience_pct NUMERIC, data_point_pct NUMERIC,
    universe NUMERIC, index_score NUMERIC, responses NUMERIC)`,
  `CREATE INDEX IF NOT EXISTS idx_gwi_upload       ON gwi_time_spent(upload_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gwi_upload_sheet ON gwi_time_spent(upload_id, sheet_name)`,

  `CREATE TABLE IF NOT EXISTS keywords (
    id SERIAL PRIMARY KEY,
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL, keyword TEXT NOT NULL,
    avg_monthly_searches NUMERIC, competition TEXT, competition_indexed NUMERIC,
    bid_low NUMERIC, bid_high NUMERIC,
    tier TEXT CHECK (tier IN ('Primary','Secondary','Tertiary')),
    brand TEXT, categories TEXT, is_price_intent BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_kw_upload       ON keywords(upload_id)`,
  `CREATE INDEX IF NOT EXISTS idx_kw_upload_sheet ON keywords(upload_id, sheet_name)`,

  `CREATE TABLE IF NOT EXISTS analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL, filename TEXT,
    results_json JSONB NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT analyses_upload_sheet_unique UNIQUE (upload_id, sheet_name))`,
  `CREATE INDEX IF NOT EXISTS idx_analyses_upload  ON analyses(upload_id)`,
  `CREATE INDEX IF NOT EXISTS idx_analyses_created ON analyses(created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand TEXT NOT NULL, category TEXT, objective TEXT,
    age_ranges TEXT, gender TEXT, sec TEXT, market TEXT, geography TEXT,
    competitors TEXT, background TEXT, insight_buckets TEXT,
    status TEXT NOT NULL DEFAULT 'waiting_for_data',
    analysis_id UUID REFERENCES analyses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_briefs_status  ON briefs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_briefs_created ON briefs(created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS tool_data (
    id SERIAL PRIMARY KEY,
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    tool_type TEXT NOT NULL DEFAULT 'generic',
    row_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_tool_data_upload       ON tool_data(upload_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tool_data_upload_sheet ON tool_data(upload_id, sheet_name)`,

  `CREATE TABLE IF NOT EXISTS presentations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id TEXT NOT NULL, template_name TEXT NOT NULL, brief_name TEXT NOT NULL,
    headline TEXT, pptx_data BYTEA, pdf_data BYTEA,
    status TEXT NOT NULL DEFAULT 'generated'
      CHECK (status IN ('pending','generating','generated','failed')),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`,
  `CREATE INDEX IF NOT EXISTS idx_presentations_user    ON presentations(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_presentations_created ON presentations(created_at DESC)`,

  // Additive column migrations
  `ALTER TABLE briefs   ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`,
  `ALTER TABLE analyses ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`,
  `ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`,
  `ALTER TABLE analyses ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL`,
  `ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS brief_id UUID REFERENCES briefs(id) ON DELETE SET NULL`,
  `ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS sla_hours INTEGER`,
  `ALTER TABLE uploads  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ`,
  `ALTER TABLE briefs   ADD COLUMN IF NOT EXISTS sla_hours INTEGER`,
  `ALTER TABLE briefs   ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ`,
  `ALTER TABLE briefs   ADD COLUMN IF NOT EXISTS actual_completed_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS idx_briefs_user    ON briefs(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_analyses_user  ON analyses(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_uploads_user   ON uploads(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_uploads_brief  ON uploads(brief_id)`,
  `CREATE INDEX IF NOT EXISTS idx_analyses_brief ON analyses(brief_id)`,
  `ALTER TABLE briefs DROP CONSTRAINT IF EXISTS briefs_status_check`,
  `ALTER TABLE briefs ADD CONSTRAINT briefs_status_check CHECK (status IN ('draft','waiting_for_data','processing','ready'))`,
];

/** Convert pooler URL (port 6543) → direct Supabase URL (port 5432) for DDL */
function toDirectUrl(poolerUrl: string): string {
  try {
    const u = new URL(poolerUrl);
    // username like postgres.euwvjzszgnbuabyrvxhr → extract project ref
    const projectRef = u.username.split('.')[1];
    if (!projectRef) return poolerUrl; // not a pooler URL, use as-is
    const direct = new URL(poolerUrl);
    direct.host = `db.${projectRef}.supabase.co`;
    direct.port = '5432';
    direct.username = 'postgres';
    return direct.toString();
  } catch {
    return poolerUrl;
  }
}

export async function GET(req: NextRequest) {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });
  }

  const directUrl = toDirectUrl(rawUrl);
  const pool = new Pool({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 15_000,
  });

  const results: string[] = [];
  const errors:  string[] = [];
  let client: any;

  try {
    client = await pool.connect();
  } catch (connErr: any) {
    await pool.end().catch(() => {});
    return NextResponse.json({
      error: `Cannot connect to database: ${connErr.message}`,
      tried_url: directUrl.replace(/:([^:@]+)@/, ':***@'),
    }, { status: 500 });
  }

  try {
    for (const stmt of STATEMENTS) {
      try {
        await client.query(stmt);
        results.push(`✓ ${stmt.trim().slice(0, 60).replace(/\s+/g,' ')}…`);
      } catch (err: any) {
        errors.push(`✗ ${stmt.trim().slice(0, 60).replace(/\s+/g,' ')}… → ${err.message}`);
      }
    }

    const check = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`
    );
    const tables = check.rows.map((r: any) => r.table_name);

    return NextResponse.json({
      ok: errors.length === 0,
      tables_created: tables,
      has_tool_data: tables.includes('tool_data'),
      has_uploads:   tables.includes('uploads'),
      has_briefs:    tables.includes('briefs'),
      applied: results.length,
      errors,
    });
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}
