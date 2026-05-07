/**
 * POST /api/trends/insights
 *
 * Takes Google Trends data (from /api/trends) + keyword context,
 * runs it through Gemini, and returns 4 PRISM insight cards.
 *
 * Cached 6h — same TTL as the trends data itself.
 * ~600 Gemini tokens per call.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cache } from '@/lib/cache';
import { getSession } from '@/lib/auth/server';

export const maxDuration = 60;

interface TrendsPayload {
  keyword:       string;
  geo:           string;
  timeline:      { date: string; value: number }[];
  topQueries:    { query: string; value: number }[];
  risingQueries: { query: string; value: number; isBreakout?: boolean }[];
  relatedTopics: { topic: string; type: string; value: number }[];
  peakWeek:      string | null;
  peakValue:     number;
  trend:         'rising' | 'falling' | 'stable';
  dataPoints:    number;
}

function hashTrends(keyword: string, trend: string): string {
  const str = `${keyword.toLowerCase()}:${trend}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return `trends:insights:${Math.abs(h)}`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body: TrendsPayload & { brandContext?: string } = await req.json();
  const { keyword, timeline, topQueries, risingQueries, relatedTopics, peakWeek, peakValue, trend, brandContext } = body;

  if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 });
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 503 });

  // Cache hit
  const key    = hashTrends(keyword + (brandContext || ''), trend);
  const cached = cache.get<object>(key);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  // Build structured data blocks for Gemini
  const recentWeeks = timeline.slice(-8); // last 8 weeks
  const timelineStr = recentWeeks.map(p => `  ${p.date}: ${p.value}/100`).join('\n') || '  (no data)';

  const topStr     = topQueries.slice(0, 8).map(q => `  • "${q.query}" — value ${q.value}`).join('\n') || '  (none)';
  const risingStr  = risingQueries.slice(0, 8).map(q =>
    `  • "${q.query}" — ${q.isBreakout ? '🔥 BREAKOUT' : `+${q.value}%`}`).join('\n') || '  (none)';
  const topicsStr  = relatedTopics.slice(0, 5).map(t =>
    `  • ${t.topic} (${t.type}) — ${t.value === 5000 ? 'BREAKOUT' : `+${t.value}%`}`).join('\n') || '  (none)';

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are a senior Brand Strategist at PRISM writing Google Trends intelligence for the brand team working on: "${brandContext || keyword}"

━━ GOOGLE TRENDS DATA (India, last 90 days) ━━
Keyword tracked: "${keyword}"
Overall direction: ${trend.toUpperCase()}
Peak interest week: ${peakWeek ?? 'N/A'} (score: ${peakValue}/100)

INTEREST OVER TIME (last 8 weeks, 0=low 100=peak):
${timelineStr}

TOP RELATED SEARCHES (what people search alongside "${keyword}"):
${topStr}

RISING / BREAKOUT SEARCHES (fastest growing right now):
${risingStr}

RELATED TOPICS (broader topics driving this trend):
${topicsStr}

━━ YOUR TASK ━━
Write 4 sharp insight cards — one per PRISM bucket (Content · Commerce · Communication · Culture).
Each card must answer: "What should our brand DO with this Google Trends signal?"

RULES:
• Use ONLY data from the blocks above — no invented numbers
• Write like a smart agency planner — plain English, short sentences, active voice
• Banned words: over-index, leverage, synergy, touchpoint, holistic, robust, utilize, paradigm, seamless
• Name specific Indian platforms (YouTube, Instagram Reels, Hotstar, JioCinema, Meesho, Flipkart, Twitter/X)
• Name specific formats (15-second Reel, search ad, pre-roll, carousel, sponsored listing)

CARD FORMAT:
- title: max 12 words, magazine-style, include one concrete number or direction signal
- obs: 2 sentences — the trend signal in plain English + strategic implication
- stat: one crisp number or trend phrase (e.g. "Rising 3× in 4 weeks" or "Breakout query in India")
- rec: one sentence with platform + format + creative angle

Return ONLY valid JSON array:
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture",
    "obs": "string",
    "stat": "string",
    "rec": "string",
    "chartLabels": ["week1", "week2"],
    "chartValues": [45, 67]
  }
]`;

  try {
    const result = await model.generateContent(prompt);
    const text   = result.response.text().trim();
    const match  = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON in Gemini response');

    const cards = JSON.parse(match[0]);
    if (!Array.isArray(cards)) throw new Error('Not an array');

    const payload = {
      keyword,
      trend,
      cards: cards.slice(0, 4).map((c: any) => ({
        title:       String(c.title   || ''),
        bucket:      ['content','commerce','communication','culture'].includes(c.bucket) ? c.bucket : 'content',
        obs:         String(c.obs     || ''),
        stat:        String(c.stat    || ''),
        rec:         String(c.rec     || ''),
        chartLabels: Array.isArray(c.chartLabels) ? c.chartLabels.map(String) : [],
        chartValues: Array.isArray(c.chartValues) ? c.chartValues.map(Number) : [],
      })),
    };

    cache.set(key, payload, 6 * 3600);
    return NextResponse.json(payload);

  } catch (err: any) {
    return NextResponse.json({ error: `Gemini failed: ${err.message}` }, { status: 502 });
  }
}
