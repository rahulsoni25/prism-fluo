import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SYSTEM_PROMPT = `You are PRISM AI — a senior data strategist embedded in a consumer intelligence platform.
You analyze research data (GWI surveys, Google Ads keyword plans, market datasets) and provide:
- Sharp, actionable strategic insights
- Data-backed executive recommendations
- Pattern identification across metrics
- Competitive intelligence narratives

Rules:
- Be concise and high-conviction. No filler.
- Use specific numbers from the data context when available.
- Format key findings in bold.
- Always end with a clear, actionable next step.
- Write like a McKinsey partner briefing a CMO.`;

export async function POST(request) {
  try {
    const { provider, messages, dataContext } = await request.json();

    // Build the context-enriched prompt
    const contextBlock = dataContext 
      ? `\n\n--- DATA CONTEXT ---\n${JSON.stringify(dataContext, null, 2).slice(0, 8000)}\n--- END CONTEXT ---\n\n`
      : '';

    const userMessage = messages[messages.length - 1]?.content || '';
    const fullPrompt = `${SYSTEM_PROMPT}${contextBlock}User question: ${userMessage}`;

    if (provider === 'gemini') {
      return await handleGemini(fullPrompt, messages);
    } else if (provider === 'ollama') {
      return await handleOllama(fullPrompt, messages);
    } else {
      return NextResponse.json({ error: 'Unknown provider. Use "gemini" or "ollama".' }, { status: 400 });
    }
  } catch (err) {
    console.error('AI Chat Error:', err);
    return NextResponse.json({ error: err.message || 'AI request failed' }, { status: 500 });
  }
}

// ---- GEMINI (Cloud) ----
async function handleGemini(fullPrompt, messages) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ 
      error: 'GEMINI_API_KEY not set. Add it to .env.local',
      reply: '⚠️ **Gemini API key not configured.** Add `GEMINI_API_KEY=your_key` to `.env.local` and restart.\n\nGet a free key at [Google AI Studio](https://aistudio.google.com/apikey).'
    }, { status: 200 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  // Build chat history
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(fullPrompt);
  const reply = result.response.text();

  return NextResponse.json({ reply, provider: 'gemini' });
}

// ---- OLLAMA (Local — Gemma) ----
async function handleOllama(fullPrompt, messages) {
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3';

  try {
    const ollamaMessages = [
      { role: 'system', content: fullPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: ollamaMessages,
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const reply = data.message?.content || 'No response from Ollama.';

    return NextResponse.json({ reply, provider: 'ollama', model: OLLAMA_MODEL });
  } catch (err) {
    if (err.cause?.code === 'ECONNREFUSED') {
      return NextResponse.json({
        reply: '⚠️ **Ollama is not running.** Start it with:\n\n```\nollama serve\n```\n\nThen pull Gemma:\n```\nollama pull gemma3\n```',
        provider: 'ollama'
      });
    }
    throw err;
  }
}
