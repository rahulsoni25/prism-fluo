/**
 * OpenRouter fallback analyser for PRISM
 *
 * OpenRouter exposes an OpenAI-compatible chat-completions API and gives access
 * to many free models. We use it when all Gemini models are unavailable.
 *
 * Environment variable required:  OPENROUTER_API_KEY
 * (add via Vercel dashboard → Settings → Environment Variables)
 *
 * Model cascade — verified live on OpenRouter (May 2026):
 *   1. openai/gpt-oss-120b:free                — OpenAI OSS 120B, best quality
 *   2. nousresearch/hermes-3-llama-3.1-405b:free — Hermes 3 405B
 *   3. meta-llama/llama-3.3-70b-instruct:free  — Llama 3.3 70B
 *   4. google/gemma-4-31b-it:free              — Gemma 4 31B
 *   5. nvidia/nemotron-3-super-120b-a12b:free  — NVIDIA 120B
 *   6. openai/gpt-oss-20b:free                 — lighter fallback
 *   7. meta-llama/llama-3.2-3b-instruct:free   — last resort
 */

import type { DataSlot, GeminiInsightCard } from './gemini';

const OPENROUTER_URL  = 'https://openrouter.ai/api/v1/chat/completions';
const SITE_URL        = 'https://prism-fluo.vercel.app';
const SITE_NAME       = 'PRISM';

// Models tried in order. All verified free on OpenRouter (May 2026).
const MODEL_CANDIDATES = [
  'openai/gpt-oss-120b:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.2-3b-instruct:free',
];

const VALID_BUCKETS = ['content', 'commerce', 'communication', 'culture', 'channel', 'media', 'creative', 'pricing', 'search'] as const;
const VALID_TYPES   = ['hbar','bar','line','area','pie','doughnut',
                       'scatter','combo','histogram','radar','waterfall','funnel'] as const;

// ── Build the slot block (same text format as Gemini) ────────────
function buildSlotBlock(slots: DataSlot[]): string {
  return slots.map((slot, i) => {
    const rowLines = slot.rows.map(r =>
      `    • ${r.attr}: ${r.audiencePct.toFixed(1)}% audience` +
      ` | ${(r.index / 100).toFixed(2)}× national avg` +
      (r.universe > 0 ? ` | ~${(r.universe / 1e6).toFixed(1)}M people in India` : ''),
    ).join('\n');

    // Explicit NUMBER BANK — the only numbers permitted in the card for this slot
    const bankLines = slot.rows.map(r => {
      const parts = [`${r.audiencePct.toFixed(1)}%`, `${(r.index / 100).toFixed(2)}×`];
      if (r.universe > 0) parts.push(`~${(r.universe / 1e6).toFixed(1)}M`);
      return `  ${r.attr}: ${parts.join(' | ')}`;
    }).join('\n');

    return `
SLOT ${i + 1} | PRISM Bucket: ${slot.bucket.toUpperCase()} | Topic: ${slot.question}
Suggested chart: ${slot.chartSuggestion}
DATA ROWS (sorted by signal strength):
${rowLines}
PERMITTED NUMBERS for this card — use only these (or plain-English translations). Any number not listed here is forbidden:
${bankLines}`;
  }).join('\n');
}

