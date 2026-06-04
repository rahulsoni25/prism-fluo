/**
 * config.mjs — environment-driven configuration for the PRISM Ads Connector.
 *
 * The connector reads credentials from environment variables so a user can
 * wire it up in ~30 seconds (drop the values into their MCP client config or a
 * .env file). Nothing here ever logs a secret.
 *
 * Demo mode: when a platform has no credentials, its skills transparently fall
 * back to realistic sample data (clearly flagged `_demo: true`) so the
 * connector is demonstrably working the moment it's added — no credentials
 * required to kick the tyres. Set CONNECTOR_DEMO=1 to force demo mode even
 * when credentials exist.
 */

const SERVER_NAME = 'prism-ads-connector';
const SERVER_VERSION = '0.1.0';

function env(name) {
  const v = process.env[name];
  return v && String(v).trim().length > 0 ? String(v).trim() : undefined;
}

function buildConfig() {
  const forceDemo = ['1', 'true', 'yes'].includes((env('CONNECTOR_DEMO') || '').toLowerCase());

  const google = {
    developerToken: env('GOOGLE_ADS_DEVELOPER_TOKEN'),
    clientId: env('GOOGLE_ADS_CLIENT_ID') || env('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: env('GOOGLE_ADS_CLIENT_SECRET') || env('GOOGLE_OAUTH_CLIENT_SECRET'),
    refreshToken: env('GOOGLE_ADS_REFRESH_TOKEN') || env('GOOGLE_OAUTH_REFRESH_TOKEN'),
    loginCustomerId: (env('GOOGLE_ADS_LOGIN_CUSTOMER_ID') || '').replace(/-/g, '') || undefined,
    apiVersion: env('GOOGLE_ADS_API_VERSION') || 'v18',
  };
  google.configured = Boolean(
    google.developerToken && google.clientId && google.clientSecret && google.refreshToken,
  );

  const meta = {
    accessToken: env('META_ACCESS_TOKEN') || env('FACEBOOK_ACCESS_TOKEN'),
    apiVersion: env('META_API_VERSION') || 'v21.0',
  };
  meta.configured = Boolean(meta.accessToken);

  // GA4 reuses the Google OAuth client (needs the analytics.readonly scope on
  // the same refresh token, or a dedicated GA4_* set).
  const ga4 = {
    clientId: env('GA4_CLIENT_ID') || google.clientId,
    clientSecret: env('GA4_CLIENT_SECRET') || google.clientSecret,
    refreshToken: env('GA4_REFRESH_TOKEN') || google.refreshToken,
    defaultPropertyId: (env('GA4_PROPERTY_ID') || '').replace(/^properties\//, '') || undefined,
  };
  ga4.configured = Boolean(ga4.clientId && ga4.clientSecret && ga4.refreshToken);

  return {
    serverName: SERVER_NAME,
    serverVersion: SERVER_VERSION,
    forceDemo,
    google,
    meta,
    ga4,
    // Default currency for human-readable thresholds in skill output.
    currency: env('CONNECTOR_CURRENCY') || 'USD',
    httpTimeoutMs: Number(env('CONNECTOR_HTTP_TIMEOUT_MS') || 30000),
    // PRISM's deck renderer endpoint, e.g. https://prism-fluo.vercel.app/api/connector/render-deck
    // Enables export_deck_pptx to turn build_report decks into real .pptx files.
    renderUrl: env('PRISM_RENDER_URL'),
  };
}

/** Whether a given platform should serve demo data instead of live calls. */
export function isDemo(config, platform) {
  if (config.forceDemo) return true;
  const p = config[platform];
  return !p || !p.configured;
}

export { SERVER_NAME, SERVER_VERSION };
export const config = buildConfig();
export default config;
