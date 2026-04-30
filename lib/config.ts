/**
 * lib/config.ts
 * Single source of truth for all environment variables.
 * Never import process.env directly in app code — use this module.
 *
 * IMPORTANT: DATABASE_URL is exposed via a lazy getter (not a static value)
 * so that it is only evaluated at request time — never during `next build`.
 * Throwing at module-load time crashes the Railway Docker build step because
 * build-time env vars may not be injected yet by NIXPACKS.
 */

function optional_env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  /** 'development' | 'production' | 'test' */
  NODE_ENV: optional_env('NODE_ENV', 'development'),
  isProd: optional_env('NODE_ENV', 'development') === 'production',

  /**
   * PostgreSQL connection string — set in Railway dashboard as DATABASE_URL.
   * Lazy getter: evaluated only when first accessed (never during next build).
   */
  get DATABASE_URL(): string {
    const val = process.env.DATABASE_URL;
    if (!val) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Missing required environment variable: DATABASE_URL');
      }
      return 'postgresql://dummy:dummy@localhost:5432/dummy';
    }
    return val;
  },

  /**
   * Base URL for server-side fetch calls.
   * On Railway this is injected automatically; locally defaults to localhost.
   * Frontend code should NEVER use this — use relative /api/... paths instead.
   */
  API_BASE_URL: optional_env('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),

  /** Upload limits */
  MAX_FILE_SIZE_MB: parseInt(optional_env('MAX_FILE_SIZE_MB', '20'), 10),

  /** In-memory cache TTL in seconds for heavy dashboard queries */
  CACHE_TTL_SECONDS: parseInt(optional_env('CACHE_TTL_SECONDS', '90'), 10),
};
