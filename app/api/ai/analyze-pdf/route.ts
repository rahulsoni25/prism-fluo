/**
 * POST /api/ai/analyze-pdf
 *
 * Accepts raw PDF text + filename and asks Gemini 2.5 to generate
 * 8 PRISM insight cards (2 per bucket) from the document content.
 *
 * Body:  { text: string, filename: string }
 * Reply: { insights: GeminiInsightCard[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeTextForPRISM } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  try {
    const { text, filename } = await req.json();

    if (!text || typeof text !== 'string' || text.trim().length < 50)
      return NextResponse.json({ error: 'text too short or missing' }, { status: 400 });

    if (!process.env.GEMINI_API_KEY)
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 });

    const insights = await analyzeTextForPRISM(text, filename ?? 'document');
    return NextResponse.json({ insights });

  } catch (err: any) {
    console.error('[analyze-pdf]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
