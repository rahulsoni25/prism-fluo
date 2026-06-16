-- ===================================================================
-- REVOKE ANON / AUTHENTICATED PostgREST GRANTS ON ALL PUBLIC TABLES
-- ===================================================================
--
-- Resolves the Supabase "Sensitive data publicly accessible" warning
-- (sensitive_columns_exposed). RLS blocks reads, but the column schema
-- itself is still visible via PostgREST's OpenAPI introspection if
-- anon/authenticated roles have any grant on the table. The fix is to
-- REVOKE ALL grants explicitly.
--
-- Why this is safe:
-- The PRISM app accesses Postgres three ways:
--   1. Direct pg.Pool (db.query)  - uses Postgres role, unaffected by role grants
--   2. PostgREST via SERVICE ROLE - service role bypasses these grants
--      (lib/auth/server.ts -> upsertUserViaRest)
--   3. PostgREST via anon key     - NONE FOUND in code
--
-- So revoking anon + authenticated grants closes the introspection hole
-- without breaking anything.
--
-- How to apply: open Supabase Studio -> SQL Editor -> paste -> Run.
-- ===================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    -- Auth & users (the ones Supabase flagged)
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

    -- Share links + page registry
    'share_links',
    'pages',

    -- Supabase auth defaults (if present in public schema)
    'profiles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
      RAISE NOTICE 'Revoked anon/authenticated grants on public.%', t;
    END IF;
  END LOOP;
END $$;

-- Sanity check: should return zero rows after the revoke.
SELECT table_name, grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon', 'authenticated')
 ORDER BY table_name, grantee;
