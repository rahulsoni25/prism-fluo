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

/**
 * Pick up to N rows uniformly across the dataset (head + middle + tail).
 * Beats `rows.slice(0, N)` for large sorted/grouped exports where the
 * interesting variation lives outside the first N rows.
 */
function stratifiedSample<T>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows.slice();
  const out: T[] = [];
  const step = (rows.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(rows[Math.round(i * step)]);
  return out;
}

/**
 * Call generateContent with bounded retry on transient failures.
 * Retries on 429 (rate limit), 503 (overloaded), and ECONNRESET/timeout
 * with exponential backoff: 1s → 3s → 7s. Hard caps total wait at ~12s
 * so we still finish within the 60s function budget on Vercel Hobby.
 *
 * Non-retryable errors (400, 401, 403, 404, JSON shape errors) propagate
 * immediately so we don't waste budget on permanent failures.
 */
async function callGeminiWithRetry(model: any, prompt: string): Promise<any> {
  const MAX_ATTEMPTS = 3;
  const DELAYS_MS = [1000, 3000, 7000];
  let lastErr: any = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (err: any) {
      lastErr = err;
      const msg    = String(err?.message ?? err);
      const status = (err?.status ?? err?.response?.status ?? 0) as number;
      // 404 = model deprecated → blacklist it so the cascade advances immediately
      if (status === 404 || /no longer available|model.*not found|404/i.test(msg)) {
        invalidateModelCache(_resolvedModelName ?? undefined);
        throw err; // propagate immediately — retrying won't help
      }
      const transient =
        status === 429 || status === 503 || status === 504 ||
        /overloaded|rate ?limit|temporar|timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg);
      if (!transient || attempt === MAX_ATTEMPTS - 1) throw err;
      await new Promise(r => setTimeout(r, DELAYS_MS[attempt]));
    }
  }
  throw lastErr;
}

/**
 * Cascading model selection — singleton + no smoke test.
 *
 * WHY NO SMOKE TEST:
 *   Parallel uploads trigger 4+ simultaneous batches, each probing 3 candidates
 *   = 12+ extra API calls before any real work. On the free tier (15 RPM) this
 *   exhausts quota instantly and ALL batches fail → fallback triggers every time.
 *
 * FIX — two changes:
 *   1. No smoke test: pick the first non-blacklisted candidate immediately.
 *      Real 404s / empty responses are caught in callGeminiWithRetry and add
 *      the model to _failedModels, which drives the cascade on the next call.
 *   2. Singleton promise: parallel batches that all hit getModel() at the same
 *      time share ONE selection instead of each launching their own.
 *
 * Order: gemini-2.0-flash-lite (stable, cheap) → 2.5-flash preview → 2.5-pro preview.
 */
const MODEL_CANDIDATES = [
  'gemini-2.0-flash-lite',
  'gemini-2.5-flash-preview-05-20',
  'gemini-2.5-pro-preview-05-06',
];
let _resolvedModelName: string | null = null;
const _failedModels   = new Set<string>();   // blacklisted for this instance lifetime
let _probePromise: Promise<{ name: string; model: any }> | null = null;

async function getModel(genAI: any): Promise<{ name: string; model: any }> {
  // ── Warm path: reuse cached working model ──────────────────────────────
  if (_resolvedModelName) {
    return { name: _resolvedModelName, model: genAI.getGenerativeModel({ model: _resolvedModelName }) };
  }

  // ── Singleton path: parallel batches share one selection promise ────────
  if (_probePromise) return _probePromise;

  // ── Cold path: pick first non-blacklisted candidate, no smoke test ──────
  _probePromise = (async () => {
    let candidates = MODEL_CANDIDATES.filter(n => !_failedModels.has(n));
    if (candidates.length === 0) {
      // All candidates have been blacklisted — reset and try again
      _failedModels.clear();
      candidates = [...MODEL_CANDIDATES];
    }
    const name  = candidates[0];
    _resolvedModelName = name;
    console.log(`[Gemini] selected model: ${name} (${candidates.length} candidate(s) available)`);
    return { name, model: genAI.getGenerativeModel({ model: name }) };
  })().finally(() => { _probePromise = null; });

  return _probePromise;
}

/** Call this when a model returns 404 / deprecation / empty response.
 *  Adds it to the blacklist and clears the cache so the next call
 *  automatically advances to the next candidate. */
export function invalidateModelCache(modelName?: string) {
  if (modelName ?? _resolvedModelName) {
    _failedModels.add((modelName ?? _resolvedModelName)!);
    console.warn(`[Gemini] blacklisted model: ${modelName ?? _resolvedModelName}`);
  }
  console.warn('[Gemini] clearing model cache — will re-probe on next call');
  _resolvedModelName = null;
}

