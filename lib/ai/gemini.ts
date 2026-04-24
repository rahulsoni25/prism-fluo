/**
 * lib/ai/gemini.ts
 * Google Gemini client for AI-powered insight title generation.
 * Falls back gracefully if GEMINI_API_KEY is not set.
 */

let _genAI: any = null;

async function getGenAI() {
  if (_genAI) return _genAI;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    _genAI = new GoogleGenerativeAI(key);
  } catch {
    _genAI = null;
  }
  return _genAI;
}

export interface ChartSpecInput {
  title: string;
  type: string;
  lbl?: string;
  obs?: string;
  rec?: string;
  conviction?: number;
}

export async function enhanceInsightTitles(
  charts: ChartSpecInput[],
  context: string
): Promise<string[]> {
  const genAI = await getGenAI();
  if (!genAI || charts.length === 0) return charts.map(c => c.title);

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a senior strategic insights analyst at a top market research firm.

Given these data charts from ${context}, rewrite each chart title as a sharp, compelling insight headline.
Rules:
- Max 12 words per title
- Be specific to the data (use metrics, audience names, categories mentioned)
- Sound like an expert human analyst, not a bot
- Start with a strong verb or key finding where possible
- No generic titles like "Data Overview" or "Chart Analysis"

Charts:
${charts.map((c, i) => `${i + 1}. Type: ${c.type} | Label: "${c.lbl || ''}" | Current: "${c.title}" | Observation: "${c.obs || ''}"`).join('\n')}

Return ONLY a valid JSON array of strings, one per chart, in the same order.
Example output: ["Title 1 here", "Title 2 here"]`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length === charts.length) {
        return parsed.map(t => String(t).trim()).filter(Boolean);
      }
    }
  } catch (err) {
    console.warn('[Gemini] enhance failed:', (err as Error).message);
  }

  return charts.map(c => c.title);
}

export async function enhanceInsightNarratives(
  charts: ChartSpecInput[],
  context: string
): Promise<Array<{ obs: string; rec: string; stat?: string }>> {
  const genAI = await getGenAI();
  if (!genAI || charts.length === 0) {
    return charts.map(c => ({ obs: c.obs || '', rec: c.rec || '' }));
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `You are a senior strategic insights analyst.

Enhance these observation/recommendation texts for ${context} data charts. Make them sharper, more actionable, and more specific.

Charts:
${charts.map((c, i) => `${i + 1}. Title: "${c.title}" | Obs: "${c.obs || 'N/A'}" | Rec: "${c.rec || 'N/A'}"`).join('\n')}

Return ONLY a valid JSON array, one object per chart:
[{"obs": "...", "rec": "...", "stat": "..."}, ...]
- obs: 1-2 sentences, factual observation (include a number/% if possible)
- rec: 1 sentence, specific actionable recommendation starting with a verb
- stat: a short highlight stat (e.g. "2.3× higher") or omit with null`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const match = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length === charts.length) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[Gemini] narratives failed:', (err as Error).message);
  }

  return charts.map(c => ({ obs: c.obs || '', rec: c.rec || '' }));
}