// ── Full PRISM prompt (mirrors gemini.ts) ────────────────────────
function buildPrompt(slots: DataSlot[], context: string, briefContext: string = ''): string {
  const slotBlock = buildSlotBlock(slots);
  const briefBlock = briefContext ? `
━━ CLIENT BRIEF — READ THIS BEFORE WRITING ANY CARD ━━
These insights are being created for a specific brief. Every card you write MUST be directly relevant to this brand's objective.
Do NOT produce generic audience observations — write insights a strategist for THIS brand can act on immediately.
${briefContext}
RELEVANCE RULE: Frame every observation, stat, and recommendation through this brief's specific objective and target audience. Skip data signals that have no bearing on this brand or campaign. If a slot's data is only weakly relevant, still connect it explicitly to the brand's challenge.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';
  return `You are a brilliant Creative Strategist and Media Planner at PRISM, a top consumer intelligence firm in India.
Your readers are brand managers and media planners who want clear, honest, human stories from consumer data — not jargon-heavy reports.
${briefBlock}
DATASET: ${context}

${slotBlock}

━━ ONE CARD PER SLOT — UNIQUENESS RULE ━━
You have ${slots.length} slots above. Write EXACTLY ${slots.length} cards — one card per slot, in order.
Card 1 → SLOT 1 only. Card 2 → SLOT 2 only. Card 3 → SLOT 3 only. And so on.
Do NOT mix findings from different slots into a single card.
Do NOT repeat the same finding, stat, or sentence across any two cards.

━━ ANTI-HALLUCINATION RULE — READ THIS FIRST ━━
Every single number, percentage, or statistic you write MUST come verbatim from the slot's DATA rows above.
Do NOT invent, guess, combine, or extrapolate any value not present in the slot.
Plain-English translation is allowed: "1.83×" → "nearly twice"; "62.0%" → "about 3 in 5".
⚠️  The ✅ example sentences below contain FORMAT TEMPLATES only.
    Do NOT copy any number from those examples into your output.
    Every number you write must be traceable to a specific row in the slot's PERMITTED NUMBERS list — if you cannot point to it, do not write it.

━━ TONE ━━
Write like a brilliant colleague explaining a finding over coffee — not a consultant writing a deck.
• A 16-year-old and a CMO should both find every card interesting and easy to read
• Short sentences. Active voice. Plain English.
• Banned words: over-index, leverage, cohort, synergy, touchpoint, whitespace, holistic, robust, utilize, paradigm, seamless
• Use: people, families, buyers, young Indians, 1 in 3, nearly twice, here is the thing, think about this

━━ CARD FORMAT — follow exactly ━━

TITLE (max 12 words — strictly enforced):
Newspaper headline or magazine cover line. State the key finding with one number AND signal what it means — be directional.
✅ "1 in 3 Research on Instagram Before Buying — Close the Social-to-DTC Gap"
✅ "Full-Price Buyers Are Nearly Twice as Common Here — A Premium Positioning Signal"
✅ "Short-Form Video Drives 4× Higher Engagement — Shift Budget Now"
❌ "Consumers Over-Index on Full Price vs Sale Purchase Behaviour" (jargon, no direction)
❌ "29% of This Audience Are Using Social Media Less" (pure data, no signal)
NEVER: "This Audience", "— Worth Planning Around", "— Worth Building Into the Brief", "— Worth Watching", "— Brands Need to Act", "Key Insight:".

OBSERVATION — 2 to 3 rich sentences. Use numbers from THIS slot's PERMITTED NUMBERS only.
• Sentence 1 (hook): Lead with the top-ranked attribute from the slot and its audience% in plain English. Active voice.
  FORMAT: "About [X] in [Y] of this audience [top behaviour from slot] — [N]× the national rate."
• Sentence 2 (depth): Name the 2nd and 3rd ranked attributes from the slot with their percentages — show the full breakdown.
  FORMAT: "[2nd attr] accounts for [its audiencePct]% while [3rd attr] adds [its audiencePct]%."
• Sentence 3 (so-what): What does this mean for the brand? No new numbers — just the implication.
RULE: Every number must be in the PERMITTED NUMBERS list for this slot. Do NOT invent trends, YoY growth, engagement ratios, or comparisons unless they appear in the slot data.

STAT — one line from THIS slot's data. The sentence a strategist would screenshot.
FORMAT: "[plain-English fraction] [top behaviour from slot] — [N]× more common here than the national average"
❌ "Index 168 · Full Price behaviour" (raw index number — never write this)
❌ "21.8% of this audience (1.3× the national average)" (bracket-heavy, not memorable)
Max 18 words. No brackets. No bullet points. No "Index" numbers. One crisp, memorable sentence only.

RECOMMENDATION — 2 to 3 sentences. Direct brief to a creative director or media buyer.
Sentence 1: Name the specific platform, format, and budget shift or action.
Sentence 2: Give the creative brief — what the content should show. Name a specific campaign concept, series title, or hashtag.
Sentence 3 (optional): An implementation detail — rollout geography, cadence, targeting parameter.
Must include in Sentence 1: ① a specific Indian platform, ② a specific format, ③ a concrete action (shift X% of budget / launch / build).
✅ "Shift 65–70% of content budget to Instagram Reels and YouTube Shorts with weekly cadence. Build a recurring content series — a 'Training Ground' format featuring India-based fitness creators showing authentic workout moments, not polished aspirational imagery. Prioritise vertical video to reduce repurposing friction."
✅ "Significantly increase Amazon Ads investment with a keyword-first strategy targeting the top 10 search terms. Build A+ content for top-selling SKUs with lifestyle imagery, and launch an exclusive India bundle to maximise platform discovery. Close the ad presence gap vs. the category leader before the next peak season."
❌ "Consider digital advertising on social platforms to reach this audience" (too vague — not a brief)

━━ CHART DATA ━━
• chartLabels: use the exact attribute names from THIS slot (up to 8)
• chartValues: use exact Audience % values from THIS slot
• For scatter: chartValues = Audience % (X axis), chartValues2 = Index scores converted to multipliers (Y axis)
• COMPARISON CHARTS — MANDATORY RULE:
  Whenever your insight compares two brands, two groups, or this audience vs a baseline
  (e.g. "Nike vs Adidas", "Brand vs Category Average", "This Audience vs National Average"):
  ① Set type to "bar" or "hbar"
  ② chartValues   = values for the FIRST brand/group
  ③ chartValues2  = values for the SECOND brand/group — NEVER leave empty
  ④ chartSeries   = ["Brand A Name", "Brand B Name"] — use the actual names
  If you mention a comparison in your title or obs, you MUST fill chartValues2 and chartSeries.
• type: start with the chartSuggestion from THIS slot — override only if a better type is obvious

━━ CHART VARIETY — MANDATORY ━━
Across all ${slots.length} cards you MUST use at least 4 DIFFERENT chart types.
NEVER assign the same type to more than 2 consecutive cards.

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture|channel|media|creative|pricing|search",
    "type": "hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel",
    "conviction": 85,
    "obs": "string",
    "stat": "string",
    "rec": "string",
    "chartTitle": "ALL CAPS DESCRIPTION OF WHAT THIS CHART SHOWS",
    "chartLabels": ["label1","label2"],
    "chartValues": [42.5, 38.1],
    "chartValues2": [1.97, 1.54],
    "chartSeries": ["Series 1 Name", "Series 2 Name"]
  }
]`;
}

// ── Parse raw text → validated GeminiInsightCard[] ───────────────
function parseCards(text: string, toolLabel: string): GeminiInsightCard[] {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const match   = cleaned.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No JSON array found in OpenRouter response');

  const parsed: any[] = JSON.parse(match[0]);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array returned');

  return parsed.map(c => ({
    title:        String(c.title   || 'Insight'),
    bucket:       (VALID_BUCKETS.includes(c.bucket) ? c.bucket : 'content') as GeminiInsightCard['bucket'],
    type:         (VALID_TYPES.includes(c.type)     ? c.type   : 'hbar')    as GeminiInsightCard['type'],
    conviction:   82,   // Honest tier: lower than Gemini (88–90), higher than auto-analysis (70)
    obs:          String(c.obs  || ''),
    stat:         String(c.stat || ''),
    rec:          String(c.rec  || ''),
    toolLabel:    `${toolLabel} · OpenRouter`,
    chartLabels:  Array.isArray(c.chartLabels)  ? c.chartLabels.map(String)  : [],
    chartValues:  Array.isArray(c.chartValues)  ? c.chartValues.map(Number)  : [],
    chartValues2: Array.isArray(c.chartValues2) ? c.chartValues2.map(Number) : undefined,
    chartTitle:   c.chartTitle  ? String(c.chartTitle)  : undefined,
    chartSeries:  Array.isArray(c.chartSeries)  ? c.chartSeries.map(String)  : undefined,
  }));
}

// ── Main export ───────────────────────────────────────────────────
/**
 * Analyse DataSlots using OpenRouter's model cascade.
 * Mirrors the Gemini analyzeDataForPRISM signature so callers can swap.
 *
 * Batches slots into groups of 8 and runs them sequentially (not in parallel)
 * to stay within free-tier rate limits.  Returns all cards merged.
 */
export async function analyzeWithOpenRouter(
  slots:        DataSlot[],
  context:      string,
  toolLabel:    string,
  briefContext: string = '',
): Promise<GeminiInsightCard[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  // Batch into groups of 8 — keeps prompts within free-tier context limits
  const BATCH_SIZE = 8;
  const batches: DataSlot[][] = [];
  for (let i = 0; i < slots.length; i += BATCH_SIZE) {
    batches.push(slots.slice(i, i + BATCH_SIZE));
  }

  const allCards: GeminiInsightCard[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch  = batches[batchIdx];
    const prompt = buildPrompt(batch, context, briefContext);
    let   batchSucceeded = false;

    for (const model of MODEL_CANDIDATES) {
      try {
        const res = await fetch(OPENROUTER_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type':  'application/json',
            'HTTP-Referer':  SITE_URL,
            'X-Title':       SITE_NAME,
          },
          body: JSON.stringify({
            model,
            messages:    [{ role: 'user', content: prompt }],
            temperature: 0.65,
            max_tokens:  3500,
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.warn(`[OpenRouter] ${model} HTTP ${res.status}: ${errText.slice(0, 200)}`);
          continue;   // try next model
        }

        const data = await res.json();
        const text = (data?.choices?.[0]?.message?.content ?? '').trim();
        if (!text) {
          console.warn(`[OpenRouter] ${model} returned empty content`);
          continue;
        }

        const cards = parseCards(text, toolLabel);
        console.log(`[OpenRouter] batch ${batchIdx + 1}/${batches.length} — ${model} → ${cards.length} cards`);
        allCards.push(...cards);
        batchSucceeded = true;
        break;  // don't try other models for this batch

      } catch (err: any) {
        console.warn(`[OpenRouter] ${model} threw: ${err.message}`);
        // try next model
      }
    }

    if (!batchSucceeded) {
      console.warn(`[OpenRouter] batch ${batchIdx + 1}/${batches.length} — all models failed, skipping`);
    }
  }

  if (allCards.length === 0) throw new Error('All OpenRouter models failed for all batches');
  return allCards;
}

// ── Simple text helper for non-slot routes ────────────────────────────────────
/**
 * Single OpenRouter call that returns raw text — used by gemini/basic,
 * gemini/deep, trends/insights, and copilot routes.
 *
 * Model cascade — verified live on OpenRouter (May 2026):
 *   1. openai/gpt-oss-120b:free               — OpenAI OSS 120B, best quality
 *   2. nousresearch/hermes-3-llama-3.1-405b:free
 *   3. meta-llama/llama-3.3-70b-instruct:free
 *   4. google/gemma-4-31b-it:free
 *   5. nvidia/nemotron-3-super-120b-a12b:free
 *   6. openai/gpt-oss-20b:free
 *   7. meta-llama/llama-3.2-3b-instruct:free  — last resort
 */
const TEXT_MODELS = [
  'openai/gpt-oss-120b:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-20b:free',
  'meta-llama/llama-3.2-3b-instruct:free',
];

export async function callOpenRouterText(
  prompt:    string,
  maxTokens: number = 2000,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const failures: string[] = [];

  for (const model of TEXT_MODELS) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type':  'application/json',
          'HTTP-Referer':  SITE_URL,
          'X-Title':       SITE_NAME,
        },
        body: JSON.stringify({
          model,
          messages:    [{ role: 'user', content: prompt }],
          temperature: 0.65,
          max_tokens:  maxTokens,
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const reason = `HTTP ${res.status}: ${errText.slice(0, 120)}`;
        console.warn(`[OpenRouter] ${model} — ${reason}`);
        failures.push(`${model}: ${reason}`);
        continue;
      }

      const data = await res.json();
      const text = (data?.choices?.[0]?.message?.content ?? '').trim();
      if (!text) {
        console.warn(`[OpenRouter] ${model} — empty content`);
        failures.push(`${model}: empty response`);
        continue;
      }

      console.log(`[OpenRouter] ${model} — OK`);
      return text;

    } catch (err: any) {
      console.warn(`[OpenRouter] ${model} threw: ${err.message}`);
      failures.push(`${model}: ${err.message}`);
    }
  }

  throw new Error(`All OpenRouter models failed:\n${failures.join('\n')}`);
}

// ── Generic tabular fallback (no slot structure) ──────────────────────────────
/**
 * Mirror of analyzeGenericTabularForPRISM — but calls OpenRouter instead of Gemini.
 * Uses the same stratified sample + creative/media-pro prompt.
 * Called when Gemini fails on Amazon/Helium10/keyword/sales/marketing uploads.
 */

function stratifiedSampleRows(rows: any[], n: number): any[] {
  if (rows.length <= n) return rows.slice();
  const out: any[] = [];
  const step = (rows.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(rows[Math.round(i * step)]);
  return out;
}

export async function analyzeGenericWithOpenRouter(
  rows:         any[],
  context:      string,
  toolLabel:    string,
  briefContext: string = '',
): Promise<GeminiInsightCard[]> {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const sample  = stratifiedSampleRows(rows, 120);
  const columns = Object.keys(sample[0] ?? {});
  const compact = sample.map(r => {
    const o: Record<string, any> = {};
    for (const k of columns) {
      const v = r[k];
      o[k] = typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '…' : v;
    }
    return o;
  });

  const genericBriefBlock = briefContext ? `
