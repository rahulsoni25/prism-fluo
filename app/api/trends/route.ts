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

// ── Cache ─────────────────────────────────────────────────────
function cacheKey(q: string, geo: string, period: string) {
  return `trends:${q.toLowerCase().trim()}:${geo}:${period}`;
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

// ── Step 1: Get explore tokens ────────────────────────────────
async function getWidgetTokens(keyword: string, geo: string, period: string) {
  const req = JSON.stringify({
    comparisonItem: [{ keyword, geo, time: period }],
    category: 0,
    property: '',
  });

  const url = `https://trends.google.com/trends/api/explore?hl=en-US&tz=-330&req=${encodeURIComponent(req)}&tz=-330`;
  const res  = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
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
  const res  = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
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
  const res  = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
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
  const res  = await fetch(url, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15000) });
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

  // Cache hit (6h)
  const key    = cacheKey(q, geo, period);
  const cached = cache.get<object>(key);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  try {
    const widgets = await getWidgetTokens(q, geo, period);

    const timeWidget    = widgets.find((w: any) => w.id === 'TIMESERIES');
    const queryWidget   = widgets.find((w: any) => w.id === 'RELATED_QUERIES');
    const topicWidget   = widgets.find((w: any) => w.id === 'RELATED_TOPICS');

    const [timeline, queries, topics] = await Promise.allSettled([
      timeWidget  ? fetchTimeSeries(timeWidget, q, geo, period) : Promise.resolve([]),
      queryWidget ? fetchRelatedQueries(queryWidget)             : Promise.resolve({ top: [], rising: [] }),
      topicWidget ? fetchRelatedTopics(topicWidget)              : Promise.resolve([]),
    ]);

    const tl     = timeline.status  === 'fulfilled' ? timeline.value  : [];
    const qr     = queries.status   === 'fulfilled' ? queries.value   : { top: [], rising: [] };
    const topics2 = topics.status   === 'fulfilled' ? topics.value    : [];

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
    };

    cache.set(key, payload, 6 * 3600); // 6h TTL
    return NextResponse.json(payload);

  } catch (err: any) {
    // Google may return CAPTCHA or rate-limit — surface this clearly
    const msg = err.message ?? String(err);
    const isCaptcha = msg.includes('429') || msg.includes('403') || msg.includes('CAPTCHA');
    return NextResponse.json(
      {
        error:       isCaptcha ? 'Google Trends rate-limited this server. Try again in a few minutes.' : `Trends fetch failed: ${msg}`,
        captcha:     isCaptcha,
        keyword:     q,
      },
      { status: isCaptcha ? 429 : 502 },
    );
  }
}
