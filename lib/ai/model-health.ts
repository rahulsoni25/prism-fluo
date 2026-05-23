/**
 * lib/ai/model-health.ts
 *
 * In-memory health tracker for OpenRouter models. Each call to
 * callOpenRouterText() records success/failure per model; the cascade
 * uses this to:
 *   • SKIP models with > 50% failure rate in last 5 minutes (until window
 *     resets), instead of wasting time on them
 *   • REORDER the cascade so the model with the highest recent success
 *     rate is tried first
 *   • Auto-recover: a model that has been "quarantined" gets a single
 *     probe-call every 5 minutes to check if it's back, instead of
 *     waiting for someone to manually clear cache
 *
 * Net effect: instead of falling back to the next model on every call
 * for a broken model (consistent latency hit + wasted tokens), we route
 * traffic AROUND known-broken models. Fallback to extractive only
 * happens when EVERY model is unhealthy.
 */

interface ModelStat {
  successes:   number;
  failures:    number;
  lastSuccess: number;
  lastFailure: number;
  /** Probe attempts during quarantine — limited to 1 per 5 min. */
  lastProbeAt: number;
}

const stats = new Map<string, ModelStat>();
const WINDOW_MS = 5 * 60_000;       // 5 min rolling window
const QUARANTINE_THRESHOLD = 0.5;   // > 50% failure rate → quarantined
const MIN_ATTEMPTS_FOR_QUARANTINE = 3; // need at least 3 attempts to decide
const PROBE_INTERVAL_MS = 5 * 60_000; // 5 min between probe attempts

function ensureStat(model: string): ModelStat {
  let s = stats.get(model);
  if (!s) {
    s = { successes: 0, failures: 0, lastSuccess: 0, lastFailure: 0, lastProbeAt: 0 };
    stats.set(model, s);
  }
  return s;
}

function decay(s: ModelStat, now: number) {
  // Reset counters if the window has lapsed since the last activity
  const lastActivity = Math.max(s.lastSuccess, s.lastFailure);
  if (lastActivity > 0 && now - lastActivity > WINDOW_MS) {
    s.successes = 0;
    s.failures  = 0;
  }
}

export function recordSuccess(model: string): void {
  const now = Date.now();
  const s = ensureStat(model);
  decay(s, now);
  s.successes++;
  s.lastSuccess = now;
}

export function recordFailure(model: string): void {
  const now = Date.now();
  const s = ensureStat(model);
  decay(s, now);
  s.failures++;
  s.lastFailure = now;
}

export function isQuarantined(model: string): boolean {
  const now = Date.now();
  const s = stats.get(model);
  if (!s) return false;
  decay(s, now);
  const total = s.successes + s.failures;
  if (total < MIN_ATTEMPTS_FOR_QUARANTINE) return false;
  const failureRate = s.failures / total;
  if (failureRate < QUARANTINE_THRESHOLD) return false;
  // Allow one probe attempt every PROBE_INTERVAL_MS to see if model recovered
  if (now - s.lastProbeAt > PROBE_INTERVAL_MS) {
    s.lastProbeAt = now;
    return false; // let this one through
  }
  return true;
}

/** Sort a model list so the highest recent-success-rate goes first.
 *  Quarantined models drop to the end (still considered if everything else fails). */
export function sortByHealth(models: string[]): string[] {
  const now = Date.now();
  return [...models].sort((a, b) => {
    const sa = stats.get(a); const sb = stats.get(b);
    if (sa) decay(sa, now); if (sb) decay(sb, now);
    const aQ = sa && (sa.failures + sa.successes) >= MIN_ATTEMPTS_FOR_QUARANTINE && sa.failures / (sa.failures + sa.successes) >= QUARANTINE_THRESHOLD;
    const bQ = sb && (sb.failures + sb.successes) >= MIN_ATTEMPTS_FOR_QUARANTINE && sb.failures / (sb.failures + sb.successes) >= QUARANTINE_THRESHOLD;
    if (aQ && !bQ) return 1;
    if (bQ && !aQ) return -1;
    const aRate = sa && (sa.failures + sa.successes) > 0 ? sa.successes / (sa.failures + sa.successes) : 0.5;
    const bRate = sb && (sb.failures + sb.successes) > 0 ? sb.successes / (sb.failures + sb.successes) : 0.5;
    return bRate - aRate;
  });
}

export function getHealthSnapshot(): Array<{ model: string; successes: number; failures: number; rate: number | null; quarantined: boolean }> {
  const now = Date.now();
  const out: Array<{ model: string; successes: number; failures: number; rate: number | null; quarantined: boolean }> = [];
  for (const [model, s] of stats) {
    decay(s, now);
    const total = s.successes + s.failures;
    const rate = total > 0 ? s.successes / total : null;
    const quarantined = total >= MIN_ATTEMPTS_FOR_QUARANTINE && rate !== null && rate < (1 - QUARANTINE_THRESHOLD);
    out.push({ model, successes: s.successes, failures: s.failures, rate, quarantined });
  }
  return out.sort((a, b) => (b.successes + b.failures) - (a.successes + a.failures));
}

export function resetHealth(): void {
  stats.clear();
}