━━ CLIENT BRIEF — READ BEFORE WRITING ANY CARD ━━
These insights are being created for a specific brief. Every card MUST be directly relevant to this brand's objective.
Do NOT produce generic data observations — write insights a strategist for THIS brand can act on immediately.
${briefContext}
RELEVANCE RULE: Frame every observation, stat, and recommendation through this brief's specific objective and target audience. Skip data signals that have no bearing on this brand or campaign.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const prompt = `You are a senior Creative Strategist at PRISM, a consumer-intelligence firm advising brand managers and media planners in India.
${genericBriefBlock}

You will receive a tabular dataset. Your job is to read the columns and rows, infer what this data is about, and write 8 PRISM insight cards — 2 per bucket (Content · Commerce · Communication · Culture).

━━ DATASET ━━
Source: ${context}
Columns: ${columns.join(', ')}
Sample rows (up to 60):
${JSON.stringify(compact.slice(0, 60), null, 2)}

━━ AUDIENCE & TONE ━━
Write for creative and media professionals. Plain English, short sentences, active voice.
NEVER use: tailspin, momentum, volatility, breakout, multiplier, dominance, market moat, over-index, leverage, cohort, synergy, touchpoint, holistic, robust, utilize, paradigm, seamless.
Use: people, shoppers, viewers, audiences, families, 1 in 3, nearly twice.

