/**
 * lib/ai/gemini.ts
 * Google Gemini client — PRISM insight generation + title/narrative helpers.
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

// ── Types ──────────────────────────────────────────────────────

export interface GeminiInsightCard {
  title:        string;
  bucket:       'content' | 'commerce' | 'communication' | 'culture';
  type:         'hbar' | 'bar' | 'pie' | 'scatter';
  conviction:   number;
  obs:          string;
  stat:         string;
  rec:          string;
  toolLabel:    string;
  chartLabels:  string[];
  chartValues:  number[];
  chartValues2?: number[]; // scatter Y-axis (Index scores)
}

/** One pre-processed slot — exact numbers, no estimates */
export interface DataSlot {
  bucket:          'content' | 'commerce' | 'communication' | 'culture';
  question:        string;
  chartSuggestion: 'hbar' | 'bar' | 'pie' | 'scatter';
  rows: Array<{
    attr:        string;
    audiencePct: number;
    dataPct:     number;
    index:       number;
    universe:    number;
  }>;
}

// ── Primary PRISM analysis ─────────────────────────────────────

/**
 * Gemini 2.5 Flash reads pre-processed data slots (exact numbers per slot)
 * and writes 8 McKinsey-quality insight cards — 2 per PRISM bucket.
 * Anti-hallucination: every number Gemini uses comes from the slots we provide.
 */
