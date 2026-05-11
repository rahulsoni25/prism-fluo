/**
 * GET /api/trends?q=Nike+India&geo=IN&period=today+3-m
 *
 * Fetches live data directly from Google Trends (no API key required).
 * Returns:
 *   - timeline:       weekly interest over time (0-100 relative scale)
 *   - topQueries:     top related search queries
 *   - risingQueries:  breakout / rising queries
 *   - relatedTopics:  rising topics
 *   - peakWeek:       week with highest interest
 *   - trend:          "rising" | "falling" | "stable"
 *
 * Google Trends response always starts with ")]}',\n" — strip it before JSON.parse.
 * Cached 6h in-memory so repeated dashboard loads don't hammer Google.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cache } from '@/lib/cache';

export const maxDuration = 60;

// ── Cache keys ────────────────────────────────────────────────
function cacheKey(q: string, geo: string, period: string) {
  return `trends:${q.toLowerCase().trim()}:${geo}:${period}`;
}

// ── Per-keyword backoff tracker ───────────────────────────────
// Prevents hammering Google after a 429 — skip re-fetch for BACKOFF_MS
const BACKOFF_MS = 5 * 60 * 1000; // 5 minutes
const backoffUntil = new Map<string, number>();

function isBackedOff(key: string): boolean {
  const until = backoffUntil.get(key) ?? 0;
  return Date.now() < until;
}

function setBackoff(key: string): void {
  backoffUntil.set(key, Date.now() + BACKOFF_MS);
}

// ── Strip Google's anti-hijacking prefix ──────────────────────
function stripPrefix(text: string): string {
  // Responses start with ")]}',\n" — remove it
  return text.replace(/^\)\]\}',?\s*/, '').trim();
}

// ── Common headers to mimic a browser ────────────────────────
const BROWSER_HEADERS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept':          'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer':         'https://trends.google.com/',
};

// ── Per-call timeout: short so we fail-fast instead of hanging ──
const CALL_TIMEOUT_MS = 6000;   // 6 s per individual Google call
const TOTAL_TIMEOUT_MS = 9000;  // 9 s total wall-clock budget

// ── Step 1: Get explore tokens ────────────────────────────────
async function getWidgetTokens(keyword: string, geo: string, period: string) {
  const req = JSON.stringify({
    comparisonItem: [{ keyword, geo, time: period }],
    category: 0,
    property: '',
  });

  const url = `https://trends.google.com/trends/api/explore?hl=en-US&tz=-330&req=${encodeURIComponent(req)}&tz=-330`;
  const res  = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Explore fetch failed: ${res.status}`);

  const text = await res.text();
  const data = JSON.parse(stripPrefix(text));
  return (data.widgets ?? []) as any[];
}

// ── Step 2: Interest over time ────────────────────────────────
async function fetchTimeSeries(widget: any, keyword: string, geo: string, period: string) {
  const req = JSON.stringify({
    time:           period,
    resolution:     'WEEK',
    locale:         'en-US',
    comparisonItem: widget.request?.comparisonItem ?? [{ keyword, geo, time: period }],
    requestOptions: widget.request?.requestOptions ?? { property: '', backend: 'IZG', category: 0 },
  });

  const url = `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=-330&req=${encodeURIComponent(req)}&token=${widget.token}&tz=-330`;
  const res  = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  if (!res.ok) return [];

  const text = await res.text();
  const data = JSON.parse(stripPrefix(text));
  const points = data?.default?.timelineData ?? [];

  return points.map((p: any) => ({
    date:  p.formattedAxisTime ?? p.formattedTime ?? '',
    value: p.value?.[0] ?? 0,
  }));
}

// ── Step 3: Related searches ──────────────────────────────────
async function fetchRelatedQueries(widget: any) {
  const req = JSON.stringify({
    ...widget.request,
    userCountryCode: 'IN',
  });

  const url = `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=en-US&tz=-330&req=${encodeURIComponent(req)}&token=${widget.token}&tz=-330`;
  const res  = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  if (!res.ok) return { top: [], rising: [] };

  const text  = await res.text();
  const data  = JSON.parse(stripPrefix(text));
  const rankedList = data?.default?.rankedList ?? [];

  const top    = (rankedList[0]?.rankedKeyword ?? []).slice(0, 10).map((k: any) => ({
    query: k.query,
    value: k.value,
  }));
  const rising = (rankedList[1]?.rankedKeyword ?? []).slice(0, 10).map((k: any) => ({
    query:       k.query,
    value:       k.value,
    isBreakout:  k.value === 5000 || String(k.formattedValue).toLowerCase().includes('breakout'),
  }));

  return { top, rising };
}

// ── Step 4: Related topics ────────────────────────────────────
async function fetchRelatedTopics(widget: any) {
  const req = JSON.stringify({
    ...widget.request,
    userCountryCode: 'IN',
  });

  const url = `https://trends.google.com/trends/api/widgetdata/relatedsearches?hl=en-US&tz=-330&req=${encodeURIComponent(req)}&token=${widget.token}&tz=-330`;
  const res  = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
  if (!res.ok) return [];

  const text  = await res.text();
  const data  = JSON.parse(stripPrefix(text));
  const rising = (data?.default?.rankedList?.[1]?.rankedKeyword ?? []).slice(0, 5).map((k: any) => ({
    topic: k.topic?.title ?? k.query,
    type:  k.topic?.type ?? '',
    value: k.value,
  }));
  return rising;
}

