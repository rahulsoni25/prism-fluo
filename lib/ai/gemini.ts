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

━━ VOICE & TONE ━━
You are a brilliant strategist who also happens to be a great storyteller. Write the way the best planners talk in a room — confident, clear, a little exciting, and always grounded in truth.

The golden rule: if a 16-year-old and a CMO both read this card, both should find it interesting and completely understand it.

AVOID these words entirely: over-index, leverage, cohort, synergy, paradigm, utilize, granular, robust, actionable, ecosystem, holistic, touchpoint, seamless, streamline, whitespace, deep-dive. If you were about to use one — replace it with a simpler, more human word.

USE words like: people, buyers, families, young Indians, most households, nearly twice, 1 in 3, surprising, worth noting, this tells us, here is the thing, think about it.

Numbers must always be translated: never write "Index 197" alone. Always convert to plain English: "almost twice as many people as average", "68% more likely", "1 in 4 Indian households".

━━ CARD FORMAT ━━

TITLE (max 14 words) — write it like a great magazine cover line or a WhatsApp message you would forward to a colleague:
  • Lead with the most surprising finding
  • Include a real number, translated into plain English
  • Make it feel worth reading — not like a slide header
  ✅ "Most Indian Families Who Shop Online Also Watch More Than 3 Hours of TV a Day"
  ✅ "Eco-Friendly Buyers Are Twice as Likely to Pay Full Price — and Brands Are Missing Them"
  ❌ "Eco-conscious Consumers Over-Index on Full Price Purchase Behaviour"

OBSERVATION (obs) — write it like a voice note from a smart colleague, 3 sentences:
  Line 1 → Paint the picture. Start with "Here's something interesting:" or "Think about this:" or a direct surprising statement. Make the reader go "oh wow".
  Line 2 → Back it up with real numbers, explained simply. ("Among our target audience of 18–64-year-old Indians, nearly X out of Y people do this — that is about X million households, almost twice the national average.")
  Line 3 → Give the so-what for a brand team in one clear sentence. What should they feel or do differently because of this?

STAT — write it like the one number you would put on a slide to make everyone in the room look up. Short. Specific. Plain English.
  ✅ "3 in 10 Indian families in this group bought eco-friendly products last month"
  ✅ "Full-price buyers are 68% more common in this group than in the average Indian household"
  ❌ "Index 168 · Full Price vs Sale purchasing behaviour"

RECOMMENDATION (rec) — write it like a briefing note to a creative director or a media buyer. One sentence. Tell them the channel, the format, and the creative angle.
  ✅ "Run 15-second Instagram Reels and YouTube pre-rolls showing real Indian families making smart, confident buying decisions — not discount hunters."
  ✅ "Brief your creative team to build content around the pride of owning, not the fear of missing a sale — and distribute it on CTV and OTT platforms where this audience spends evenings."
  ❌ "Develop targeted content strategies for premium-positioned digital activations."

━━ OUTPUT RULES ━━
• Exactly 2 insights per bucket = 8 total
• Pick the highest-Index findings — they are the most surprising and useful
• chartLabels: up to 8 attribute names directly from the data
• chartValues: Audience % values, real numbers from the data
• type: "hbar" for rankings, "bar" for comparisons, "pie" for splits

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
