/**
 * GET /api/briefs/[id]/context-summary
 *
 * Returns a 2–3 sentence faithful summary of the brief's background prose,
 * to render in the Executive Summary "CONTEXT" row. The LLM is constrained
 * with strict grounding rules so the output never drifts from what the
 * client actually wrote.
 *
 * Cached in memory per (briefId, content-hash) for 24h so we don't burn
 * tokens on every page load. Falls back to a deterministic extractive
 * summary when OPENROUTER_API_KEY is missing or all models fail.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db/client';
import { getSession } from '@/lib/auth/server';
import { cache } from '@/lib/cache';
import { callOpenRouterText } from '@/lib/ai/openrouter';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const TTL_SECONDS = 24 * 3600; // 24h

function hash(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}

// Deterministic fallback — same logic as the client's ClientBriefContext.
function extractiveSummary(raw: string): string {
  if (!raw) return '';
  const BUDGET = 360;
  const labelRe = /^(brief\s*[:\-]|context|objective|key\s+questions?|demo\s*[-–]|core\s+tg\s+persona|key\s+frictions|current\s+behaviour|data\s+sources)/i;

  const cleaned = raw
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => {
      if (!l) return false;
      if (l.length < 60 && labelRe.test(l)) return false;
      if (l.length < 90 && !/[.!?:]$/.test(l)) return false;
      if (labelRe.test(l) && l.length < 110) return false;
      return true;
    })
    .join(' ')
    .replace(/\s+/g, ' ');

  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 8);

  let out = '';
  for (const s of sentences) {
    if (!out) { out = s; if (out.length >= BUDGET) break; continue; }
    if (out.length + 1 + s.length > BUDGET) break;
    out += ' ' + s;
  }
  return out;
}

function buildPrompt(brief: {
  brand?: string | null;
  objective?: string | null;
  category?: string | null;
  background?: string | null;
}): string {
  return `You summarise an agency brief for the Executive Summary header. Output 2 short sentences (max 60 words total) that capture, in this order:
  1. What the client (${brief.brand || 'the brand'}) is trying to achieve — the business problem
  2. The specific behavioural / strategic question they want the analysis to answer

STRICT GROUNDING RULES:
• Use ONLY facts that appear in the BRIEF BACKGROUND below. Do not invent metrics, channels, geographies, audience names, competitor names, or timeframes.
• No marketing jargon. Banned words: leverage, synergy, holistic, robust, utilize, paradigm, seamless, ecosystem, unlock, supercharge.
• Plain English, active voice, present tense.
• Do not start with "The brief…", "This brief…", or "The client…". Start with the brand name or the actual subject.
• Do not include headings, bullets, or quotation marks. Pure prose only.
• If the background does not say something, omit it — do not paper over with generic language.

BRAND: ${brief.brand || 'unknown'}
CATEGORY: ${brief.category || 'unknown'}
STATED OBJECTIVE: ${brief.objective || 'unknown'}

BRIEF BACKGROUND (source of truth — do not contradict):
"""
${(brief.background || '').slice(0, 6000)}
"""

Return ONLY the 2-sentence summary as plain text. No preamble, no labels, no closing line.`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  // Ownership / readability check. We allow read if the brief belongs to
  // the user OR (rare) is linked to an analysis the user can already see
  // via the `user_id IS NULL` share path.
  const { rows } = await db.query(
    `SELECT b.id, b.brand, b.category, b.objective, b.background, b.user_id
       FROM briefs b
      WHERE b.id = $1
        AND (
          b.user_id = $2
          OR EXISTS (
            SELECT 1 FROM analyses a
             WHERE a.brief_id = b.id
               AND (a.user_id = $2 OR a.user_id IS NULL)
          )
        )`,
    [id, session.userId],
  );
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const brief = rows[0];

  const background = (brief.background || '').trim();
  if (!background) {
    return NextResponse.json({ summary: '', source: 'empty' });
  }

  const cacheKey = `brief:ctx-summary:${id}:${hash(background)}`;
  const cached = cache.get<{ summary: string; source: string }>(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  // No API key → skip the call and serve the deterministic version. We still
  // cache it so the client doesn't keep retrying. Notify the fallback monitor
  // so admins see the AI surface is degraded.
  if (!process.env.OPENROUTER_API_KEY) {
    const { recordFallback } = await import('@/lib/ai/fallback-monitor');
    recordFallback({
      kind: 'extractive-fallback',
      severity: 'alert',
      surface: 'context-summary',
      errorMessage: 'OPENROUTER_API_KEY not set — serving extractive summary',
    });
    const payload = { summary: extractiveSummary(background), source: 'extractive' };
    cache.set(cacheKey, payload, TTL_SECONDS);
    return NextResponse.json(payload);
  }

  try {
    const raw = await callOpenRouterText(buildPrompt(brief), 220, 'context-summary');
    const cleaned = raw
      .trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ');

    // Lightweight sanity: must be 1-4 sentences, must include a sentence-end,
    // must not start with banned framings. Otherwise fall back.
    const sentenceCount = (cleaned.match(/[.!?](?:\s|$)/g) || []).length;
    const looksBad =
      cleaned.length < 30 ||
      cleaned.length > 600 ||
      sentenceCount < 1 ||
      /^(the brief|this brief|the client)/i.test(cleaned);

    if (looksBad) {
      const { recordFallback } = await import('@/lib/ai/fallback-monitor');
      recordFallback({
        kind: 'extractive-fallback',
        severity: 'warn',
        surface: 'context-summary',
        errorMessage: 'LLM response failed sanity check (length/sentence count/banned opening)',
      });
      const payload = { summary: extractiveSummary(background), source: 'extractive-fallback' };
      cache.set(cacheKey, payload, TTL_SECONDS);
      return NextResponse.json(payload);
    }

    const payload = { summary: cleaned, source: 'llm' };
    cache.set(cacheKey, payload, TTL_SECONDS);
    return NextResponse.json(payload);

  } catch (err: any) {
    console.warn('[brief context-summary] LLM failed, using extractive:', err.message);
    const payload = { summary: extractiveSummary(background), source: 'extractive-error' };
    cache.set(cacheKey, payload, 600); // shorter TTL so a quick env fix recovers
    return NextResponse.json(payload);
  }
}