━━ ANTI-HALLUCINATION ━━
Every number MUST come from the sample rows above. No invented statistics.

━━ BUCKET ASSIGNMENT ━━
Spread your 8 cards across the most relevant buckets from the 9 below. NEVER put more than 3 cards in one bucket.
• content       — media consumption, streaming, devices, screen time, gaming, content formats, listing quality, titles, A+ content.
• commerce      — purchase intent, price, BSR/ranking, units sold, revenue, conversion, discount, subscription, consumer confidence, financial attitudes.
• communication — brand awareness, brand trust, brand perception, reviews, ratings, ad recall, influencer reach, NPS, word of mouth, social mentions.
• culture       — demographics, lifestyle, attitudes, values, health, fitness, food, travel, fashion, sustainability, community, education, identity.
• channel       — marketing channel mix (paid/owned/earned), channel ROI, attribution, media allocation, channel reach and frequency.
• media         — media planning, media spend, ad placements, media mix modelling, platform-level media performance.
• creative      — creative asset performance, ad creative testing, copy performance, visual identity, A/B test results.
• pricing       — price elasticity, price point, premium vs value positioning, pricing perception, willingness to pay.
• search        — keyword research, search volume, organic/paid search, SEO rankings, search intent, keyword gaps.
RULE: price/rank/sales data → commerce or pricing. brand/review/rating → communication. keyword/SEO → search. channel attribution → channel. creative testing → creative. Do NOT default everything to content.

