/**
 * POST /api/copilot
 *
 * In-dashboard copilot. Answers questions grounded ONLY in the analysis the
 * user is currently viewing — no general-knowledge tangents, no hallucinated
 * numbers. Powered by Ollama (Cloud or self-hosted via OLLAMA_API_KEY /
 * OLLAMA_BASE_URL / OLLAMA_MODEL env vars).
 *
 * Body:  { analysisId: string, question: string, history?: ChatMessage[] }
 * Reply: { answer: string }   or   { error: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { chat, ollamaConfigured, type ChatMessage } from '@/lib/ai/ollama';
import { getSession } from '@/lib/auth/server';

export const dynamic = 'force-dynamic';

interface Chart {
  title?: string;
  bucket?: string;
  type?: string;
  obs?: string;
  stat?: string;
  rec?: string;
  toolLabel?: string;
  conviction?: number;
  computedChartData?: { labels?: string[]; datasets?: Array<{ data?: number[] }> };
}

/** Compress an analysis into a tight, fact-only context block for the model. */
function buildContext(analysis: any): string {
  const r       = analysis?.results_json ?? {};
  const meta    = r.meta ?? {};
  const charts: Chart[] = Array.isArray(r.charts) ? r.charts : [];

  const lines: string[] = [];
  lines.push(`ANALYSIS TITLE: ${analysis.sheet_name || analysis.filename || 'Untitled'}`);
  if (analysis.filename) lines.push(`SOURCE FILE(S): ${analysis.filename}`);
  if (meta.domain)       lines.push(`SOURCE TYPE: ${meta.domain}`);
  lines.push(`INSIGHT COUNT: ${charts.length}`);
  lines.push('');
  lines.push('INSIGHT CARDS (use only these facts to answer):');

  charts.forEach((c, i) => {
    const labels = c.computedChartData?.labels?.slice(0, 6).join(', ') ?? '';
    const values = c.computedChartData?.datasets?.[0]?.data?.slice(0, 6).join(', ') ?? '';
    lines.push(`
[${i + 1}] (${c.bucket ?? 'general'} · ${c.type ?? 'chart'}${c.conviction ? ` · ${c.conviction}% conf` : ''})
TITLE: ${c.title ?? ''}
OBS:   ${c.obs   ?? ''}
STAT:  ${c.stat  ?? ''}
REC:   ${c.rec   ?? ''}
DATA:  ${labels ? `labels=[${labels}]` : ''}${values ? ` values=[${values}]` : ''}`.trim());
  });

  return lines.join('\n');
}

const SYSTEM_PROMPT = `You are PRISM Copilot — an in-dashboard assistant for creative and media professionals.

Rules:
1. Answer ONLY from the analysis context provided below. If a fact is not in the context, say so plainly — do not invent numbers, percentages, or platform names.
2. Audience: brand managers, media planners, creative directors, content strategists. Plain English. Short sentences. Active voice.
3. NEVER use stock-market or finance jargon: tailspin, momentum, volatility, multiplier, dominance, volume-capture, capitalise on, breakout.
4. NEVER use consulting jargon: over-index, leverage, cohort, synergy, touchpoint, holistic, robust, paradigm.
5. When the user asks "what should I do" — give one specific action: name a platform (Instagram Reels, YouTube, Hotstar, Amazon, Flipkart, Meesho, etc.), a format (15-second Reel, search ad, sponsored listing, CTV pre-roll), and a creative angle.
6. Keep answers under 120 words unless the user asks for more.`;

export async function POST(req: NextRequest) {
  if (!ollamaConfigured()) {
    return NextResponse.json(
      { error: 'Copilot disabled — set OLLAMA_API_KEY (and optionally OLLAMA_BASE_URL / OLLAMA_MODEL) on Railway.' },
      { status: 503 },
    );
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const { analysisId, question, history } = body ?? {};
  if (!analysisId || typeof analysisId !== 'string')
    return NextResponse.json({ error: 'analysisId required' }, { status: 400 });
  if (!question || typeof question !== 'string' || !question.trim())
    return NextResponse.json({ error: 'question required' }, { status: 400 });

  // Owner check — copilot only answers about analyses the user owns.
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  let analysis: any;
  try {
    const { rows } = await db.query(
      'SELECT * FROM analyses WHERE id = $1 AND user_id = $2',
      [analysisId, session.userId],
    );
    if (rows.length === 0)
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
    analysis = rows[0];
  } catch (err: any) {
    return NextResponse.json({ error: `DB error: ${err.message}` }, { status: 500 });
  }

  const context = buildContext(analysis);

  // Trim history to last 6 turns so the prompt stays bounded
  const trimmedHistory: ChatMessage[] = Array.isArray(history)
    ? history.slice(-6).filter((m: any) =>
        m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string',
      )
    : [];

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'system', content: `ANALYSIS CONTEXT:\n\n${context}` },
    ...trimmedHistory,
    { role: 'user', content: question.trim() },
  ];

  try {
    const answer = await chat(messages, { temperature: 0.4, timeoutMs: 30_000 });
    return NextResponse.json({ answer });
  } catch (err: any) {
    console.error('[copilot]', err.message);
    return NextResponse.json({ error: `Copilot failed: ${err.message}` }, { status: 502 });
  }
}
