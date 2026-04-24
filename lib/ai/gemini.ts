/**
 * lib/ai/gemini.ts
 * Google Gemini client — insight titles, narratives, and full PRISM analysis.
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

export interface GeminiInsightCard {
  title: string;
  bucket: 'content' | 'commerce' | 'communication' | 'culture';
  type: 'hbar' | 'bar' | 'pie' | 'line';
  conviction: number;
  obs: string;
  stat: string;
  rec: string;
  toolLabel: string;
  chartLabels: string[];
  chartValues: number[];
}

/**
 * Primary PRISM analysis — Gemini 2.5 Flash reads a structured data
 * summary and returns 8 fully-formed insight cards spread across the
 * four PRISM buckets.
 */
export async function analyzeDataForPRISM(
  dataSummary: string,
  context: string,
  toolLabel: string = 'GWI',
): Promise<GeminiInsightCard[]> {
  const genAI = await getGenAI();
  if (!genAI) return [];

  // Try 2.5 Flash first, fall back to 1.5 Flash
  let model: any;
  try {
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });
  } catch {
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  const prompt = `You are a senior strategic insights analyst at PRISM, a leading consumer intelligence consultancy.

DATASET: ${context}

${dataSummary}

━━ GWI DATA GLOSSARY ━━
• Index score: 100 = market average. Index 150 = audience is 50% MORE likely than average to have this attribute. Index 200 = twice as likely. Focus on Index >130 for strong signals.
• Audience % = proportion of YOUR target audience with this attribute
• Data point % = proportion of general population with this attribute
• Universe = estimated population size with this attribute in India

━━ YOUR TASK ━━
Generate exactly 8 strategic insight cards — 2 per PRISM bucket — based on the highest-Index, most commercially significant findings in the data.

PRISM BUCKET DEFINITIONS:
• "content"       — Digital media consumption, content formats, device ownership, owned media engagement
• "commerce"      — Purchase behavior, transaction preferences, price/value trade-offs, retail channels, income signals
• "communication" — Brand discovery, advertising receptivity, brand relationships, word-of-mouth, advocacy
• "culture"       — Lifestyle indicators, household structure, demographics, personal values, life stage

RULES:
• Each bucket must have exactly 2 insights (total = 8)
• Pick findings with Index >130 whenever possible — these are the strongest audience signals
• Titles must be sharp, ≤12 words, reference actual data (e.g. "197 Index: Gamers Over-Index 2× on Device Ownership")
• obs: 2 sentences, cite specific numbers (%, Index, Universe size)
• stat: punchy 1-line highlight (e.g. "Index 197 · 2.3× market average")
• rec: one specific, actionable recommendation starting with a verb
• chartLabels: up to 8 attribute names from the data (for bar/hbar charts)
• chartValues: corresponding Audience % values — use actual numbers from the data

Return ONLY valid JSON (no markdown, no explanation):
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture",
    "type": "hbar|bar|pie",
    "conviction": 90,
    "obs": "string",
    "stat": "string",
    "rec": "string",
    "chartLabels": ["label1","label2"],
    "chartValues": [42.5, 38.1]
  }
]`;

  try {
    const result  = await model.generateContent(prompt);
    const rawText = result.response.text().trim();

    // Strip markdown fences if present
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array found in response');

    const parsed: any[] = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    // Normalise and attach toolLabel
    return parsed.slice(0, 8).map(c => ({
      title:       String(c.title  || 'Untitled Insight'),
      bucket:      (['content','commerce','communication','culture'].includes(c.bucket) ? c.bucket : 'content') as GeminiInsightCard['bucket'],
      type:        (['hbar','bar','pie','line'].includes(c.type) ? c.type : 'hbar') as GeminiInsightCard['type'],
      conviction:  Number(c.conviction) || 88,
      obs:         String(c.obs  || ''),
      stat:        String(c.stat || ''),
      rec:         String(c.rec  || ''),
      toolLabel,
      chartLabels: Array.isArray(c.chartLabels) ? c.chartLabels.map(String) : [],
      chartValues: Array.isArray(c.chartValues) ? c.chartValues.map(Number)  : [],
    }));

  } catch (err) {
    console.warn('[Gemini 2.5] analyzeDataForPRISM failed:', (err as Error).message);
    return [];
  }
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
