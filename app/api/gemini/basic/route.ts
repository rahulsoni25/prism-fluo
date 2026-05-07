/**
 * POST /api/gemini/basic
 * ~200 Gemini tokens per call — returns top 3 bullets per section + overall score.
 * Cached 24h in-memory (key = hash of input).
 * TOKEN AUDIT: system=40, user=80, response=80 ≈ 200 total
 */

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { cache } from '@/lib/cache';
import { getSession } from '@/lib/auth/server';

export const maxDuration = 60;

function hashInput(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h) + input.charCodeAt(i);
    h |= 0;
  }
  return `gemini:basic:${Math.abs(h)}`;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { input } = await req.json();
  if (!input?.trim()) return NextResponse.json({ error: 'input required' }, { status: 400 });

  // ── Cache hit (24h TTL) ───────────────────────────────────────
  const cacheKey = hashInput(input.trim().toLowerCase());
  const cached = cache.get<object>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ error: 'GEMINI_API_KEY not set' }, { status: 503 });

  // ── Gemini call — ~200 tokens ─────────────────────────────────
  // System: 40 tokens | User prompt: 80 tokens | Response: 80 tokens
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `Analyze this for a brand strategist: "${input}"

Return ONLY valid JSON, no markdown:
{
  "score": <0-100 number>,
  "summary": "<1 sentence, max 15 words>",
  "cultureDrop": ["<bullet 1>","<bullet 2>","<bullet 3>"],
  "behaviors": ["<bullet 1>","<bullet 2>","<bullet 3>"],
  "psychographics": ["<bullet 1>","<bullet 2>","<bullet 3>"],
  "fitScore": ["<bullet 1>","<bullet 2>","<bullet 3>"]
}
Each bullet: max 12 words. Be specific, use numbers where possible.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON in response');

    const data = JSON.parse(match[0]);
    const payload = {
      score:          Number(data.score) || 75,
      summary:        String(data.summary || ''),
      cultureDrop:    Array.isArray(data.cultureDrop)    ? data.cultureDrop.slice(0, 3)    : [],
      behaviors:      Array.isArray(data.behaviors)      ? data.behaviors.slice(0, 3)      : [],
      psychographics: Array.isArray(data.psychographics) ? data.psychographics.slice(0, 3) : [],
      fitScore:       Array.isArray(data.fitScore)       ? data.fitScore.slice(0, 3)       : [],
      input,
    };

    // Cache 24h
    cache.set(cacheKey, payload, 86400);
    return NextResponse.json(payload);

  } catch (err: any) {
    return NextResponse.json({ error: `Gemini failed: ${err.message}` }, { status: 502 });
  }
}
