/**
 * POST /api/gemini/deep
 * ~1000 Gemini tokens per call — full analysis for ONE section, lazy-loaded on expand.
 * Cached 24h in-memory (key = hash of input + section).
 * TOKEN AUDIT: system=80, user=220, response=700 ≈ 1000 total
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cache } from '@/lib/cache';
import { getSession } from '@/lib/auth/server';

export const maxDuration = 60;

function hashInput(input: string, section: string): string {
  const str = `${input.trim().toLowerCase()}::${section}`;
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return `gemini:deep:${Math.abs(h)}`;
}

const SECTION_PROMPTS: Record<string, string> = {
  cultureDrop: `Provide a deep culture analysis with 8 specific insights covering:
- Trending memes, audio, aesthetics relevant to this topic
- Cultural moments and what's driving them
- Emerging micro-trends (with % growth or timeframes where possible)
- Which subcultures or communities are leading this
Return as JSON array of 8 objects: [{"title":"<10 words>","insight":"<2 sentences with stats>","stat":"<key number>","action":"<specific brand action>"}]`,

  behaviors: `Provide deep behavioral analysis with 8 specific insights covering:
- Search patterns (what people type, when, on which platforms)
- Scroll and content consumption habits
- Purchase triggers and friction points
- Platform-specific behavior differences
Return as JSON array of 8 objects: [{"title":"<10 words>","insight":"<2 sentences with stats>","stat":"<key number>","action":"<specific brand action>"}]`,

  psychographics: `Provide deep psychographic analysis with 8 specific insights covering:
- Core values and belief systems driving this audience
- Emotional triggers (fears, aspirations, identity needs)
- Decision-making patterns and what builds/breaks trust
- The gap between stated values and actual behavior
Return as JSON array of 8 objects: [{"title":"<10 words>","insight":"<2 sentences with stats>","stat":"<key number>","action":"<specific brand action>"}]`,

  fitScore: `Provide deep fit analysis with 8 specific insights covering:
- Age/gender/income demographic breakdown and what % fits
- Platform fit (where this audience spends time)
- Content format preferences (video length, tone, style)
- Competitive landscape — who already owns this audience and how
Return as JSON array of 8 objects: [{"title":"<10 words>","insight":"<2 sentences with stats>","stat":"<key number>","action":"<specific brand action>"}]`,
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { input, section } = await req.json();
  if (!input?.trim()) return NextResponse.json({ error: 'input required' }, { status: 400 });
  if (!SECTION_PROMPTS[section]) return NextResponse.json({ error: 'invalid section' }, { status: 400 });

  // ── Cache hit (24h TTL) ───────────────────────────────────────
  const cacheKey = hashInput(input, section);
  const cached = cache.get<object>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 503 });

  // ── Gemini call — ~1000 tokens ────────────────────────────────
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are a senior brand strategist analyzing: "${input}"

${SECTION_PROMPTS[section]}

CRITICAL: Return ONLY a valid JSON array. No markdown, no explanation. Use real stats and numbers.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in response');

    const cards = JSON.parse(match[0]);
    if (!Array.isArray(cards)) throw new Error('Response is not array');

    const payload = {
      section,
      cards: cards.slice(0, 8).map((c: any) => ({
        title:   String(c.title   || ''),
        insight: String(c.insight || ''),
        stat:    String(c.stat    || ''),
        action:  String(c.action  || ''),
      })),
      input,
    };

    // Cache 24h
    cache.set(cacheKey, payload, 86400);
    return NextResponse.json(payload);

  } catch (err: any) {
    return NextResponse.json({ error: `Gemini failed: ${err.message}` }, { status: 502 });
  }
}
