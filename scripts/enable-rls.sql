-- ===================================================================
-- ENABLE ROW-LEVEL SECURITY ON ALL TABLES
-- ===================================================================
--
-- Resolves the Supabase "Table publicly accessible" critical warning
-- (rls_disabled_in_public). Without RLS, anyone with the project URL
-- and anon key could query every table via PostgREST.
--
-- Safety analysis (done 2026-05-31):
-- The PRISM app accesses Postgres three ways:
--   1. Direct pg.Pool (db.query)  - uses Postgres role, bypasses RLS
--   2. PostgREST via SERVICE ROLE - bypasses RLS
--      (lib/auth/server.ts -> upsertUserViaRest)
--   3. PostgREST via anon key     - NONE FOUND in code
--      (no @supabase/supabase-js client, no .from() calls)
--
-- Therefore: enabling RLS on every table WITHOUT adding any policies
-- blocks the anon-key attack surface while leaving all legitimate app
-- access intact (pg.Pool + service-role REST both bypass RLS).
--
-- How to apply:
--   Open Supabase Studio -> SQL Editor -> paste this file -> Run.
--   Idempotent: tables that do not exist yet are silently skipped.
--
-- Rollback:
--   ALTER TABLE <name> DISABLE ROW LEVEL SECURITY;
-- ===================================================================

-- Helper: enable RLS only if the table exists. Some tables are
-- auto-migrated (created on first API hit) so they may not exist yet
-- in a fresh project. Wrapping in DO + EXISTS avoids errors.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Auth & users
    'users',
    'sessions',
    'accounts',
    'verification_tokens',
    'password_reset_tokens',

    -- Core data
    'briefs',
    'uploads',
    'analyses',
    'upload_jobs',

    -- Data sources
    'gwi_time_spent',
    'keywords',
    'tool_data',

    -- Export / presentations
    'presentations',
    'export_runs',

    -- Verification + mapper history
    'analysis_verifications',
    'mapper_runs',
    'ai_fallback_events',

    -- Admin / audit
    'admin_audit_log',
    'audit_events',

    -- Share links (June trio)
    'share_links',

    -- Page registry
    'pages'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      RAISE NOTICE 'RLS enabled on public.%', t;
    ELSE
      RAISE NOTICE 'Skipped (table does not exist): public.%', t;
    END IF;
  END LOOP;
END $$;

-- Sanity check: every table in the list above should show rowsecurity=true.
SELECT schemaname, tablename, rowsecurity
  FROM pg_tables
 WHERE schemaname = 'public'
 ORDER BY tablename;
