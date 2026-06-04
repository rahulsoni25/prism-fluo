/**
 * meta-ads.mjs — minimal Meta (Facebook) Marketing API client over the Graph
 * API. Uses a long-lived user/system-user access token. Native fetch only.
 */
import { request } from '../http.mjs';

export class MetaAdsClient {
  constructor(cfg, { timeoutMs = 30000 } = {}) {
    this.cfg = cfg;
    this.timeoutMs = timeoutMs;
  }

  get base() {
    return `https://graph.facebook.com/${this.cfg.apiVersion}`;
  }

  async get(path, params = {}) {
    const qs = new URLSearchParams({ ...params, access_token: this.cfg.accessToken });
    const r = await request(`${this.base}/${path}?${qs.toString()}`, {
      platform: 'meta-ads',
      timeoutMs: this.timeoutMs,
    });
    return r.json;
  }

  async post(path, params = {}) {
    const body = new URLSearchParams({ ...params, access_token: this.cfg.accessToken });
    const r = await request(`${this.base}/${path}`, {
      method: 'POST',
      platform: 'meta-ads',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      timeoutMs: this.timeoutMs,
    });
    return r.json;
  }

  /** Walk Graph API cursor pagination up to `max` rows. */
  async getAll(path, params = {}, max = 500) {
    const out = [];
    let next = null;
    let page = await this.get(path, { ...params, limit: params.limit || 100 });
    while (page) {
      if (Array.isArray(page.data)) out.push(...page.data);
      if (out.length >= max) break;
      next = page.paging?.next;
      if (!next) break;
      const r = await request(next, { platform: 'meta-ads', timeoutMs: this.timeoutMs });
      page = r.json;
    }
    return out.slice(0, max);
  }

  /** Ad accounts the token can see, e.g. act_123. */
  listAdAccounts() {
    return this.getAll('me/adaccounts', { fields: 'account_id,name,currency,account_status,amount_spent' });
  }

  /** Insights for an object (account/campaign/adset/ad). */
  insights(objectId, { level = 'campaign', datePreset = 'last_30d', fields } = {}) {
    return this.getAll(`${objectId}/insights`, {
      level,
      date_preset: datePreset,
      fields: fields || 'campaign_name,adset_name,spend,impressions,clicks,ctr,cpc,actions,cost_per_action_type',
    });
  }

  campaigns(accountId, fields = 'id,name,status,objective,daily_budget,lifetime_budget') {
    return this.getAll(`${accountId}/campaigns`, { fields });
  }

  adsets(accountId, fields = 'id,name,status,campaign_id,daily_budget,optimization_goal') {
    return this.getAll(`${accountId}/adsets`, { fields });
  }

  /** Update an entity's status (PAUSED / ACTIVE) or any writable field. */
  update(objectId, fields) {
    return this.post(objectId, fields);
  }
}