export async function analyzeDataForPRISM(
  slots:     DataSlot[],
  context:   string,
  toolLabel: string = 'GWI',
): Promise<GeminiInsightCard[]> {
  const genAI = await getGenAI();
  if (!genAI || slots.length === 0) return [];

  let model: any;
  try {
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });
  } catch {
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  // Build structured slot block — exact numbers, clearly labelled
  const slotBlock = slots.map((slot, i) => {
    const rowLines = slot.rows.map(r =>
      `    • ${r.attr}: ${r.audiencePct.toFixed(1)}% of this audience have this` +
      ` — that is ${(r.index / 100).toFixed(2)}× the national average` +
      (r.universe > 0 ? `, approximately ${(r.universe / 1e6).toFixed(1)} million people in India` : ''),
    ).join('\n');

    return `
SLOT ${i + 1} | PRISM Bucket: ${slot.bucket.toUpperCase()} | Topic: ${slot.question}
Suggested chart: ${slot.chartSuggestion}
DATA (use ONLY these numbers — no other sources, no estimates):
${rowLines}`;
  }).join('\n');

  const prompt = `You are a brilliant Creative Strategist and Media Planner at PRISM, a top consumer intelligence firm in India.
Your readers are brand managers and media planners who want clear, honest, human stories from consumer data — not jargon-heavy reports.

DATASET: ${context}

${slotBlock}

━━ ONE CARD PER SLOT — UNIQUENESS RULE ━━
You have ${slots.length} slots above. Write EXACTLY ${slots.length} cards — one card per slot, in order.
Card 1 → SLOT 1 only. Card 2 → SLOT 2 only. Card 3 → SLOT 3 only. And so on.
Do NOT mix findings from different slots into a single card.
Do NOT repeat the same finding, stat, or sentence across any two cards.
Before returning, verify: no two cards share the same opening sentence, same stat, or same recommendation platform.

━━ ANTI-HALLUCINATION RULE — READ THIS FIRST ━━
Every single number, percentage, or statistic in your observation MUST come directly from the slot data above.
Do NOT invent, guess, round differently, or add any number that is not in the slot.
If a slot says "3.45× the national average", you can write "about 3 and a half times more likely".
If a slot says "21.8% of this audience", you can write "roughly 1 in 5 people" or "about 22 out of every 100".
Translate numbers into plain English — but stay accurate to what the data actually says.

━━ TONE ━━
Write like a brilliant colleague explaining a finding over coffee — not a consultant writing a deck.
• A 16-year-old and a CMO should both find every card interesting and easy to read
• Short sentences. Active voice. Plain English.
• Banned words: over-index, leverage, cohort, synergy, touchpoint, whitespace, holistic, robust, utilize, paradigm, seamless
• Use: people, families, buyers, young Indians, 1 in 3, nearly twice, here is the thing, think about this

━━ CARD FORMAT — follow exactly ━━

TITLE (max 14 words):
Write like a great magazine cover line. Lead with the surprising finding. Include one plain-English number.
✅ "Almost Half of Urban Indian Families Still Prefer Buying at a Local Store"
✅ "India's Full-Price Shoppers Are Nearly Twice as Common as Brands Think"
❌ "Consumers Over-Index on Full Price vs Sale Purchase Behaviour"

OBSERVATION — 3 sentences, precise and grounded in this slot's data only:
• Sentence 1: Start with a punchy surprising fact drawn directly from the highest-index item in THIS slot.
• Sentence 2: Give the exact numbers in plain English — reference the specific attributes, percentages, and multipliers from THIS slot.
• Sentence 3: State the strategic so-what for a brand or media team in one clear, direct sentence.

STAT — one crisp number that would make a room go quiet. Derived strictly from THIS slot's data.
✅ "Nearly 2 in 3 Indian households in this group prefer local stores over big chains"
✅ "Full-price buyers are about 70% more common in this audience than in the average household"
❌ "Index 168 · Full Price behaviour" (never write Index numbers raw)

RECOMMENDATION — one sentence written as a direct brief to a creative director or media buyer.
Name a specific Indian platform or channel (YouTube, Instagram Reels, Hotstar, JioCinema, Meesho, Flipkart, etc.)
Name a specific format (6-second bumper, 15-second Reel, CTV pre-roll, in-feed video, search ad, etc.)
Name a specific creative angle (real Indian homes, confident buyers, family moments, aspiration, utility).
✅ "Run 15-second Instagram Reels and YouTube pre-rolls showing real Indian families making confident purchases — skip the discount angle entirely."
✅ "Brief your creative team to build a CTV campaign on Hotstar showing the pride of smart home ownership, targeting metro India evening audiences."

━━ CHART DATA ━━
• chartLabels: use the exact attribute names from THIS slot (up to 8)
• chartValues: use exact Audience % values from THIS slot
• For scatter: chartLabels = attribute names, chartValues = Audience % (X axis), chartValues2 = Index scores converted to multipliers (Y axis, e.g. Index 197 → 1.97)
• type: match the chartSuggestion from THIS slot unless a different type is clearly better

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture",
    "type": "hbar|bar|pie|scatter",
    "conviction": 90,
    "obs": "string",
    "stat": "string",
    "rec": "string",
    "chartLabels": ["label1","label2"],
    "chartValues": [42.5, 38.1],
    "chartValues2": [1.97, 1.54]
  }
]`;

  try {
    const result  = await model.generateContent(prompt);
    const rawText = result.response.text().trim();
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in Gemini response');

    const parsed: any[] = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const validBuckets = ['content','commerce','communication','culture'];
    const validTypes   = ['hbar','bar','pie','scatter'];

    return parsed.slice(0, 8).map(c => ({
      title:        String(c.title || 'Insight'),
      bucket:       (validBuckets.includes(c.bucket) ? c.bucket : 'content') as GeminiInsightCard['bucket'],
      type:         (validTypes.includes(c.type)     ? c.type   : 'hbar')    as GeminiInsightCard['type'],
      conviction:   Number(c.conviction) || 88,
      obs:          String(c.obs  || ''),
      stat:         String(c.stat || ''),
      rec:          String(c.rec  || ''),
      toolLabel,
      chartLabels:  Array.isArray(c.chartLabels)  ? c.chartLabels.map(String)  : [],
      chartValues:  Array.isArray(c.chartValues)  ? c.chartValues.map(Number)  : [],
      chartValues2: Array.isArray(c.chartValues2) ? c.chartValues2.map(Number) : undefined,
    }));

  } catch (err) {
    console.warn('[Gemini 2.5] analyzeDataForPRISM failed:', (err as Error).message);
    return [];
  }
}

// ── Generic tabular analysis (non-GWI: Amazon, Helium10, sales, marketing, etc.) ──

/**
 * Analyse arbitrary tabular data (any columns) and return PRISM cards.
 * Works on Amazon / Helium10 / sales / marketing / brand-tracking exports.
 * Gemini infers the dataset's nature from the column names and a sample
 * of rows, and writes creative/media-professional copy — never finance jargon.
 */
