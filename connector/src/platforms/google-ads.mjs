/**
 * google-ads.mjs — minimal Google Ads API REST client.
 *
 * Implements just what the skills need:
 *   • OAuth refresh-token → access-token exchange (cached until expiry)
 *   • GAQL search via the searchStream endpoint
 *   • adGroups:mutate (pause) and campaignCriteria:mutate (negative keywords)
 *
 * Everything goes through native fetch — no google-ads-api SDK required.
 */
import { request, ApiError } from '../http.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class GoogleAdsClient {
  constructor(cfg, { timeoutMs = 30000 } = {}) {
    this.cfg = cfg;
    this.timeoutMs = timeoutMs;
    this._token = null; // { accessToken, expiresAt }
  }

  get base() {
    return `https://googleads.googleapis.com/${this.cfg.apiVersion}`;
  }

  async accessToken() {
    if (this._token && this._token.expiresAt - Date.now() > 60_000) {
      return this._token.accessToken;
    }
    const params = new URLSearchParams({
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      refresh_token: this.cfg.refreshToken,
      grant_type: 'refresh_token',
    });
    const r = await request(TOKEN_URL, {
      method: 'POST',
      platform: 'google-oauth',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      timeoutMs: this.timeoutMs,
    });
    const accessToken = r.json?.access_token;
    if (!accessToken) throw new ApiError('Google OAuth did not return an access_token', { platform: 'google-oauth' });
    this._token = { accessToken, expiresAt: Date.now() + (r.json.expires_in || 3600) * 1000 };
    return accessToken;
  }

  async headers(customerId) {
    const token = await this.accessToken();
    const h = {
      authorization: `Bearer ${token}`,
      'developer-token': this.cfg.developerToken,
      'content-type': 'application/json',
    };
    const login = this.cfg.loginCustomerId;
    if (login && login !== norm(customerId)) h['login-customer-id'] = login;
    return h;
  }

  /** List accessible customer resource names (e.g. "customers/1234567890"). */
  async listAccessibleCustomers() {
    const token = await this.accessToken();
    const r = await request(`${this.base}/customers:listAccessibleCustomers`, {
      platform: 'google-ads',
      headers: { authorization: `Bearer ${token}`, 'developer-token': this.cfg.developerToken },
      timeoutMs: this.timeoutMs,
    });
    return r.json?.resourceNames || [];
  }

  /** Run a GAQL query, returning a flat array of result rows. */
  async query(customerId, gaql) {
    const cid = norm(customerId);
    const r = await request(`${this.base}/customers/${cid}/googleAds:searchStream`, {
      method: 'POST',
      platform: 'google-ads',
      headers: await this.headers(cid),
      body: { query: gaql },
      timeoutMs: this.timeoutMs,
    });
    // searchStream returns an array of { results: [...] } chunks.
    const chunks = Array.isArray(r.json) ? r.json : [r.json];
    return chunks.flatMap((c) => c?.results || []);
  }

  /** Pause one or more ad groups by resource name. */
  async pauseAdGroups(customerId, adGroupResourceNames) {
    const cid = norm(customerId);
    const operations = adGroupResourceNames.map((rn) => ({
      update: { resourceName: rn, status: 'PAUSED' },
      updateMask: 'status',
    }));
    const r = await request(`${this.base}/customers/${cid}/adGroups:mutate`, {
      method: 'POST',
      platform: 'google-ads',
      headers: await this.headers(cid),
      body: { operations, partialFailure: true },
      timeoutMs: this.timeoutMs,
    });
    return r.json?.results || [];
  }

  /** Add campaign-level negative keywords. `keywords` = [{campaign, text, matchType}]. */
  async addNegativeKeywords(customerId, keywords) {
    const cid = norm(customerId);
    const operations = keywords.map((k) => ({
      create: {
        campaign: k.campaign,
        negative: true,
        keyword: { text: k.text, matchType: (k.matchType || 'EXACT').toUpperCase() },
      },
    }));
    const r = await request(`${this.base}/customers/${cid}/campaignCriteria:mutate`, {
      method: 'POST',
      platform: 'google-ads',
      headers: await this.headers(cid),
      body: { operations, partialFailure: true },
      timeoutMs: this.timeoutMs,
    });
    return r.json?.results || [];
  }
}

function norm(customerId) {
  return String(customerId || '').replace(/[^0-9]/g, '');
}

/** Micros (Google Ads money unit) → major currency units. */
export const fromMicros = (micros) => Math.round((Number(micros || 0) / 1_000_000) * 100) / 100;
export const toMicros = (amount) => Math.round(Number(amount || 0) * 1_000_000);
