/**
 * POST /api/ai/enhance
 * Server-side Gemini enhancement for insight card titles and narratives.
 */
import { NextRequest, NextResponse } from 'next/server';
import { enhanceInsightTitles, enhanceInsightNarratives } from '@/lib/ai/gemini';

export async function POST(req: NextRequest) {
  try {
    const { charts, context, mode } = await req.json();

    if (!Array.isArray(charts) || charts.length === 0) {
      return NextResponse.json({ error: 'charts array required' }, { status: 400 });
    }

    const ctx = context || 'market research data';

    if (mode === 'narratives') {
      const enhanced = await enhanceInsightNarratives(charts, ctx);
      return NextResponse.json({ enhanced });
    }

    // Default: titles only
    const titles = await enhanceInsightTitles(charts, ctx);
    return NextResponse.json({ titles });

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