// ── Trend direction helper ────────────────────────────────────
function computeTrend(timeline: { value: number }[]): 'rising' | 'falling' | 'stable' {
  if (timeline.length < 4) return 'stable';
  const half     = Math.floor(timeline.length / 2);
  const firstHalf = timeline.slice(0, half).map(p => p.value);
  const lastHalf  = timeline.slice(half).map(p => p.value);
  const avg       = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const diff      = avg(lastHalf) - avg(firstHalf);
  if (diff >  8) return 'rising';
  if (diff < -8) return 'falling';
  return 'stable';
}

// ── Main handler ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q      = (searchParams.get('q') ?? '').trim();
  const geo    = searchParams.get('geo')    ?? 'IN';
  const period = searchParams.get('period') ?? 'today 3-m';

  if (!q) return NextResponse.json({ error: 'q is required' }, { status: 400 });

  const key = cacheKey(q, geo, period);

  // ── Fresh cache hit ────────────────────────────────────────
  const cached = cache.get<object>(key);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  // ── Backoff: if recently rate-limited, skip fetch and return stale ──
  if (isBackedOff(key)) {
    const stale = cache.getStale<object>(key);
    if (stale) {
      return NextResponse.json({ ...stale, stale: true, cached: true });
    }
    return NextResponse.json(
      { error: 'Google Trends temporarily unavailable — please try again shortly.', captcha: true, keyword: q },
      { status: 429 },
    );
  }

  try {
    // Race the entire fetch against a hard wall-clock limit.
    // If Google is slow, we return stale cache (if any) or a demo skeleton
    // instead of hanging for up to 30 s.
    const fetchAll = async () => {
      const widgets = await getWidgetTokens(q, geo, period);

      const timeWidget  = widgets.find((w: any) => w.id === 'TIMESERIES');
      const queryWidget = widgets.find((w: any) => w.id === 'RELATED_QUERIES');
      const topicWidget = widgets.find((w: any) => w.id === 'RELATED_TOPICS');

      const [timeline, queries, topics] = await Promise.allSettled([
        timeWidget  ? fetchTimeSeries(timeWidget, q, geo, period) : Promise.resolve([]),
        queryWidget ? fetchRelatedQueries(queryWidget)            : Promise.resolve({ top: [], rising: [] }),
        topicWidget ? fetchRelatedTopics(topicWidget)             : Promise.resolve([]),
      ]);

      return { timeline, queries, topics };
    };

    const timeout = new Promise<null>(resolve =>
      setTimeout(() => resolve(null), TOTAL_TIMEOUT_MS)
    );

    const result = await Promise.race([fetchAll(), timeout]);

    // Timed out — serve stale cache or 429 so client shows demo state
    if (!result) {
      const stale = cache.getStale<object>(key);
      if (stale) return NextResponse.json({ ...stale, stale: true, cached: true });
      return NextResponse.json(
        { error: 'Google Trends temporarily unavailable — please try again shortly.', captcha: true, keyword: q },
        { status: 429 },
      );
    }

    const { timeline, queries, topics } = result as any;

    const tl      = timeline.status === 'fulfilled' ? timeline.value : [];
    const qr      = queries.status  === 'fulfilled' ? queries.value  : { top: [], rising: [] };
    const topics2 = topics.status   === 'fulfilled' ? topics.value   : [];

    const peakWeek = tl.length > 0
      ? tl.reduce((best: any, p: any) => p.value > best.value ? p : best)
      : null;

    const payload = {
      keyword:       q,
      geo,
      period,
      timeline:      tl,
      topQueries:    (qr as any).top    ?? [],
      risingQueries: (qr as any).rising ?? [],
      relatedTopics: topics2,
      peakWeek:      peakWeek?.date ?? null,
      peakValue:     peakWeek?.value ?? 0,
      trend:         computeTrend(tl),
      dataPoints:    tl.length,
      fetchedAt:     new Date().toISOString(),
    };

    // Cache for 24h — long TTL means we rarely need to re-hit Google
    cache.set(key, payload, 24 * 3600);
    return NextResponse.json(payload);

  } catch (err: any) {
    const msg        = String(err?.message ?? err);
    const isBlocked  = /429|403|captcha|rate.limit|too many/i.test(msg);

    if (isBlocked) {
      // Arm the backoff so the next request in this window skips the fetch
      setBackoff(key);

      // Serve stale data if we have any — beats showing a hard error
      const stale = cache.getStale<object>(key);
      if (stale) {
        console.warn(`[trends] rate-limited for "${q}" — serving stale cache`);
        return NextResponse.json({ ...stale, stale: true, cached: true });
      }
    }

    return NextResponse.json(
      {
        error:    isBlocked
          ? 'Google Trends is temporarily rate-limiting this server. Data will refresh automatically.'
          : `Trends fetch failed: ${msg}`,
        captcha:  isBlocked,
        keyword:  q,
      },
      { status: isBlocked ? 429 : 502 },
    );
  }
}
