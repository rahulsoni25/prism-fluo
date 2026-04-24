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

  const prompt = `You are a world-class Creative Strategist and Media Planner at PRISM, a leading consumer intelligence consultancy in India. Your job is to turn raw survey data into compelling strategic stories that help brand teams make smarter creative and media decisions.

DATASET: ${context}

${dataSummary}

━━ GWI DATA GLOSSARY ━━
• Index score: 100 = market average. Index 150 = this audience is 50% MORE likely than average to have this attribute. Index 200 = twice as likely. Anything above 130 is a strong targeting signal.
• Audience % = proportion of YOUR target audience with this attribute
• Universe = estimated population size in India with this attribute

━━ YOUR TASK ━━
Generate exactly 8 insight cards — 2 per PRISM bucket — that a brand strategist or media planner can act on immediately. Each insight must read like a mini creative brief, not a data report.

PRISM BUCKET DEFINITIONS:
• "content"       — What content formats, devices, and owned media this audience consumes and how to reach them
• "commerce"      — How this audience buys, what drives purchase decisions, price sensitivity, channel preference
• "communication" — How brands should talk to them: tone, discovery channels, advertising receptivity, advocacy triggers
• "culture"       — Who they are as people: lifestyle, household, values, life stage — the human truth behind the data

━━ CARD FORMAT RULES ━━

TITLE — must have 3 elements fused into one sharp headline (max 14 words):
  1. The HOOK: an unexpected or counterintuitive lead (e.g. "Not Just Online Shoppers —")
  2. The INSIGHT: the single strongest data finding (e.g. "India's Gamers Are the Most Device-Rich Segment")
  3. The NUMBER: the Index or % that proves it (e.g. "at Index 197")
  Example: "Not Just Scrollers — India's PC Users Over-Index on Premium Devices at Index 154"

OBSERVATION (obs) — tell a story in 3 sentences:
  Sentence 1: Set the scene — what is happening in this data, stated as a human truth, not a metric.
  Sentence 2: Prove it with numbers — cite the exact Index score, Audience %, and Universe size.
  Sentence 3: So what? — explain the strategic implication for a brand or media planner.

STAT — one punchy data highlight formatted as: "[Key metric] · [What it means]"
  Example: "Index 197 · Gamers are 2× more likely to own a smart device than the average Indian internet user"

RECOMMENDATION (rec) — one sentence, written as a direct brief to a creative or media team. Start with a verb. Be specific about the FORMAT, CHANNEL, or CREATIVE ANGLE.
  Example: "Run high-impact video pre-rolls on gaming platforms targeting device-rich 25–34M audiences in metro India, leading with aspirational smart-home imagery."

━━ OUTPUT RULES ━━
• Each bucket must have exactly 2 insights (total = 8)
• Use findings with the highest Index scores — these are the most actionable signals
• chartLabels: up to 8 attribute names from the data
• chartValues: corresponding Audience % values (real numbers from the data)
• type: use "hbar" for rankings/comparisons, "bar" for categories, "pie" for share splits

Return ONLY valid JSON (no markdown, no code fences, no explanation):
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

    const prompt = `You are a world-class Creative Strategist and Media Planner at a top consumer intelligence firm.

Rewrite each chart title as a sharp, story-driven insight headline for brand and media planning teams.

Each title must fuse 3 elements (max 14 words):
1. A HOOK — surprising or counterintuitive lead
2. The INSIGHT — the key human truth from the data
3. The PROOF — a specific number, Index score, or % that validates it

Example: "Not Just Scrollers — India's PC Users Are 54% More Device-Rich at Index 154"

Dataset context: ${context}

Charts:
${charts.map((c, i) => `${i + 1}. Type: ${c.type} | Label: "${c.lbl || ''}" | Current title: "${c.title}" | Observation: "${c.obs || ''}"`).join('\n')}

Return ONLY a valid JSON array of strings, one per chart, in the same order.
Example: ["Title 1", "Title 2"]`;

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