export async function analyzeGenericTabularForPRISM(
  rows:      any[],
  context:   string,
  toolLabel: string,
): Promise<GeminiInsightCard[]> {
  const genAI = await getGenAI();
  if (!genAI || !Array.isArray(rows) || rows.length === 0) return [];

  let model: any;
  try {
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });
  } catch {
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  // Sample to keep token use bounded — first 60 rows is plenty for pattern detection
  const sample = rows.slice(0, 60);
  const columns = Object.keys(sample[0] ?? {});
  // Trim long string fields so the prompt stays compact
  const compactSample = sample.map(r => {
    const o: Record<string, any> = {};
    for (const k of columns) {
      const v = r[k];
      o[k] = typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '…' : v;
    }
    return o;
  });

  const prompt = `You are a senior Creative Strategist at PRISM, a consumer-intelligence firm advising brand managers, media planners, content strategists and creative directors in India.

You will receive a tabular dataset (any shape — could be Amazon listings, brand tracking, sales, social, audience research). Your job is to read the columns and rows, infer what this data is about, and write 8 PRISM insight cards — 2 per bucket (Content · Commerce · Communication · Culture).

━━ DATASET ━━
Source: ${context}
Columns: ${columns.join(', ')}
Sample rows (up to 60):
${JSON.stringify(compactSample, null, 2)}

━━ AUDIENCE & TONE — READ THIS CAREFULLY ━━
You are writing for **creative and media professionals**, NOT financial analysts.
• NEVER use stock-market or finance language: tailspin, momentum, volatility, breakout, multiplier, dominance alert, market moat, volume-capture, growth risk, critical warning, capitalise.
• Write like a smart magazine editor or strategy planner. Plain English, short sentences, active voice.
• A creative director and a CMO should both find every card sharp and useful.
• Banned words: over-index, leverage, cohort, synergy, touchpoint, whitespace, holistic, robust, utilize, paradigm, seamless, momentum, tailspin, dominance, volatility.
• Use: people, shoppers, viewers, audiences, families, 1 in 3, nearly twice, here's the thing.

━━ ANTI-HALLUCINATION ━━
Every number/percentage in your cards MUST come from the sample rows above. If you can't compute it from the data, leave it out.

━━ BUCKET ASSIGNMENT ━━
• content       — what people watch/read/play, formats, devices, screen behaviour, listings, titles, descriptions
• commerce      — purchase, price, ranking (BSR), sales rank, units, sellers, retailers, conversion
• communication — how brands show up: ads, search visibility, reviews, ratings, social signals, brand voice
• culture       — who the audience is, lifestyle, values, region, demographics, identity signals

━━ CARD FORMAT ━━
TITLE (max 14 words): magazine cover line — surprising finding + one plain-English number, no jargon.
OBSERVATION (3 sentences): hook → exact numbers from the data → strategic so-what for a brand/media team.
STAT: one crisp plain-English number (NOT a templated "+X% Revenue · Multiplier: Y×" string).
RECOMMENDATION: one sentence to a creative director. Name a specific Indian platform (Instagram Reels, YouTube, Hotstar, Amazon, Flipkart, JioCinema, Meesho), a specific format (15-second Reel, search ad, sponsored listing, CTV pre-roll, in-feed video), and a specific creative angle.

━━ UNIQUENESS ━━
Write EXACTLY 8 cards. No two cards may share the same opening sentence, the same stat, or the same recommendation platform+format combo.

━━ CHART DATA ━━
For each card, pick a small set of labels + values from the sample (up to 8 items). Use the actual values from the rows. If a chart doesn't make sense for a card, return chartLabels: [] and chartValues: [].

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture",
    "type": "hbar|bar|pie|scatter",
    "conviction": 88,
    "obs": "string",
    "stat": "string",
    "rec": "string",
    "chartLabels": ["label1","label2"],
    "chartValues": [12.5, 8.3],
    "chartValues2": []
  }
]`;

  try {
    const result  = await model.generateContent(prompt);
    const rawText = result.response.text().trim();
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in Gemini generic response');

    const parsed: any[] = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const validBuckets = ['content','commerce','communication','culture'];
    const validTypes   = ['hbar','bar','pie','scatter'];

    return parsed.slice(0, 8).map(c => ({
      title:        String(c.title || 'Insight'),
      bucket:       (validBuckets.includes(c.bucket) ? c.bucket : 'content') as GeminiInsightCard['bucket'],
      type:         (validTypes.includes(c.type)     ? c.type   : 'hbar')    as GeminiInsightCard['type'],
      conviction:   Number(c.conviction) || 88,
      obs:          String(c.obs  || ''),
      stat:         String(c.stat || ''),
      rec:          String(c.rec  || ''),
      toolLabel,
      chartLabels:  Array.isArray(c.chartLabels)  ? c.chartLabels.map(String)  : [],
      chartValues:  Array.isArray(c.chartValues)  ? c.chartValues.map(Number)  : [],
      chartValues2: Array.isArray(c.chartValues2) && (c.chartValues2 as any[]).length > 0
        ? c.chartValues2.map(Number) : undefined,
    }));

  } catch (err) {
    console.warn('[Gemini 2.5] analyzeGenericTabularForPRISM failed:', (err as Error).message);
    return [];
  }
}

