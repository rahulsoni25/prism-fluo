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

━━ TONE ━━
Write like you are explaining this to a smart 14-year-old or a first-time brand manager.
• NO jargon. Replace "over-index" with "are much more likely than most people". Replace "Index 197" with "almost twice as likely as the average person".
• Use everyday words. Short sentences. Active voice.
• Sound like a smart friend explaining something interesting — not a consultant writing a report.
• It is okay to use "they", "these people", "this group", "most Indians" etc.
• Numbers are good — but always explain what they mean in plain English right after.

━━ CARD FORMAT RULES ━━

TITLE — one punchy headline, max 14 words, written like a magazine cover line:
  • Start with the surprising or interesting finding
  • Include one real number (%, how many times more likely, or population size)
  • Use plain words — no buzzwords, no jargon
  Good example: "India's Gamers Are Nearly Twice as Likely to Own a Smart Home Device"
  Bad example: "Gamers Over-Index at 197 on Smart Home Product Ownership"

OBSERVATION (obs) — 3 short, clear sentences written like a story:
  Sentence 1: What is happening — state the finding as a simple human truth. ("Almost 1 in 4 Indians in our target group owns a smart home device.")
  Sentence 2: Why it matters — give the numbers in plain English. ("That is nearly twice the national average, which means this group is spending far more on connected living than most households.")
  Sentence 3: What this means for a brand team — one clear so-what. ("For a media planner, this is a signal to go heavy on platforms where tech-forward audiences spend time.")

STAT — one short, plain-English proof point. No Index jargon.
  Good example: "22 million Indians in this group own a games console — nearly 2× the average household"
  Bad example: "Index 197 · Games console ownership"

RECOMMENDATION (rec) — one direct sentence telling a brand or creative team exactly what to do. Simple words, specific action.
  Good example: "Create short video ads for YouTube and Instagram Reels showing how your product fits into a busy, tech-loving Indian household."
  Bad example: "Leverage high-impact pre-roll inventory on gaming-adjacent platforms to capture device-rich cohorts."

━━ OUTPUT RULES ━━
• Each bucket must have exactly 2 insights (total = 8)
• Use findings with the highest Index scores — these are the strongest signals
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

    const prompt = `You are a Creative Strategist writing insight headlines for brand and media teams. Write like a smart magazine editor — clear, plain English, no jargon.

Rules for each title (max 14 words):
• State the finding as a simple human truth anyone can understand
• Include one real number (% or "X times more likely") — but explain it in plain English
• No buzzwords like "over-index", "leverage", "cohort", or "synergy"
• Sound like a magazine cover line, not a consulting report

Good example: "India's Gamers Are Nearly Twice as Likely to Own a Smart Home Device"
Bad example: "Gamers Over-Index at 197 on Smart Home Product Ownership"

Dataset: ${context}

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
