/**
 * ga4.mjs — minimal Google Analytics 4 Data API client (runReport).
 * Shares the Google OAuth refresh-token flow.
 */
import { request, ApiError } from '../http.mjs';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class Ga4Client {
  constructor(cfg, { timeoutMs = 30000 } = {}) {
    this.cfg = cfg;
    this.timeoutMs = timeoutMs;
    this._token = null;
  }

  async accessToken() {
    if (this._token && this._token.expiresAt - Date.now() > 60_000) return this._token.accessToken;
    const params = new URLSearchParams({
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      refresh_token: this.cfg.refreshToken,
      grant_type: 'refresh_token',
    });
    const r = await request(TOKEN_URL, {
      method: 'POST',
      platform: 'ga4-oauth',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      timeoutMs: this.timeoutMs,
    });
    const accessToken = r.json?.access_token;
    if (!accessToken) throw new ApiError('Google OAuth did not return an access_token', { platform: 'ga4-oauth' });
    this._token = { accessToken, expiresAt: Date.now() + (r.json.expires_in || 3600) * 1000 };
    return accessToken;
  }

  async runReport(propertyId, { metrics, dimensions = [], dateRanges } = {}) {
    const token = await this.accessToken();
    const pid = String(propertyId || '').replace(/^properties\//, '');
    const r = await request(`https://analyticsdata.googleapis.com/v1beta/properties/${pid}:runReport`, {
      method: 'POST',
      platform: 'ga4',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: {
        metrics: (metrics || ['sessions', 'conversions', 'totalRevenue']).map((m) => ({ name: m })),
        dimensions: dimensions.map((d) => ({ name: d })),
        dateRanges: dateRanges || [{ startDate: '30daysAgo', endDate: 'today' }],
      },
      timeoutMs: this.timeoutMs,
    });
    return r.json;
  }
}
