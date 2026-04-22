import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { callLLM } from '@/lib/ai/client';
import { groupDatasetsForUnifiedView } from '@/lib/insights/grouping';
import { getGroundedContext } from '@/lib/insights/context';

export const POST = async (req: NextRequest) => {
  try {
    const { message, history, sessionId } = await req.json();

    // 1. Get grounding context (What is the data saying?)
    let dataSummary = "No data loaded.";
    if (sessionId) {
      const groups = await groupDatasetsForUnifiedView(sessionId);
      const profiles = [];
      for (const group of groups) {
        const p = await getGroundedContext(group);
        profiles.push(...p);
      }
      
      // Summarize profiles for the chat prompt
      dataSummary = profiles.map(p => `
        Dataset: ${p.source} - ${p.topic} (${p.geography})
        Columns identified: ${p.columns.map(c => `${c.name} (${c.type})`).join(', ')}
        Stats Highlights: ${p.columns.filter(c => c.type === 'numeric').map(c => `${c.name}: Avg ${Math.round(c.stats.avg || 0)}`).join(' | ')}
      `).join('\n---\n');
    }

    // 2. Fetch existing insights for the session
    const insightsRes = await db.query('SELECT content FROM generated_insights WHERE upload_id = $1', [sessionId]);
    const insights = insightsRes.rows.map(r => JSON.parse(r.content).title).join(', ');

    const systemPrompt = `You are the PRISM Intelligence Copilot. 
Your goal is to help the user understand their strategic data and the insights generated on the dashboard.

CURRENT DATA CONTEXT:
${dataSummary}

CURRENT DASHBOARD INSIGHTS:
${insights}

USER HISTORY:
${(history || []).map((h: any) => `${h.role}: ${h.content}`).join('\n')}

INSTRUCTIONS:
1. Be executive-grade, professional, and data-driven.
2. If the user asks about specific numbers, refer to the DATA_CONTEXT.
3. If they ask about strategy, refer to the DASHBOARD_INSIGHTS.
4. Keep responses concise but actionable.
5. You have access to Ollama (local) and Gemini (cloud) for your reasoning.`;

    const aiResponse = await callLLM(message, systemPrompt);

    return NextResponse.json({ role: 'assistant', content: aiResponse });
  } catch (error: any) {
    console.error('Chat Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
};
