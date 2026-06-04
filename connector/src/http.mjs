/**
 * http.mjs — a tiny fetch wrapper with a timeout and a single automatic retry
 * on transient failures (network error or 5xx). Zero dependencies; uses the
 * global `fetch` shipped with Node >= 18.
 */

export class ApiError extends Error {
  constructor(message, { status, body, platform } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.platform = platform;
  }
}

async function once(url, { method = 'GET', headers = {}, body, timeoutMs = 30000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : undefined; } catch { /* non-JSON */ }
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Perform an HTTP request, retrying once on a network error or 5xx response.
 * Throws ApiError on a non-2xx response so callers can surface a clean message.
 */
export async function request(url, opts = {}) {
  const { platform = 'api', ...rest } = opts;
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await once(url, rest);
      if (r.ok) return r;
      // Retry only on server-side errors.
      if (r.status >= 500 && attempt === 0) { last = r; continue; }
      const msg = extractErrorMessage(r) || `HTTP ${r.status}`;
      throw new ApiError(msg, { status: r.status, body: r.json ?? r.text, platform });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      // Network/abort error — retry once, then give up.
      if (attempt === 0) { last = err; continue; }
      throw new ApiError(`Network error calling ${platform}: ${err.message}`, { platform });
    }
  }
  // Exhausted retries on a 5xx.
  if (last && typeof last.status === 'number') {
    throw new ApiError(extractErrorMessage(last) || `HTTP ${last.status}`, {
      status: last.status, body: last.json ?? last.text, platform,
    });
  }
  throw new ApiError(`Request to ${platform} failed`, { platform });
}

function extractErrorMessage(r) {
  const j = r.json;
  if (!j) return undefined;
  // Google-style { error: { message } } and Meta-style { error: { message } }.
  if (j.error?.message) return j.error.message;
  if (Array.isArray(j) && j[0]?.error?.message) return j[0].error.message;
  if (typeof j.error === 'string') return j.error;
  return undefined;
}