// ── Fallback helpers (used when Gemini 2.5 is unavailable) ────

export interface ChartSpecInput {
  title:      string;
  type:       string;
  lbl?:       string;
  obs?:       string;
  rec?:       string;
  conviction?: number;
}

export async function enhanceInsightTitles(
  charts:  ChartSpecInput[],
  context: string,
): Promise<string[]> {
  const genAI = await getGenAI();
  if (!genAI || charts.length === 0) return charts.map(c => c.title);

  try {
    const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a Creative Strategist writing insight headlines for brand and media teams. Write like a sharp magazine editor — clear, plain English, no jargon.

Each title (max 14 words):
• Lead with the surprising or interesting finding
• Include one plain-English number (not raw Index scores)
• No jargon: ban over-index, leverage, cohort, synergy, touchpoint
• Sound like a magazine cover line, not a consulting report

✅ "India's Gamers Are Nearly Twice as Likely to Own a Smart Home Device"
❌ "Gamers Over-Index at 197 on Smart Home Product Ownership"

Dataset: ${context}

Charts:
${charts.map((c, i) => `${i + 1}. Type: ${c.type} | Label: "${c.lbl || ''}" | Current: "${c.title}" | Observation: "${c.obs || ''}"`).join('\n')}

Return ONLY a valid JSON array of strings, one per chart.
Example: ["Title 1", "Title 2"]`;

    const result = await model.generateContent(prompt);
    const text   = result.response.text();
    const match  = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length === charts.length)
        return parsed.map(t => String(t).trim()).filter(Boolean);
    }
  } catch (err) {
    console.warn('[Gemini] enhance failed:', (err as Error).message);
  }
  return charts.map(c => c.title);
}

export async function enhanceInsightNarratives(
  charts:  ChartSpecInput[],
  context: string,
): Promise<Array<{ obs: string; rec: string; stat?: string }>> {
  const genAI = await getGenAI();
  if (!genAI || charts.length === 0)
    return charts.map(c => ({ obs: c.obs || '', rec: c.rec || '' }));

  try {
    const model  = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a senior strategic insights analyst writing for brand and media teams in India.

Rewrite each observation and recommendation in plain, clear English — no jargon, short sentences, active voice.

Charts from ${context}:
${charts.map((c, i) => `${i + 1}. Title: "${c.title}" | Obs: "${c.obs || 'N/A'}" | Rec: "${c.rec || 'N/A'}"`).join('\n')}

Return ONLY a valid JSON array, one object per chart:
[{"obs": "...", "rec": "...", "stat": "..."}, ...]
- obs: 2 sentences, plain English, include a specific number
- rec: 1 sentence starting with a verb, specific channel and creative angle
- stat: one short plain-English highlight stat, or null`;

    const result = await model.generateContent(prompt);
    const text   = result.response.text();
    const match  = text.match(/\[[\s\S]*?\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed) && parsed.length === charts.length)
        return parsed;
    }
  } catch (err) {
    console.warn('[Gemini] narratives failed:', (err as Error).message);
  }
  return charts.map(c => ({ obs: c.obs || '', rec: c.rec || '' }));
}

// ── PDF / free-text analysis ───────────────────────────────────

/**
 * Reads raw PDF text (no structured rows) and generates 8 PRISM insight cards.
 * Gemini infers the market, geography, and topic from the document text + filename.
 * Chart data is extracted from any numbers Gemini finds in the text.
 */