━━ CARD FORMAT ━━
TITLE (max 14 words): magazine cover line — surprising finding + one plain-English number.
OBSERVATION (3 sentences): hook → exact numbers from the data → strategic so-what.
STAT: one crisp plain-English number that would make a room go quiet.
RECOMMENDATION: one sentence to a creative director — name a specific Indian platform (YouTube, Instagram Reels, Hotstar, Flipkart, JioCinema, Meesho, Amazon), a specific format (15-second Reel, CTV pre-roll, search ad, sponsored listing, in-feed video), and a specific creative angle.

━━ UNIQUENESS ━━
Write EXACTLY 8 cards. No two cards share the same opening sentence, stat, or platform+format combo.

━━ CHART DATA ━━
Pick labels + values from the sample rows (up to 8 items). Use actual values from the data.
If chart data doesn't make sense for a card: return chartLabels: [] and chartValues: [].

━━ CHART VARIETY — MANDATORY ━━
Use at least 5 DIFFERENT chart types across 8 cards. Never hbar or bar for more than 3 cards.
Never assign the same chart type to consecutive cards.

Return ONLY valid JSON — no markdown, no fences, no explanation:
[{"title":"string","bucket":"content|commerce|communication|culture|channel|media|creative|pricing|search","type":"hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel","conviction":82,"obs":"string","stat":"string","rec":"string","chartLabels":[],"chartValues":[],"chartValues2":[]}]`;

  const text = await callOpenRouterText(prompt, 4000);
  return parseCards(text, toolLabel);
}

// ── Social listening fallback ─────────────────────────────────────────────────
/**
 * Mirror of analyzeSocialListeningForPRISM — but calls OpenRouter instead of Gemini.
 * Receives the same pre-aggregated rows from lib/social/parser.ts.
 * Called when Gemini fails on social/sentiment/brandwatch uploads.
 */
export async function analyzeSocialWithOpenRouter(
  rows:         any[],
  context:      string,
  toolLabel:    string = 'Social Listening',
  briefContext: string = '',
): Promise<GeminiInsightCard[]> {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Build same data blocks as the Gemini social prompt
  const overview      = rows.find((r: any) => r.dimension === '_overview') ?? {};
  const sentimentRows = rows.filter((r: any) => r.dimension === 'Sentiment');
  const platformRows  = rows.filter((r: any) => r.dimension === 'Platform');
  const crossRows     = rows.filter((r: any) => r.dimension === 'Platform×Sentiment').slice(0, 12);
  const allThemes     = rows.filter((r: any) => r.dimension === 'Top Theme (All)').slice(0, 10);
  const posThemes     = rows.filter((r: any) => r.dimension === 'Top Theme (Positive)').slice(0, 8);
  const negThemes     = rows.filter((r: any) => r.dimension === 'Top Theme (Negative)').slice(0, 8);
  const volumeRows    = rows.filter((r: any) => r.dimension === 'Volume Over Time');
  const totalPosts    = overview.total_posts ?? sentimentRows.reduce((s: number, r: any) => s + (r.count || 0), 0);

  const sentimentBlock = sentimentRows.map((r: any) => `  • ${r.value}: ${r.count} posts (${r.pct}%)`).join('\n') || '  (no data)';
  const platformBlock  = platformRows.slice(0, 8).map((r: any) => `  • ${r.value}: ${r.count} posts (${r.pct}%)`).join('\n') || '  (no data)';
  const crossBlock     = crossRows.map((r: any) => `  • ${r.value}: ${r.count} posts (${r.pct}%)`).join('\n') || '  (no data)';
  const allThemeBlock  = allThemes.map((r: any) => `  • "${r.value}" — ${r.count}× across all posts`).join('\n') || '  (no data)';
  const posThemeBlock  = posThemes.map((r: any) => `  • "${r.value}" — ${r.count}× in positive posts`).join('\n') || '  (no data)';
  const negThemeBlock  = negThemes.map((r: any) => `  • "${r.value}" — ${r.count}× in negative posts`).join('\n') || '  (no data)';
  const volumeBlock    = volumeRows.slice(0, 12).map((r: any) => `  • ${r.value}: ${r.count} posts`).join('\n') || '  (no trend data)';

  const socialBriefBlock = briefContext ? `
