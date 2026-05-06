/**
 * POST /api/copilot
 *
 * Copilot AI assistant that provides deeper insights based on uploaded data.
 * Uses Grok API (xAI) to answer user questions constrained to the analysis data.
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

const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';

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
    const { rows: analyses } = await db.query(
      `SELECT
        a.id, a.filename, a.sheet_name, a.results_json,
        b.brand, b.category, b.objective
       FROM analyses a
       LEFT JOIN briefs b ON a.brief_id = b.id
       WHERE a.id = $1 AND (a.user_id = $2 OR a.user_id IS NULL)`,
      [analysisId, session.userId]
    );

    if (analyses.length === 0) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Analysis not found' },
        { status: 404 }
      );
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

    // ── Call Grok API ─────────────────────────────────────────────────
    if (!GROK_API_KEY) {
      logger.error('copilot:missing_api_key', { error: 'GROK_API_KEY or XAI_API_KEY not set' });
      return NextResponse.json(
        {
          error: 'CONFIG_ERROR',
          message: 'Copilot API key not configured. Please add GROK_API_KEY or XAI_API_KEY to environment variables.'
        },
        { status: 500 }
      );
    }

    const grokResponse = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'grok-2-1212',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 2000,
        top_p: 0.9
      })
    });

    if (!grokResponse.ok) {
      const errorData = await grokResponse.text();
      logger.error('copilot:grok_api_error', {
        status: grokResponse.status,
        error: errorData,
        analysisId,
        userId: session.userId
      });

      return NextResponse.json(
        {
          error: 'GROK_ERROR',
          message: 'Failed to generate insight. Please try again.'
        },
        { status: 500 }
      );
    }

    const grokData = await grokResponse.json();
    const answer = grokData.choices?.[0]?.message?.content || '';

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
      answerLength: answer.length
    });

    return NextResponse.json({ answer }, { status: 200 });

  } catch (err: any) {
    logger.error('api:POST /api/copilot failed', { error: err.message });
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err.message },
      { status: 500 }
    );
  }
}
