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

const VALID_BUCKETS = ['content', 'commerce', 'communication', 'culture'] as const;
const VALID_TYPES   = ['hbar','bar','line','area','pie','doughnut',
                       'scatter','combo','histogram','radar','waterfall','funnel'] as const;

// ── Build the slot block (same text format as Gemini) ────────────
function buildSlotBlock(slots: DataSlot[]): string {
  return slots.map((slot, i) => {
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
}

// ── Full PRISM prompt (mirrors gemini.ts) ────────────────────────
function buildPrompt(slots: DataSlot[], context: string): string {
  const slotBlock = buildSlotBlock(slots);
  return `You are a brilliant Creative Strategist and Media Planner at PRISM, a top consumer intelligence firm in India.
Your readers are brand managers and media planners who want clear, honest, human stories from consumer data — not jargon-heavy reports.

DATASET: ${context}

${slotBlock}

━━ ONE CARD PER SLOT — UNIQUENESS RULE ━━
You have ${slots.length} slots above. Write EXACTLY ${slots.length} cards — one card per slot, in order.
Card 1 → SLOT 1 only. Card 2 → SLOT 2 only. Card 3 → SLOT 3 only. And so on.
Do NOT mix findings from different slots into a single card.
Do NOT repeat the same finding, stat, or sentence across any two cards.

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

OBSERVATION — 3 sentences, precise and grounded in this slot's data only:
• Sentence 1: Start with a punchy surprising fact drawn directly from the highest-index item in THIS slot.
• Sentence 2: Give the exact numbers in plain English — reference the specific attributes, percentages, and multipliers from THIS slot.
• Sentence 3: State the strategic so-what for a brand or media team in one clear, direct sentence.

STAT — one crisp number that would make a room go quiet. Derived strictly from THIS slot's data.
✅ "Nearly 2 in 3 Indian households in this group prefer local stores over big chains"

RECOMMENDATION — one sentence written as a direct brief to a creative director or media buyer.
Name a specific Indian platform or channel (YouTube, Instagram Reels, Hotstar, JioCinema, Meesho, Flipkart, etc.)
Name a specific format (6-second bumper, 15-second Reel, CTV pre-roll, in-feed video, search ad, etc.)
Name a specific creative angle (real Indian homes, confident buyers, family moments, aspiration, utility).
✅ "Run 15-second Instagram Reels and YouTube pre-rolls showing real Indian families making confident purchases."

━━ CHART DATA ━━
• chartLabels: use the exact attribute names from THIS slot (up to 8)
• chartValues: use exact Audience % values from THIS slot
• For scatter: chartValues = Audience % (X axis), chartValues2 = Index scores converted to multipliers (Y axis)
• type: start with the chartSuggestion from THIS slot — override only if a better type is obvious

━━ CHART VARIETY — MANDATORY ━━
Across all ${slots.length} cards you MUST use at least 4 DIFFERENT chart types.
NEVER assign the same type to more than 2 consecutive cards.

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string",
    "bucket": "content|commerce|communication|culture",
    "type": "hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel",
    "conviction": 85,
    "obs": "string",
    "stat": "string",
    "rec": "string",
    "chartLabels": ["label1","label2"],
    "chartValues": [42.5, 38.1],
    "chartValues2": [1.97, 1.54]
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
  slots:     DataSlot[],
  context:   string,
  toolLabel: string,
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
    const prompt = buildPrompt(batch, context);
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
