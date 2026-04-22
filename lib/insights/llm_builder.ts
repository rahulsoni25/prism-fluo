import { DatasetProfile } from './context';
import { InsightCard } from '@/types/insights';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * THE GROUNDED AI STRATEGIST (MULTI-LLM EDITION)
 * Enforces strict data grounding and prototype UI mapping.
 * Supports Gemini API (Cloud) and Ollama (Local).
 */
export async function llmBuildInsightCards(profiles: DatasetProfile[], count: number = 10): Promise<InsightCard[]> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'gemma3';

  const systemPrompt = `You are PRISM Strategic AI — a senior data strategist.
Your goal is to analyze the provided DATA_CONTEXT and generate exactly ${count} high-fidelity strategic insight cards.

CRITICAL CONSTRAINTS:
1. ZERO HALLUCINATION: Only use values and trends found in the provided STATISTICAL_PROFILE and DATA_SAMPLES. Every number in your metrics and charts MUST come from the data.
2. PROTOTYPE MATCHING: Your output must be a valid JSON array of InsightCard objects.
3. ADVISORY TONE: Observations must be data-driven (e.g. "Keyword 'X' has 5x more volume than 'Y'"). Recommendations must be actionable.
4. CHART DATA: You MUST provide 'chartData' with real labels and data points extracted from the samples and profiles. Do not use generic labels like 'Value 1'.

JSON SCHEMA:
interface InsightCard {
  id: string;
  title: string;
  sources: string[];
  topic: 'Content' | 'Commerce' | 'Communication' | 'Culture';
  geography: string;
  period: string;
  metrics: { label: string; value: string; unit?: string; source: string }[];
  charts: { datasetId: string; chartSpecId: string }[];
  chartData: { 
    labels: string[]; 
    datasets: { label: string; data: number[] }[] 
  };
  observation: string;
  recommendation: string;
  conviction: number;
}

CRITICAL: The 'topic' field MUST be exactly one of: 'Content', 'Commerce', 'Communication', or 'Culture'.

REQUIRED OUTPUT: A raw JSON array of ${count} InsightCard objects. Do not include markdown formatting or explanations.`;


  const contextPrompt = `DATA_CONTEXT:
${JSON.stringify(profiles, null, 2)}

Identify the most significant patterns across these sources. If sources overlap (same Brand/ASIN/Geo), create unified cards. If not, create deep-dive cards. Ensure 10 cards total.`;

  // ──────────────────────────────────────────────
  // STRATEGY 1: GEMINI API (PREFERED IF KEY EXISTS)
  // ──────────────────────────────────────────────
  if (GEMINI_API_KEY) {
    try {
      console.log('🚀 Using Gemini API (gemini-2.5-flash) for AI Synthesis...');
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });


      const result = await model.generateContent([systemPrompt, contextPrompt]);
      const response = await result.response;
      const content = response.text();
      
      const parsed = JSON.parse(content);
      const cards: InsightCard[] = Array.isArray(parsed) ? parsed : (parsed.cards || []);
      return cards.filter(c => c.title && c.observation && c.recommendation);
    } catch (geminiError: any) {
      console.warn('⚠️ Gemini Synthesis failed, trying Ollama fallback:', geminiError.message);
    }
  }

  // ──────────────────────────────────────────────
  // STRATEGY 2: OLLAMA (LOCAL FALLBACK)
  // ──────────────────────────────────────────────
  try {
    console.log(`🏠 Using Ollama (${OLLAMA_MODEL}) for AI Synthesis...`);
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextPrompt }
        ],
        stream: false,
        format: 'json'
      }),
    });

    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);

    const data = await res.json();
    const content = data.message?.content || '[]';
    
    let sanitized = content.replace(/```json|```/g, '').trim();
    let parsed = JSON.parse(sanitized);
    
    if (!Array.isArray(parsed)) {
      const firstArrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
      if (firstArrayKey) {
        parsed = parsed[firstArrayKey];
      } else {
        throw new Error('LLM returned non-array response');
      }
    }

    const cards: InsightCard[] = parsed;
    return cards.filter(c => c.title && c.observation && c.recommendation);
  } catch (error: any) {
    console.error('LLM Builder Error:', error.message);
    throw error;
  }
}