// ── Types ──────────────────────────────────────────────────────

export type ChartType =
  | 'hbar' | 'bar' | 'line' | 'area'
  | 'pie' | 'doughnut'
  | 'scatter' | 'combo' | 'histogram' | 'radar'
  | 'waterfall' | 'funnel';

export interface GeminiInsightCard {
  title:        string;
  bucket:       'content' | 'commerce' | 'communication' | 'culture';
  type:         ChartType;
  conviction:   number;
  obs:          string;
  stat:         string;
  rec:          string;
  toolLabel:    string;
  chartLabels:  string[];
  chartValues:  number[];
  chartValues2?: number[]; // scatter Y-axis (Index scores)
}

export interface ExecutiveSummary {
  headline:       string;
  objective:      string;
  observations:   string[];
  recommendations: string[];
}

/** One pre-processed slot — exact numbers, no estimates */
export interface DataSlot {
  bucket:          'content' | 'commerce' | 'communication' | 'culture';
  question:        string;
  chartSuggestion: ChartType;
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
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (slots.length === 0) return [];

  const { model } = await getModel(genAI);

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
• type: start with the chartSuggestion from THIS slot — override only if a better type is obvious

CHART TYPE GUIDE (choose the best visual for this insight):
• hbar       → ranked lists, long category names (5–12 items) — default for audience data
• bar        → short-label comparisons (3–8 items, vertical)
• line       → trends over time with 10+ continuous data points
• area       → cumulative volumes or stacked trends over time
• pie        → proportional splits, 2–6 segments only (e.g. Yes/No, sentiment)
• doughnut   → cleaner pie for dashboards (2–6 segments)
• scatter    → two numeric axes — Audience% (X) vs Index multiplier (Y)
• combo      → two metrics on one chart: bar (primary) + line overlay (secondary trend)
• histogram  → how values spread across ranges / frequency distribution
• radar      → compare 3–8 attributes simultaneously for 1–3 items
• waterfall  → how +/− components add up to a total (bridge/waterfall chart)
• funnel     → conversion or dropout flow (Awareness → Consideration → Purchase)

━━ CHART VARIETY — MANDATORY ━━
Across all ${slots.length} cards you MUST use at least 4 DIFFERENT chart types.
NEVER assign the same type to more than 2 consecutive cards.
If your current card would create a third repetition in a row, override with a different type that still fits the data.
Distribution target: use hbar/bar for at most 3 cards total — fill remaining cards with area, doughnut, scatter, radar, funnel, waterfall, or combo wherever data supports it.

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture",
    "type": "hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel",
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
    const result  = await callGeminiWithRetry(model, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    // Empty text = model silently blocked or unavailable → invalidate cache so
    // the next call re-probes for a working model instead of hammering the same one.
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text — model may be blocked or rate-limited');
    }
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('No JSON array in Gemini response — model returned non-JSON output');
    }

    const parsed: any[] = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const validBuckets = ['content','commerce','communication','culture'];
    const validTypes: ChartType[] = [
      'hbar','bar','line','area','pie','doughnut',
      'scatter','combo','histogram','radar','waterfall','funnel',
    ];

    return parsed.slice(0, 8).map(c => ({
      title:        String(c.title || 'Insight'),
      bucket:       (validBuckets.includes(c.bucket) ? c.bucket : 'content') as GeminiInsightCard['bucket'],
      type:         (validTypes.includes(c.type)     ? c.type   : 'hbar')    as ChartType,
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
    console.error('[Gemini] analyzeDataForPRISM failed:', (err as Error).message);
    throw err; // surface real reason to the API route
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
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const { model } = await getModel(genAI);

  // Sample to keep token use bounded. For large datasets we take a stratified
  // sample (head + middle + tail) rather than only the first N rows so we don't
  // miss patterns concentrated in later rows (e.g. sorted-by-date exports).
  const sample = stratifiedSample(rows, 120);
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
Spread your 8 cards evenly — aim for 2 per bucket. NEVER assign more than 4 cards to any single bucket.
• content       — media consumption, streaming, devices, screen time, gaming, podcasts, formats people use (OTT, social feeds, news). For product data: listing quality, titles, A+ content, images.
• commerce      — purchase intent, price sensitivity, BSR/ranking, units sold, revenue, search volume, conversion, discount behaviour, subscription, loyalty, financial attitudes, consumer confidence.
• communication — brand awareness, brand trust, brand image, brand perception, reviews, ratings, ad recall, influencer reach, social mentions, brand discovery, word of mouth, NPS, media channel preference.
• culture       — who the audience is: demographics, lifestyle, values, attitudes, health, fitness, food, travel, fashion, sustainability, community, education, career, identity signals.
IMPORTANT: If the data has price/rank/sales columns → those cards are commerce. If the data has brand/review/rating columns → those cards are communication. Do NOT default everything to content.

━━ CARD FORMAT ━━
TITLE (max 14 words): magazine cover line — surprising finding + one plain-English number, no jargon.
OBSERVATION (3 sentences): hook → exact numbers from the data → strategic so-what for a brand/media team.
STAT: one crisp plain-English number (NOT a templated "+X% Revenue · Multiplier: Y×" string).
RECOMMENDATION: one sentence to a creative director. Name a specific Indian platform (Instagram Reels, YouTube, Hotstar, Amazon, Flipkart, JioCinema, Meesho), a specific format (15-second Reel, search ad, sponsored listing, CTV pre-roll, in-feed video), and a specific creative angle.

━━ UNIQUENESS ━━
Write EXACTLY 8 cards. No two cards may share the same opening sentence, the same stat, or the same recommendation platform+format combo.

━━ CHART DATA ━━
Pick labels + values from the sample rows (up to 8 items). Use actual values.
If a chart doesn't make sense for a card, return chartLabels: [] and chartValues: [].

CHART TYPE GUIDE — pick the most informative and visually striking type:
• hbar       → ranked lists, long labels (5–12 items) — great for top-10 comparisons
• bar        → short-label category comparisons (3–8 items, vertical)
• line       → trends over time with 8+ continuous points
• area       → cumulative volumes, stacked time-series
• pie        → proportional splits, 2–6 segments (sentiment, category share)
• doughnut   → cleaner pie for dashboards (2–6 segments)
• scatter    → correlation between two numeric columns (X vs Y)
• combo      → bar (primary metric) + line overlay (secondary trend) on same axes
• histogram  → frequency distribution, value-range bucketing
• radar      → 3–8 attributes compared simultaneously for 1–3 entities
• waterfall  → how +/− items build to a total (bridge chart, revenue waterfall)
• funnel     → stepwise conversion or dropout (Awareness → Trial → Purchase)

━━ CHART VARIETY — MANDATORY ━━
Across all 8 cards you MUST use at least 5 DIFFERENT chart types.
NEVER assign hbar or bar to more than 3 cards total.
NEVER assign the same type to more than 2 consecutive cards.
Where the data supports it, prefer the richer types: area (for time-series), doughnut (for proportions), funnel (for conversion data), radar (for multi-attribute profiles), waterfall (for component breakdowns), combo (for two-metric comparisons).

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture",
    "type": "hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel",
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
    const result  = await callGeminiWithRetry(model, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text — model may be blocked or rate-limited');
    }
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('No JSON array in Gemini generic response');
    }

    const parsed: any[] = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const validBuckets = ['content','commerce','communication','culture'];
    const validTypes: ChartType[] = [
      'hbar','bar','line','area','pie','doughnut',
      'scatter','combo','histogram','radar','waterfall','funnel',
    ];

    return parsed.slice(0, 8).map(c => ({
      title:        String(c.title || 'Insight'),
      bucket:       (validBuckets.includes(c.bucket) ? c.bucket : 'content') as GeminiInsightCard['bucket'],
      type:         (validTypes.includes(c.type)     ? c.type   : 'hbar')    as ChartType,
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
    console.error('[Gemini] analyzeGenericTabularForPRISM failed:', (err as Error).message);
    throw err;
  }
}

// ── Social Listening / Share of Voice analysis ────────────────

/**
 * Analyses pre-aggregated social listening data (sentiment breakdown,
 * platform distribution, top themes, volume-over-time).
 *
 * Receives rows produced by lib/social/parser.ts — NOT raw posts.
 * Each row has: { dimension, value, count, pct, ... }
 *
 * Returns PRISM insight cards focused on brand perception, platform strategy,
 * content themes, and audience engagement signals.
 */
export async function analyzeSocialListeningForPRISM(
  rows:      any[],
  context:   string,
  toolLabel: string = 'Social Listening',
): Promise<GeminiInsightCard[]> {
  const genAI = await getGenAI();
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const { model } = await getModel(genAI);

  // Separate row types for a clean prompt structure
  const overview        = rows.find(r => r.dimension === '_overview') ?? {};
  const sentimentRows   = rows.filter(r => r.dimension === 'Sentiment');
  const platformRows    = rows.filter(r => r.dimension === 'Platform');
  const crossRows       = rows.filter(r => r.dimension === 'Platform×Sentiment').slice(0, 12);
  const allThemes       = rows.filter(r => r.dimension === 'Top Theme (All)').slice(0, 10);
  const posThemes       = rows.filter(r => r.dimension === 'Top Theme (Positive)').slice(0, 8);
  const negThemes       = rows.filter(r => r.dimension === 'Top Theme (Negative)').slice(0, 8);
  const topPosPosts     = rows.filter(r => r.dimension === 'Top Positive Post').slice(0, 2);
  const topNegPosts     = rows.filter(r => r.dimension === 'Top Negative Post').slice(0, 2);
  const volumeRows      = rows.filter(r => r.dimension === 'Volume Over Time');

  const totalPosts = overview.total_posts ?? rows.reduce((s: number, r: any) =>
    r.dimension === 'Sentiment' ? s + (r.count || 0) : s, 0);

  const sentimentBlock  = sentimentRows.map(r =>
    `  • ${r.value}: ${r.count} posts (${r.pct}% of total)`).join('\n') || '  (no data)';

  const platformBlock   = platformRows.slice(0, 8).map(r =>
    `  • ${r.value}: ${r.count} posts (${r.pct}%)`).join('\n') || '  (no data)';

  const crossBlock      = crossRows.map(r =>
    `  • ${r.value}: ${r.count} posts (${r.pct}%)`).join('\n') || '  (no data)';

  const allThemeBlock   = allThemes.map(r =>
    `  • "${r.value}" — mentioned ${r.count}× across all posts`).join('\n') || '  (no data)';

  const posThemeBlock   = posThemes.map(r =>
    `  • "${r.value}" — ${r.count}× in positive posts`).join('\n') || '  (no data)';

  const negThemeBlock   = negThemes.map(r =>
    `  • "${r.value}" — ${r.count}× in negative posts`).join('\n') || '  (no data)';

  const topPostsBlock   = [...topPosPosts, ...topNegPosts].map(r =>
    `  • [${r.dimension}] @${r.value} (${r.followers?.toLocaleString()} followers): "${(r.message ?? '').slice(0, 120)}..."`
  ).join('\n') || '  (no data)';

  const volumeBlock     = volumeRows.slice(0, 12).map(r =>
    `  • ${r.value}: ${r.count} posts`).join('\n') || '  (no trend data)';

  const prompt = `You are a senior Creative Strategist and Brand Intelligence analyst at PRISM, advising brand managers and media planners in India.

You have received pre-aggregated social listening data for: "${context}"
Total posts analysed: ${totalPosts.toLocaleString()}
Source tool: ${toolLabel}

━━ SENTIMENT BREAKDOWN ━━
${sentimentBlock}

━━ PLATFORM DISTRIBUTION ━━
${platformBlock}

━━ SENTIMENT × PLATFORM CROSS-TAB ━━
${crossBlock}

━━ TOP THEMES ACROSS ALL POSTS ━━
${allThemeBlock}

━━ TOP THEMES IN POSITIVE POSTS ━━
${posThemeBlock}

━━ TOP THEMES IN NEGATIVE POSTS ━━
${negThemeBlock}

━━ TOP POSTS BY REACH ━━
${topPostsBlock}

━━ VOLUME OVER TIME ━━
${volumeBlock}

━━ YOUR TASK ━━
Write 8 PRISM insight cards — 2 per bucket (Content · Commerce · Communication · Culture).

Each card must answer: "So what does this mean for the brand's strategy?"
Use ONLY the numbers and themes above — no invented statistics.

━━ BUCKET ASSIGNMENT FOR SOCIAL DATA ━━
• content       — what formats/platforms drive the most conversation, content themes that resonate
• commerce      — purchase intent signals in messages, product mentions, price/availability chatter
• communication — brand tone, crisis signals, negative theme management, positive amplification
• culture       — who is talking (platform signals), lifestyle themes, identity signals in language

━━ TONE ━━
Write like a smart agency strategist — plain English, short sentences, active voice.
Banned words: over-index, leverage, synergy, touchpoint, holistic, robust, utilize, paradigm, seamless, volatility, momentum, dominance.
Use: people, fans, critics, buyers, conversations, 1 in 3, nearly twice, here's the thing.

━━ CARD FORMAT ━━
TITLE (max 14 words): magazine cover line — surprising finding + one plain-English number.
OBSERVATION (3 sentences): hook → exact numbers from the data above → strategic so-what.
STAT: one crisp plain-English number that summarises the most important finding in this card.
RECOMMENDATION: one sentence to a creative director. Name a specific Indian platform (Instagram, Twitter/X, YouTube, Facebook, Hotstar), a specific format (Reel, Stories response, comment reply, ORM campaign, influencer brief), and a specific creative angle.

━━ CHART DATA ━━
Use actual counts/percentages from the data blocks above.
Guidelines by data type:
• Sentiment breakdown → doughnut (3 segments: Positive, Negative, Neutral)
• Platform distribution → bar or hbar (platform name vs post count)
• Top themes → hbar (word/phrase vs mention count)
• Volume over time → area (month vs count — fill makes the trend pop visually)
• Sentiment × Platform cross-tab → combo (bar=volume, line=positive%)
• If data shows a funnel (e.g. Awareness→Engagement→Purchase intent) → funnel
• Month-on-month swings → waterfall
• Multi-platform attribute comparison → radar

CHART TYPE GUIDE:
• hbar       → ranked word/phrase lists (5–12 items)
• bar        → platform/channel comparisons (3–8 items)
• line       → volume trends over time (10+ months)
• area       → cumulative or stacked volumes — MORE VISUAL than line
• pie        → 2–6 segment proportional splits (use sparingly)
• doughnut   → cleaner than pie for dashboards (sentiment split)
• scatter    → two numeric variables (X vs Y)
• combo      → bar (volume) + line (rate/%) on same axes
• radar      → compare 3–8 brand/platform attributes at once
• waterfall  → month-on-month sentiment change adding to total
• funnel     → conversion or engagement dropoff stages

━━ CHART VARIETY — MANDATORY ━━
Across all 8 cards you MUST use at least 5 DIFFERENT chart types.
NEVER use hbar or bar for more than 3 cards total.
NEVER repeat the same type in consecutive cards.
Sentiment data → doughnut. Volume trends → area. Any conversion/funnel data → funnel. Multi-attribute → radar. Two-metric → combo.

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture",
    "type": "hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel",
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
    const result  = await callGeminiWithRetry(model, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text — model may be blocked or rate-limited');
    }
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match   = cleaned.match(/\[[\s\S]*\]/);
    if (!match) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('No JSON array in social listening Gemini response');
    }

    const parsed: any[] = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const validBuckets = ['content','commerce','communication','culture'];
    const validTypes: ChartType[] = [
      'hbar','bar','line','area','pie','doughnut',
      'scatter','combo','histogram','radar','waterfall','funnel',
    ];

    return parsed.slice(0, 8).map(c => ({
      title:        String(c.title || 'Insight'),
      bucket:       (validBuckets.includes(c.bucket) ? c.bucket : 'communication') as GeminiInsightCard['bucket'],
      type:         (validTypes.includes(c.type)     ? c.type   : 'bar')           as ChartType,
      conviction:   Number(c.conviction) || 85,
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
    console.error('[Gemini] analyzeSocialListeningForPRISM failed:', (err as Error).message);
    throw err;
  }
}

// ── Executive Summary Generation (SMART Framework) ────

/**
 * Generates a SMART-style executive summary from insight cards and raw data.
 * Returns: HEADLINE, OBJECTIVE, OBSERVATIONS, RECOMMENDATIONS.
 * This logic is frozen in Gemini's system prompt to ensure consistent output.
 */
export async function generateExecutiveSummary(
  cards:    GeminiInsightCard[],
  rows:     any[],
  context:  string,
  toolLabel: string,
): Promise<ExecutiveSummary> {
  const genAI = await getGenAI();
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (cards.length === 0) {
    return {
      headline: 'No data available for analysis',
      objective: 'Data analysis in progress',
      observations: [],
      recommendations: [],
    };
  }

  const { model } = await getModel(genAI);

  // Build a summary of the insight cards for context
  const cardSummary = cards.map((c, i) =>
    `Card ${i + 1} [${c.bucket}]: ${c.title} — ${c.obs} (Confidence: ${c.conviction}%)`
  ).join('\n');

  // Sample data rows for reference
  const sample = rows.slice(0, 20);

  const prompt = `You are a senior business strategist and analyst at PRISM, a top consumer intelligence firm in India.

You have just received 8 detailed insight cards from a data analysis. Your job is to synthesize them into ONE executive summary using the SMART framework: Specific, Measurable, Achievable, Relevant, Time-bound.

━━ INSIGHT CARDS (generated from the data) ━━
${cardSummary}

━━ DATA SOURCE ━━
Source: ${context}
Tool: ${toolLabel}
Sample rows (context only):
${JSON.stringify(sample.slice(0, 10), null, 2)}

━━ EXECUTIVE SUMMARY FRAMEWORK (FROZEN LOGIC) ━━

You MUST produce EXACTLY FOUR sections. Do not deviate.

SECTION 1: HEADLINE (SMART-STYLE)
• Output ONE single best headline summarizing the main strategic outcome/insight.
• 8–12 words, catchy and PPT-title ready.
• Must hint at a metric, shift, or business result.
• Examples:
  ✅ "Urban Shoppers Shift 35% Toward Online Convenience"
  ✅ "Gen-Z Audiences Drive 2.5× Growth in Video Engagement"
  ❌ "Insights from our data" (vague)

SECTION 2: OBJECTIVE
• State the main business goal/objective reflected by the data.
• 1–2 sentences, sharp and business-focused.
• If not explicit, infer from the cards' emphasis.
• Example: "Understand where young Indian audiences spend their media time and how to reach them cost-effectively."

SECTION 3: OBSERVATIONS (3–6 items, SMART-leaning)
• Highlight 3–6 key patterns, trends, or anomalies from the cards.
• Each observation:
  - Insight-driven, not a raw restatement of numbers
  - Includes a concrete metric (e.g., +15%, 2x, lower than Q1)
  - Directly connects to the objective
  - Is 1 sentence, clear and direct
• Capture all major spikes, patterns, and critical insights.
• Examples:
  ✅ "Video content consumption among 18–25-year-olds is 3.2× higher than in 2024, driven by Reels and short-form content."
  ✅ "Urban metros account for 68% of online purchases, but rural growth is outpacing urban by 2.1× year-over-year."
  ❌ "Many people like video" (not specific or measurable)

SECTION 4: RECOMMENDATIONS (3–5 items, SMART actions)
• Output 3–5 actionable recommendations directly linked to the observations.
• Each recommendation:
  - What to do + where/how (specific)
  - Include a target or directional goal (e.g., increase by 20%, reduce by 15%)
  - Tied to one or more observations
  - Realistic and implementable
  - Time-bound when possible (within 30 days, next quarter, etc.)
• Examples:
  ✅ "Allocate 40% of video budget to Instagram Reels for 18–25-year-olds; target 2M impressions within 60 days."
  ✅ "Launch rural-focused commerce campaigns on Meesho and Flipkart to capture 20% of rural growth opportunity by Q3."
  ❌ "Optimize content" (too vague)

━━ TONE ━━
Plain English, short sentences, active voice. Write for a CMO or brand director — clear, data-backed, actionable.

━━ OUTPUT FORMAT (JSON ONLY) ━━
Return ONLY a valid JSON object with these four fields. No markdown, no extra text.
{
  "headline": "string (8–12 words)",
  "objective": "string (1–2 sentences)",
  "observations": ["observation 1", "observation 2", "observation 3", ...],
  "recommendations": ["recommendation 1", "recommendation 2", "recommendation 3", ...]
}`;

  try {
    const result = await callGeminiWithRetry(model, prompt);
    const rawText = result.response.text().trim();
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object in executive summary response');

    const parsed: any = JSON.parse(match[0]);
    if (!parsed.headline || !parsed.objective) {
      throw new Error('Missing required fields: headline or objective');
    }

    return {
      headline: String(parsed.headline || ''),
      objective: String(parsed.objective || ''),
      observations: Array.isArray(parsed.observations)
        ? parsed.observations.map((o: any) => String(o || ''))
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map((r: any) => String(r || ''))
        : [],
    };
  } catch (err) {
    console.error('[Gemini] generateExecutiveSummary failed:', (err as Error).message);
    // Return a fallback summary rather than throwing
    return {
      headline: 'Data analysis reveals key consumer insights',
      objective: 'Identify strategic opportunities from consumer behaviour',
      observations: cards.slice(0, 3).map(c => c.obs),
      recommendations: cards.slice(0, 3).map(c => c.rec),
    };
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
    const { model } = await getModel(genAI);
    const prompt = `You are a world-class Brand Strategist and editorial writer crafting insight headlines for senior marketing teams.

Every headline uses these 5 elements:
① MAIN INSIGHT — the sharpest finding (what is really happening)
② CONTEXT      — who/where/when (brand, audience, platform, category, geography)
③ HOOK         — the tension, surprise, or implication that makes a strategist sit up
④ STAT         — one real concrete number from the data (%, ×, YoY, rank, volume)
⑤ HUMANIZE     — a real human behavior, emotion, or decision behind the number

━━━ STEP 1 — READ THE INSIGHT, THEN PICK THE RIGHT PATTERN ━━━
Do NOT rotate patterns randomly. Read each chart's observation and choose the pattern that BEST fits the nature of that insight:

Pattern A — HOOK FIRST → use when: behavior is surprising or counterintuitive
  Structure: "[Surprising behavior] — [Who + What they do], [Stat]"
  Signal words in data: "despite", "instead of", "rather than", "avoiding", "ignoring"
  Example: "Runners Are Googling Their Injuries, Not Their Shoes — 'Overpronation' Up 1,257% YoY"

Pattern B — STAT FIRST → use when: the number itself is the most shocking element
  Structure: "[Stat]: [Why humans do this] — [Brand/Category implication]"
  Signal words in data: a very large %, a multiple (3×, 10×), or a rank that shocks
  Example: "23 Images Per Listing: Advil Shoppers Scroll Until They Trust What They're Buying"

Pattern C — HUMAN FIRST → use when: emotion or fear is the real driver
  Structure: "[Human emotion/behavior] drives [Main insight] — [Stat] [Context]"
  Signal words in data: "fear", "trust", "prefer", "choose", "avoid", "worry"
  Example: "Fear of Buying Wrong Size Pushes Shoppers to Reviews First — 68% Check Before Adding to Cart"

Pattern D — TENSION → use when: data contradicts what brands/industry currently believe or do
  Structure: "[Old assumption] is wrong — [New reality], [Stat] [Who]"
  Signal words in data: gap between brand behavior and consumer behavior, unexpected reversal
  Example: "Brand Loyalty Is Not Why They Buy — 74% of Advil Searches Are Symptom-Led, Not Name-Led"

Pattern E — QUESTION → use when: the finding raises an obvious "but why?" that needs answering
  Structure: "Why [Human behavior]? [Answer] — [Stat] in [Context]"
  Signal words in data: an unexplained pattern, a trend that needs a cause
  Example: "Why Do Shoppers Ignore Generic Titles? Specific SKU Names Drive 3× More Clicks on Amazon"

Pattern F — CONSEQUENCE → use when: the stat signals a trend that demands brand action NOW
  Structure: "[Stat] [Who] now [behavior] — [Brand/Category] must [implication]"
  Signal words in data: rapid growth, first-time behavior, window closing, competitive shift
  Example: "1 in 3 HOKA Shoppers Discovered the Brand This Quarter — Awareness Is the Biggest Growth Lever"

━━━ STEP 2 — WRITE THE HEADLINE ━━━
• Max 18 words
• Always embed the real stat from the observation
• Active voice — people do things, not "there is a trend toward"
• Humanize with real behavior verbs: search, scroll, skip, switch, fear, trust, choose, avoid, discover
• Sound like Bloomberg or The Economist — sharp, specific, confident
• No jargon: ban over-index, leverage, cohort, synergy, touchpoint, utilise, significant, notable

━━━ BAD EXAMPLES ━━━
"Visuals Drive Discovery, Advil Listings Loaded with Detail"  ← no stat, no human behavior, wrong pattern
"Shoppers Expect Product Specifics in Listing Titles"  ← vague, no stat, no hook, no human
"India's Runners Demand Specialized Shoes"  ← too generic, missing stat and humanize

Dataset: ${context}

Charts:
${charts.map((c, i) => `${i + 1}. Type: ${c.type} | Label: "${c.lbl || ''}" | Current: "${c.title}" | Observation: "${c.obs || ''}"`).join('\n')}

For each chart: read the observation carefully, pick the pattern that fits the nature of the insight, then write the headline.
Return ONLY a valid JSON array of strings, one title per chart — no pattern labels, just the headlines.
Example: ["headline 1", "headline 2", "headline 3"]`;

    const result = await callGeminiWithRetry(model, prompt);
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
    const { model } = await getModel(genAI);
    const prompt = `You are a Senior Brand Strategist writing insight cards for marketing teams.

━━━ STEP 1 — READ THE INSIGHT, IDENTIFY ITS NATURE, PICK THE RIGHT PATTERN ━━━
Before writing, decide which pattern best fits this specific insight's data:

Pattern A — HOOK FIRST    → insight has a surprising/counterintuitive behavior
Pattern B — STAT FIRST    → the number itself is the most striking element
Pattern C — HUMAN FIRST   → emotion or fear is the real driver behind the data
Pattern D — TENSION       → data contradicts what the brand/industry currently does
Pattern E — QUESTION      → finding raises an obvious "but why?" that needs answering
Pattern F — CONSEQUENCE   → stat signals a trend demanding brand action NOW

━━━ STEP 2 — WRITE OBSERVATION using the chosen pattern ━━━
All observations MUST include: CONTEXT + STAT + REASON (always)
Add TENSION when: brand/industry behavior contradicts what data shows
Add QUESTION when: finding is counterintuitive enough to demand "why?" or "what now?"

Pattern A obs: "[Surprising behavior that humans do] — [Stat] — [Context why this matters]"
Pattern B obs: "[Stat] — [What this means about human behavior] — [Context/category implication]"
Pattern C obs: "[Human emotion/fear] is driving [behavior] — [Stat] in [Context] — [why this is the real story]"
Pattern D obs: "[What the industry/brand assumes] — but [what data actually shows], [Stat]. [TENSION: gap between assumption and reality]"
Pattern E obs: "Why are [audience] doing [behavior]? [Answer] — [Stat] in [Context]. [What this reveals about human decision-making]"
Pattern F obs: "[Stat] of [audience] now [behavior] in [Context] — [what this signals for the category going forward]"

━━━ STEP 3 — WRITE RECOMMENDATION using the same pattern + 7 elements ━━━
① ACTION  — specific verb + what to do + channel/format         [always]
② CONTEXT — audience + platform + category                      [always]
③ STAT    — exact number justifying the action                  [always]
④ REASON  — human behavior/emotion behind the stat              [always]
⑤ OUTCOME — measurable success metric + timeframe               [always]
⑥ TENSION — contradiction between what brand does vs must do    [when Pattern D or gap exists]
⑦ QUESTION— rhetorical urgency or "if not now, when?"           [when Pattern E or F, or competitive window closing]

Pattern A rec: Lead with the surprising behavior → what brand must do to meet it → stat → outcome
Pattern B rec: Lead with the stat → explain what it means for brand action → specific channel → outcome
Pattern C rec: Lead with the human emotion → what content/message addresses it → stat → outcome
Pattern D rec: Name the tension explicitly → what must change → stat proving why → outcome + timeframe
Pattern E rec: Open with the question → answer it with a specific action → stat proving the answer → outcome
Pattern F rec: State the consequence → urgent specific action → stat proving the window → outcome + timeframe

━━━ BUCKET-SPECIFIC ACTIONS AND METRICS ━━━
📝 CONTENT  → verbs: Produce/Develop/Film/Brief/Publish | metrics: engagement rate, watch time, saves, shares
🛒 COMMERCE → verbs: Rewrite/Bid/A/B test/Optimise/Restructure | metrics: CTR, conversion, ROAS, ranking
📢 COMMUNICATION → verbs: Shift/Reposition/Brief creative/Reallocate/Test copy | metrics: brand recall, message resonance, awareness
🌍 CULTURE  → verbs: Partner/Tap into/Align/Sponsor/Build community | metrics: brand affinity, earned media, community growth

━━━ EXAMPLES ━━━
Pattern D (TENSION) for COMMERCE:
Obs: "Advil shoppers search 'sinus relief' and 'fever reducer' before they search the brand name — 74% of purchase-intent queries are symptom-led. Yet Advil's top listings lead with the brand name, not the symptom. The copy is solving the wrong problem."
Rec: "Rewrite Advil's top 5 Amazon listing titles to lead with symptom terms ('Sinus', 'Fever', 'Headache') for shoppers in active problem-solving mode — 74% search by symptom not brand, because they are treating a condition not buying a product. Current titles fight the wrong battle. Target 20% CTR lift within 30 days."

Pattern F (CONSEQUENCE) for CULTURE:
Obs: "1 in 3 HOKA buyers discovered the brand for the first time this quarter — awareness, not loyalty, is driving volume. This is a discovery window that closes fast once competitors move."
Rec: "Build a 'just discovered you' welcome campaign for HOKA targeting first-time buyers across Instagram and YouTube — 33% of buyers are brand-new this quarter, because the running category is expanding beyond core athletes. If HOKA doesn't convert discovery into loyalty now, a more established brand will. Target 15% repeat purchase rate within 90 days."

━━━ UNIVERSAL RULES ━━━
• STAT and CONTEXT are non-negotiable — every sentence needs both
• TENSION: only when data genuinely contradicts brand/industry behavior
• QUESTION: only when insight is striking enough to demand "why?" or "what now?"
• No jargon: ban leverage, synergy, touchpoint, utilise, holistic, robust, significant
• Observation: 2–3 sentences. Recommendation: 2–3 sentences.
• Sharp, direct — write like a strategist briefing a CMO, not writing a report

Dataset: ${context}

Charts:
${charts.map((c, i) => `${i + 1}. Bucket: ${(c.bucket || 'content').toUpperCase()} | Title: "${c.title}" | Obs: "${c.obs || 'N/A'}" | Rec: "${c.rec || 'N/A'}"`).join('\n')}

For each chart: read the data, pick the pattern that fits, then write obs and rec using that pattern.
Return ONLY a valid JSON array, one object per chart:
[{"obs": "2-3 sentences — pattern-matched, stat + context + reason + tension/question when warranted", "rec": "2-3 sentences — action + context + stat + reason + outcome + timeframe + tension/question when warranted", "stat": "one punchy highlight stat (e.g. '1,257% YoY' or '3× category norm')"}, ...]`;

    const result = await callGeminiWithRetry(model, prompt);
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
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (!text.trim()) return [];

  const { model } = await getModel(genAI);

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
    const result  = await callGeminiWithRetry(model, prompt);
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
    console.error('[Gemini] analyzeTextForPRISM failed:', (err as Error).message);
    throw err;
  }
}
