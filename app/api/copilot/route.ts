/**
 * POST /api/copilot
 *
 * Copilot AI assistant that provides deeper insights based on uploaded data.
 * Uses OpenRouter / Gemma to answer user questions constrained to the analysis data.
 *
 * Request body:
 * {
 *   analysisId: string,
 *   question: string,
 *   conversationHistory?: Array<{ role, content }>
 * }
 *
 * Response: { answer: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth/server';
import { callOpenRouterText } from '@/lib/ai/openrouter';
import { audit, reqMeta } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const t0 = Date.now();

  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { analysisId, question, conversationHistory = [] } = body;

    if (!analysisId || !question) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'analysisId and question are required' },
        { status: 400 }
      );
    }

    // ── Fetch the analysis data ────────────────────────────────────────
    // Relaxed ownership to match presentation/PDF/Excel export routes
    // (single-user tool, historical analyses have varied user_ids).
    // Cross-user access logged for audit only.
    const { rows: analyses } = await db.query(
      `SELECT
        a.id, a.user_id, a.filename, a.sheet_name, a.results_json,
        b.brand, b.category, b.objective
       FROM analyses a
       LEFT JOIN briefs b ON a.brief_id = b.id
       WHERE a.id = $1`,
      [analysisId]
    );

    if (analyses.length === 0) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Analysis not found' },
        { status: 404 }
      );
    }
    if (analyses[0].user_id && analyses[0].user_id !== session.userId) {
      console.warn('[copilot:POST] cross-user access:', {
        analysisId, owner: analyses[0].user_id, requester: session.userId,
      });
    }

    const analysis = analyses[0];
    const analysisData = analysis.results_json || {};
    const briefContext = analysis.brand
      ? `This analysis is for ${analysis.brand} (${analysis.category}) - ${analysis.objective}`
      : '';

    // ── Build system prompt that constrains Grok to analysis data ──────
    const systemPrompt = `You are PRISM Fluo's Copilot - an expert marketing intelligence assistant.

Your role is to provide DEEPER insights into customer data and marketing analysis.

IMPORTANT CONSTRAINTS:
1. You ONLY answer questions based on the provided analysis data
2. You do NOT use general knowledge or external information
3. If a question cannot be answered from the provided data, say: "This insight is not available in the current analysis. Please upload data that contains this information."
4. You provide 4-pillar analysis: Content, Commerce, Communication, Culture
5. You recommend specific, actionable strategies based on the data

ANALYSIS CONTEXT:
${briefContext}

Analysis File: ${analysis.filename}
Sheet: ${analysis.sheet_name}

DATA SUMMARY:
${JSON.stringify(analysisData, null, 2)}

When answering:
- Be specific and cite data points from the analysis
- Organize insights by the 4 pillars when relevant
- Suggest actionable recommendations
- Ask clarifying questions if the user's question is ambiguous
- Provide deeper insights beyond surface-level observations`;

    // ── Build messages for Grok ────────────────────────────────────────
    const messages = [
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      {
        role: 'user',
        content: question
      }
    ];

    // ── Call OpenRouter / Gemma ───────────────────────────────────────
    if (!process.env.OPENROUTER_API_KEY) {
      logger.error('copilot:missing_api_key', { error: 'OPENROUTER_API_KEY not set' });
      const { recordFallback } = await import('@/lib/ai/fallback-monitor');
      recordFallback({
        kind: 'all-models-down',
        severity: 'alert',
        surface: 'copilot',
        errorMessage: 'OPENROUTER_API_KEY not set',
      });
      return NextResponse.json(
        {
          error: 'CONFIG_ERROR',
          message: 'Copilot API key not configured. Please add OPENROUTER_API_KEY to environment variables.'
        },
        { status: 500 }
      );
    }

    // Combine system prompt + conversation history + current question into one prompt
    // (OpenRouter free models don't always honour system role, so we merge it)
    const fullPrompt = `${systemPrompt}\n\n${
      messages.map((m: any) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n')
    }`;

    const answer = await callOpenRouterText(fullPrompt, 2000, 'copilot');

    if (!answer) {
      logger.error('copilot:empty_response', { analysisId });
      return NextResponse.json(
        { error: 'EMPTY_RESPONSE', message: 'No response from AI' },
        { status: 500 }
      );
    }

    logger.info('copilot:answer_generated', {
      ms: Date.now() - t0,
      analysisId,
      userId: session.userId,
      questionLength: question.length,
      answerLength: answer.length,
      provider: 'openrouter/gemma',
    });

    // Audit trail: every Co-Pilot question is recorded so the admin log
    // can surface "what did the strategy team ask, when, on which brief"
    // — useful for both compliance and product analytics.
    audit({
      kind: 'copilot.ask',
      userId:    session.userId,
      userEmail: session.email,
      targetType: 'analysis',
      targetId:   String(analysisId),
      ...reqMeta(req),
      metadata: {
        questionLength: question.length,
        answerLength:   answer.length,
        ms:             Date.now() - t0,
      },
    }).catch(() => {});  // fire-and-forget; never block the response

    return NextResponse.json({ answer }, { status: 200 });

  } catch (err: any) {
    logger.error('api:POST /api/copilot failed', { error: err.message });
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message },
      { status: 500 }
    );
  }
}