━━ CLIENT BRIEF — READ BEFORE WRITING ANY CARD ━━
These social insights are for a specific brand brief. Every card MUST be directly relevant.
Do NOT write generic social media observations — write insights this brand's team can act on today.
${briefContext}
RELEVANCE RULE: Frame every insight through this brief's specific objective and brand challenge.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const prompt = `You are a Creative Strategist and Brand Intelligence analyst at PRISM, advising brand managers and media planners in India.
${socialBriefBlock}
Social listening data for: "${context}"
Total posts analysed: ${totalPosts.toLocaleString()}
Source: ${toolLabel}

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

━━ VOLUME OVER TIME ━━
${volumeBlock}

Write 8 PRISM insight cards spread across the most relevant buckets.
Use ONLY the numbers and themes above — no invented statistics.

BUCKET ASSIGNMENT FOR SOCIAL DATA (use up to 3 cards per bucket):
• content       — formats/platforms driving conversation, content themes that resonate
• commerce      — purchase intent signals, product mentions, price/availability chatter
• communication — brand tone, crisis signals, negative theme management, positive amplification
• culture       — who is talking, lifestyle themes, identity in language
• channel       — which channels generate most conversation, cross-channel sentiment
• media         — media mentions, earned media signals, media coverage themes
• creative      — messaging that resonates or falls flat, creative angles in conversation
• pricing       — price chatter, value perception signals, discount/deal mentions
• search        — top search terms mentioned, keyword themes in organic conversation

TONE: Plain English, short sentences, active voice.
Banned: over-index, leverage, synergy, touchpoint, holistic, robust, utilize, paradigm, seamless, volatility, momentum, dominance.

TITLE (max 14 words): magazine cover line — surprising finding + one plain-English number.
OBSERVATION (3 sentences): hook → exact numbers → strategic so-what.
STAT: one crisp plain-English number.
RECOMMENDATION: one sentence — specific Indian platform, specific format, specific creative angle.

━━ CHART VARIETY — MANDATORY ━━
Across all 8 cards use at least 5 DIFFERENT chart types.
Never hbar or bar for more than 3 cards. Never same type in consecutive cards.
Sentiment → doughnut. Volume trends → area. Conversion → funnel. Multi-attribute → radar.

Return ONLY valid JSON — no markdown, no fences:
[{"title":"string","bucket":"content|commerce|communication|culture|channel|media|creative|pricing|search","type":"hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel","conviction":82,"obs":"string","stat":"string","rec":"string","chartLabels":[],"chartValues":[],"chartValues2":[]}]`;

  const text = await callOpenRouterText(prompt, 4000);
  return parseCards(text, toolLabel);
}