export async function analyzeTextForPRISM(
  text:     string,
  filename: string,
): Promise<GeminiInsightCard[]> {
  const genAI = await getGenAI();
  if (!genAI || !text.trim()) return [];

  let model: any;
  try {
    model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-04-17' });
  } catch {
    model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  // Truncate to ~12 000 chars to stay within token budget
  const excerpt = text.length > 12000 ? text.slice(0, 12000) + '\n…[truncated]' : text;

  const prompt = `You are a senior Creative Strategist at PRISM, a consumer intelligence firm.
You have been given a market research PDF report. Your job is to read it carefully and generate 8 insight cards — 2 for each PRISM bucket (Content · Commerce · Communication · Culture).

━━ SOURCE DOCUMENT ━━
Filename: ${filename}
Text:
${excerpt}

━━ PRISM BUCKETS — assign each card to the most relevant bucket ━━
• content       — media consumption, streaming, screen time, content formats, entertainment
• commerce      — purchase behaviour, shopping, pricing, brand preference, retailers
• communication — advertising, discovery, word of mouth, brand perception, social media
• culture       — demographics, lifestyle, family, values, attitudes, employment, society

━━ CARD RULES ━━
1. Write EXACTLY 8 cards — 2 per bucket, all 4 buckets must appear.
2. Each card covers a DIFFERENT finding from the report. No repeats.
3. Every number, percentage, or statistic MUST come from the document text above. Do not invent figures.
4. If no numeric data exists for a card, still write the obs/stat/rec in plain English, and use chartLabels: [] chartValues: [].

━━ TONE ━━
• Plain English. Short sentences. Active voice.
• Banned words: over-index, leverage, cohort, synergy, touchpoint, holistic, robust, utilize, paradigm, seamless
• Write like a brilliant colleague, not a consulting report.
• Audience: brand managers and media planners — 7th-grade readable.

━━ CARD FORMAT ━━
TITLE (max 14 words): Magazine cover line — surprising finding + one plain-English number.
OBSERVATION (3 sentences): Surprising hook → exact numbers from the document → strategic so-what.
STAT: One crisp plain-English number that would make a room go quiet.
RECOMMENDATION: One sentence to a creative director — name a specific platform, format, and creative angle.

━━ CHART DATA ━━
• For each card, extract up to 8 labels + values from the relevant section of the document.
• chartLabels: category/attribute names found in the text
• chartValues: percentage or numeric values found in the text (as numbers, not strings)
• If scatter makes sense (two numeric dimensions): fill chartValues2 as well
• type: choose hbar (horizontal bar, best for lists), bar (vertical), pie (max 6 items, parts of a whole), or scatter

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture",
    "type": "hbar|bar|pie|scatter",
    "conviction": 85,
    "obs": "string",
    "stat": "string",
    "rec": "string",
    "chartLabels": ["label1","label2"],
    "chartValues": [42.5, 38.1],
    "chartValues2": []
  }
]`;

  try {
    const result  = await model.generateContent(prompt);
    const rawText = result.response.text().trim();
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array in Gemini PDF response');

    const parsed: any[] = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const validBuckets = ['content', 'commerce', 'communication', 'culture'];
    const validTypes   = ['hbar', 'bar', 'pie', 'scatter'];
    const toolLabel    = filename.replace(/\.[^.]+$/, '').slice(0, 40);

    return parsed.slice(0, 8).map(c => ({
      title:        String(c.title  || 'Insight'),
      bucket:       (validBuckets.includes(c.bucket) ? c.bucket : 'content') as GeminiInsightCard['bucket'],
      type:         (validTypes.includes(c.type)     ? c.type   : 'hbar')    as GeminiInsightCard['type'],
      conviction:   Number(c.conviction) || 85,
      obs:          String(c.obs   || ''),
      stat:         String(c.stat  || ''),
      rec:          String(c.rec   || ''),
      toolLabel,
      chartLabels:  Array.isArray(c.chartLabels)  ? c.chartLabels.map(String)  : [],
      chartValues:  Array.isArray(c.chartValues)  ? c.chartValues.map(Number)  : [],
      chartValues2: Array.isArray(c.chartValues2) && (c.chartValues2 as any[]).length > 0
        ? c.chartValues2.map(Number) : undefined,
    }));

  } catch (err) {
    console.warn('[Gemini] analyzeTextForPRISM failed:', (err as Error).message);
    return [];
  }
}
