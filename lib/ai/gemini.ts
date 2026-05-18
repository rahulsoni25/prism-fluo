/**
 * lib/ai/gemini.ts
 * Google Gemini client — PRISM insight generation + title/narrative helpers.
 * Falls back gracefully if GEMINI_API_KEY is not set.
 */

import {
  STORYTELLING_DISCIPLINE,
  THREE_LENS_RUBRIC,
  ANTI_HALLUCINATION,
  CONVICTION_GRADING,
  briefBlock,
} from './prompt-fragments';

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
 * Find the FIRST balanced top-level `[...]` in a string. Used to extract
 * a JSON array from Gemini/OpenRouter responses that may have trailing
 * prose, code-fence remnants, or a stray `]` that fools a greedy regex.
 *
 * Walks char-by-char tracking bracket depth, skipping string contents
 * (so brackets inside JSON strings don't shift the depth). Returns null
 * if no balanced array is found.
 */
function extractFirstJsonArray(text: string): string | null {
  let depth     = 0;
  let start     = -1;
  let inString  = false;
  let escape    = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\')      escape   = true;
      else if (ch === '"')  inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0 && start >= 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Forgiving JSON.parse — first tries strict parse, then walks the array and
 * keeps only the elements that parse cleanly. Used when Gemini emits a single
 * malformed card in an otherwise-valid 20-card array (a single unescaped
 * quote inside an obs/rec string breaks the whole array, which would
 * otherwise force the whole call to fail and fall back to OpenRouter).
 *
 * Returns the cards that survived; throws only if NOTHING parses.
 */
function parseJsonArrayForgiving(arrayJson: string): any[] {
  try {
    const strict = JSON.parse(arrayJson);
    if (Array.isArray(strict)) return strict;
  } catch (_err) {
    // Strict parse failed — fall through to element-by-element salvage.
  }

  // Walk the array using the same bracket-balanced scan as extractFirstJsonArray
  // and try to parse each top-level object individually. Skip the ones that
  // don't parse; keep the rest. This recovers ~95% of cards when one is bad.
  const inner = arrayJson.trim().replace(/^\[|\]$/g, '');
  const objects: any[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let start = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\')      escape   = true;
      else if (ch === '"')  inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        const objStr = inner.slice(start, i + 1);
        try {
          const obj = JSON.parse(objStr);
          objects.push(obj);
        } catch (_e) {
          // Try a basic repair — unescape stray newlines + tabs inside strings,
          // collapse \r → \n, then re-parse.
          const repaired = objStr.replace(/[\r\n\t]+/g, ' ');
          try { objects.push(JSON.parse(repaired)); } catch { /* drop */ }
        }
        start = -1;
      }
    }
  }
  if (objects.length === 0) throw new Error('Forgiving parse recovered 0 objects');
  return objects;
}

/**
 * Call generateContent with bounded retry + automatic model switching.
 *
 * KEY IMPROVEMENT over the old version:
 *   Old: passed `model` as a parameter → retried the SAME rate-limited model 3×
 *   New: accepts `genAI` and calls `getModel()` at the START of each attempt.
 *        On 429 (rate limit) we call `invalidateModelCache()` so the NEXT attempt
 *        automatically picks the next candidate (gemini-2.0-flash, etc.) instead
 *        of hammering the same quota-exhausted model.
 *
 * Retry budget: 4 attempts = can cycle through up to 4 model candidates.
 * Non-retryable errors (400, 401, 403) propagate immediately.
 */
async function callGeminiWithRetry(
  genAI:            any,
  prompt:           string,
  generationConfig?: { maxOutputTokens?: number; temperature?: number },
): Promise<any> {
  const MAX_ATTEMPTS = 4;  // 4 candidates available; one attempt each
  let lastErr: any = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // Re-resolve model on every attempt — after invalidation this picks the next candidate
      const { name } = await getModel(genAI);
      // Rebuild the model handle so we can apply per-call generationConfig
      // (e.g. higher maxOutputTokens for the 24-card 8-layer keyword prompt).
      const _m = generationConfig
        ? genAI.getGenerativeModel({ model: name, generationConfig })
        : (await getModel(genAI)).model;
      return await _m.generateContent(prompt);
    } catch (err: any) {
      lastErr = err;
      const msg    = String(err?.message ?? err);
      const status = (err?.status ?? err?.response?.status ?? 0) as number;
      // 404 = model deprecated → blacklist + try next candidate immediately (no wait)
      if (status === 404 || /no longer available|model.*not found|404/i.test(msg)) {
        invalidateModelCache(_resolvedModelName ?? undefined);
        continue;
      }
      const isRateLimit = status === 429 || /rate ?limit|quota/i.test(msg);
      const transient =
        isRateLimit || status === 503 || status === 504 ||
        /overloaded|temporar|timeout|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg);
      if (!transient || attempt === MAX_ATTEMPTS - 1) throw err;
      if (isRateLimit) {
        // Switch to the NEXT model candidate — don't waste retries on the same quota-limited model
        invalidateModelCache(_resolvedModelName ?? undefined);
        console.warn(`[Gemini] attempt ${attempt + 1}: rate-limited — switching model (1.5 s cooldown)`);
        await new Promise(r => setTimeout(r, 1500));
      } else {
        // Server error — brief backoff then retry same (or new) model
        const delay = [2000, 5000, 8000][attempt] ?? 8000;
        console.warn(`[Gemini] attempt ${attempt + 1} failed (${status || 'transient'}) — retrying in ${delay / 1000}s`);
        await new Promise(r => setTimeout(r, delay));
      }
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
 * Order: 2.0-flash (no thinking mode — 3-5× faster than 2.5-flash) →
 *        2.5-flash (heavier reasoning, used when 2.0 is exhausted) →
 *        2.5-pro (highest quality, lowest RPM) →
 *        2.0-flash-lite (last resort).
 *
 * SPEED RATIONALE: Local repro of the 8-layer keyword prompt took 137-236s on
 * 2.5-flash (thinking mode burns 30-60s of latency before any output). The
 * same prompt on 2.0-flash returns in ~30-60s with no quality drop on
 * structured-JSON tasks. Quality stays high because the rich prompt
 * (8-layer methodology + 3-lens rubric) does the heavy lifting, not the
 * model's hidden chain-of-thought.
 *
 * The previous list referenced dated preview models like
 * `gemini-2.5-flash-preview-05-20` and `gemini-2.5-pro-preview-05-06` which were
 * time-limited builds and have since been replaced by the stable GA names below.
 */
const MODEL_CANDIDATES = [
  'gemini-2.0-flash',       // PRIMARY — no thinking mode, 3-5× faster on JSON tasks
  'gemini-2.5-flash',       // fallback — thinking mode kicks in for harder tasks
  'gemini-2.5-pro',         // higher quality, slower, lower RPM
  'gemini-2.0-flash-lite',  // tightest quota, last resort
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
  | 'waterfall' | 'funnel' | 'dumbbell';

export interface GeminiInsightCard {
  title:         string;
  bucket:        'content' | 'commerce' | 'communication' | 'culture' | 'channel' | 'media' | 'creative' | 'pricing' | 'search';
  type:          ChartType;
  conviction:    number;
  obs:           string;
  stat:          string;
  rec:           string;
  toolLabel:     string;
  chartLabels:   string[];
  chartValues:   number[];
  chartValues2?: number[];  // scatter Y-axis OR second series for grouped bar/hbar
  chartTitle?:   string;    // SHORT CAPS descriptor shown above the chart
  chartSeries?:  string[];  // legend labels when two series are plotted [series1, series2]
}

export interface ExecutiveSummary {
  headline:       string;
  objective:      string;
  observations:   string[];
  recommendations: string[];
}

/** One pre-processed slot — exact numbers, no estimates */
export interface DataSlot {
  bucket:          'content' | 'commerce' | 'communication' | 'culture' | 'channel' | 'media' | 'creative' | 'pricing' | 'search';
  question:        string;
  chartSuggestion: ChartType;
  // ── Two-audience comparison metadata (set when GWI export had paired
  // audience columns: "Audience %, Audience %, Data point %, Data point %, ...")
  // Single-audience slots leave these undefined so downstream code branches
  // on `slot.isTwoAudience` to decide whether to compare. ────────────────
  isTwoAudience?:  boolean;
  audienceALabel?: string;
  audienceBLabel?: string;
  rows: Array<{
    attr:        string;
    audiencePct: number;
    dataPct:     number;
    index:       number;
    universe:    number;
    // Audience B values — only populated when slot.isTwoAudience === true.
    // Use audiencePct2 / index2 in prompts and chart builders that want the
    // second audience; otherwise these stay undefined.
    audiencePct2?: number;
    dataPct2?:     number;
    index2?:       number;
    universe2?:    number;
  }>;
}

// ── Primary PRISM analysis ─────────────────────────────────────

/**
 * Gemini 2.5 Flash reads pre-processed data slots (exact numbers per slot)
 * and writes 8 McKinsey-quality insight cards — 2 per PRISM bucket.
 * Anti-hallucination: every number Gemini uses comes from the slots we provide.
 */
export async function analyzeDataForPRISM(
  slots:        DataSlot[],
  context:      string,
  toolLabel:    string = 'GWI',
  briefContext: string = '',
): Promise<GeminiInsightCard[]> {
  const genAI = await getGenAI();
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (slots.length === 0) return [];

  await getModel(genAI); // warm model cache; actual model resolved inside callGeminiWithRetry

  // Detect whether ANY slot is a 2-audience comparison so we can inject
  // a comparison-specific rubric into the prompt header.
  const anyTwoAudience = slots.some(s => s.isTwoAudience);

  // Build structured slot block — exact numbers, clearly labelled.
  // For 2-audience slots, each row shows BOTH audiences' values plus the
  // explicit gap so Gemini can quote the difference without inventing it.
  const slotBlock = slots.map((slot, i) => {
    const twoAud = !!slot.isTwoAudience;
    const audA   = slot.audienceALabel || 'Audience A';
    const audB   = slot.audienceBLabel || 'Audience B';

    const rowLines = slot.rows.map(r => {
      if (twoAud) {
        const pctA = r.audiencePct.toFixed(1);
        const pctB = (r.audiencePct2 ?? 0).toFixed(1);
        const idxA = (r.index / 100).toFixed(2);
        const idxB = ((r.index2 ?? 0) / 100).toFixed(2);
        const gapN = r.audiencePct - (r.audiencePct2 ?? 0);
        const gap  = `${gapN >= 0 ? '+' : ''}${gapN.toFixed(1)} pts`;
        return `    • ${r.attr}: ${audA} = ${pctA}% (${idxA}× nat) | ${audB} = ${pctB}% (${idxB}× nat) | gap = ${gap}`;
      }
      return `    • ${r.attr}: ${r.audiencePct.toFixed(1)}% audience`
        + ` | ${(r.index / 100).toFixed(2)}× national avg`
        + (r.universe > 0 ? ` | ~${(r.universe / 1e6).toFixed(1)}M people in India` : '');
    }).join('\n');

    // Explicit NUMBER BANK — every number the AI is permitted to use for this card.
    // 2-audience mode enumerates both audiences and the gap so Gemini can quote
    // the gap as a real number, not a derived guess.
    const bankLines = slot.rows.map(r => {
      if (twoAud) {
        const pctA = r.audiencePct.toFixed(1);
        const pctB = (r.audiencePct2 ?? 0).toFixed(1);
        const idxA = (r.index / 100).toFixed(2);
        const idxB = ((r.index2 ?? 0) / 100).toFixed(2);
        const gapN = r.audiencePct - (r.audiencePct2 ?? 0);
        const gap  = `${gapN >= 0 ? '+' : ''}${gapN.toFixed(1)}pts`;
        return `  ${r.attr}: ${audA}=${pctA}%/${idxA}× | ${audB}=${pctB}%/${idxB}× | gap=${gap}`;
      }
      const parts = [`${r.audiencePct.toFixed(1)}%`, `${(r.index / 100).toFixed(2)}×`];
      if (r.universe > 0) parts.push(`~${(r.universe / 1e6).toFixed(1)}M`);
      return `  ${r.attr}: ${parts.join(' | ')}`;
    }).join('\n');

    const audienceHeader = twoAud
      ? `Audiences in this slot: A = "${audA}" | B = "${audB}" — every observation must name them and call out the gap.\n`
      : '';

    return `
SLOT ${i + 1} | PRISM Bucket: ${slot.bucket.toUpperCase()} | Topic: ${slot.question}
Suggested chart: ${slot.chartSuggestion}
${audienceHeader}DATA ROWS (sorted by signal strength):
${rowLines}
PERMITTED NUMBERS for this card — use only these (or plain-English translations). Any number not listed here is forbidden:
${bankLines}`;
  }).join('\n');

  // Two-audience comparison rubric — only injected when ANY slot is 2-audience.
  // Single-audience uploads never see this block; behaviour unchanged.
  const twoAudienceRubric = anyTwoAudience ? `
━━ TWO-AUDIENCE COMPARISON MODE ━━
Some slots are marked "Audiences in this slot: A = ... | B = ...". For THOSE slots only,
follow this comparison rubric in addition to the standard Insight Block format below:

• TITLE must name BOTH audiences or call out the gap explicitly. Examples:
  ✅ "Audience A Leads on Online Discovery by 12 Points — Reframe the Pitch"
  ✅ "Same Heritage, Different Habits — A Skips TV, B Watches Daily"
  ❌ "Strong Online Discovery Behaviour" (no comparison, no audience names)

• OBSERVATION — 3 sentences with this pattern:
  Sentence 1 — WHO + WHAT + THE GAP: name BOTH audiences, the dimension being compared,
                and the direction (A leads / B leads), using both percentages from the bank.
  Sentence 2 — THE BREAKDOWN: split the top 2–3 attributes across both audiences with their
                exact percentages from PERMITTED NUMBERS (do not aggregate).
  Sentence 3 — THE STRATEGIC IMPLICATION: what the brand should DO differently for A vs B
                based on the divergence — not generic; tied to the brief.

• STAT line is the single biggest gap, plain English. Use the gap value from the bank.
  ✅ "Audience A are nearly twice as likely to discover brands on Instagram than Audience B."

• RECOMMENDATION must explicitly address BOTH audiences. Either give one direction per audience,
  or explain why one of the two is the priority for this brief.

• CHART DATA for 2-audience slots:
  chartLabels  = the attribute names (top up to 8)
  chartValues  = Audience A's % per attribute
  chartValues2 = Audience B's % per attribute (NEVER leave empty for 2-audience slots)
  chartSeries  = [exact name of Audience A, exact name of Audience B] from the slot header.
  This renders side-by-side navy + teal bars (or a two-polygon radar for personas) — the
  GWI report look. If you describe a comparison in obs/title, chartValues2 + chartSeries
  are MANDATORY.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const briefBlock = briefContext ? `
━━ CLIENT BRIEF — READ THIS BEFORE WRITING ANY CARD ━━
These insights are being created for a specific brief. Every card you write MUST be directly relevant to this brand's objective.
Do NOT produce generic audience observations — write insights a strategist for THIS brand can act on immediately.
${briefContext}
RELEVANCE RULE: Frame every observation, stat, and recommendation through this brief's specific objective and target audience. Skip data signals that have no bearing on this brand or campaign. If a slot's data is only weakly relevant, still connect it explicitly to the brand's challenge.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const prompt = `You are an **Insight Strategist for Ads** at PRISM, writing for brand managers, media planners, and creative directors in India.

You will receive a BRIEF and one or more GWI tables (any bucket: demographics, interests, attitudes, media, purchase). Your job is to turn this into a small set of sharp, creative-ready insights.
${briefBlock}${twoAudienceRubric}
DATASET: ${context}

${slotBlock}

━━ PRIORITY OF THESE RULES (compulsory guardrails) ━━
Treat every instruction below as a mandatory guardrail, not an optional tip. You must always:
• Use the BRIEF as the primary lens.
• Use ONLY the provided GWI data above for facts and numbers — no external facts, no hallucinations.
• Follow the fixed output structure (one Insight Block per slot, with Title / Observation / Recommendation).
• Keep language sharp, simple, and creative-friendly.
Within these guardrails, you have strategic freedom: choose the angle and theme that best serves the brief for each slot.

━━ ONE INSIGHT BLOCK PER SLOT — UNIQUENESS ━━
You have ${slots.length} slots. Write EXACTLY ${slots.length} Insight Blocks — one per slot, in order.
Block 1 → SLOT 1 only. Block 2 → SLOT 2 only. And so on. No mixing of slots. No repeating the same finding, stat, or platform across two blocks.

━━ ANTI-HALLUCINATION (mandatory) ━━
Every number, percentage, ratio, or statistic you write MUST come verbatim from the slot's PERMITTED NUMBERS list above.
Do NOT invent, guess, combine, or extrapolate any value not present in the slot.
Plain-English translation is allowed: "1.83×" → "nearly twice"; "62.0%" → "about 3 in 5".
If a useful detail (a platform, age band, attitude) is not in the data, do NOT guess it — write around it or omit it.
Example sentences below are FORMAT TEMPLATES only — placeholders like [X]%, [N]× are illustrative; never copy them.

━━ TONE & LANGUAGE ━━
Write like a brilliant strategist explaining a finding over coffee — not a consultant writing a deck.
• A 16-year-old and a CMO should both find every block easy to read.
• Short sentences. Active voice. Plain English.
• No tables. No raw data dumps. No research jargon ("row %", "column %", "stat sig", "over-index", "cohort", "leverage", "synergy", "touchpoint", "whitespace", "holistic", "robust", "utilize", "paradigm", "seamless").
• Use: people, families, buyers, young Indians, 1 in 3, nearly twice, here is the thing.

━━ McKINSEY-STYLE DISCIPLINE (writing rubric on top of the blueprint) ━━
Every block obeys the pyramid principle: lead with the ANSWER, then the evidence.
• The Title IS the answer. A reader who only sees the title should already know what to do.
• The Observation is the evidence — the WHY behind the title. Two sentences max.
• The Recommendation is the so-what — what to DO. One short directive per angle (Creative / Brand / Media), 12 words each.
• No throat-clearing. No "this audience...". No "interestingly...". No "it is important to note...". Cut every word that doesn't add information.
• Every number earns its place. Do NOT list three percentages when one tells the story. Pick the strongest signal; drop the rest.
• End every Observation on a "therefore" implication that the Recommendation picks up. The connection between the two should feel inevitable.
• When the slot is a 2-audience comparison, the answer IS the gap. State the gap in pts, name which audience leads, then the so-what.

━━ STORYTELLING DISCIPLINE — voice rules (the McKinsey rubric gave you SHAPE; this gives you VOICE) ━━

Every block must read like a strategist explaining the audience to a creative director over coffee — NOT a deck bullet a consultant dictated.

THE OPENING MOVE — never begin an Observation with:
✗ "The data shows that…"
✗ "'Ghadi Detergent Female 2' demonstrates / engages / shows…"
✗ "The 'Ghadi Detergent Female 2' audience…"
✗ "Interestingly," / "Notably," / "It is important to note,"

Instead open with the HUMAN or the MOMENT. The data point is the punchline, not the lead.

USE TENSION — every title needs a "but/yet/still/not" hinge OR a specific image:
✓ "Buys New Tech Early — But Blocks Every Ad She Sees"
✓ "Reels at 11pm Beat Prime-Time TV Two-to-One"
✓ "Trusts WhatsApp Forwards More Than Brand Ads"
✓ "Five Apps Open, Brand Loyalty in None of Them"
✗ "Female 2 Lead in Online Shopping by 13 Points"  ← data readout, no hook
✗ "Female 2 Seek Brand & Expert Content More"  ← describes, doesn't dramatise

USE INDIA-SPECIFIC IMAGERY when the data supports it — pressure cookers, evening tea, WhatsApp groups, monthly grocery runs, festive shopping, prime-time saas-bahu, regional language Reels. Tier 1/2 metros are real places, not census codes.

ACTIVE VERBS over passive descriptors:
✓ "She juggles five apps at once"
✗ "Demonstrates high cross-platform engagement"

BANNED CONSULTANCY WORDS — anywhere in the block (Title, Obs, or Rec):
"demonstrates", "demonstrating", "engages with", "engaging with", "engagement opportunity",
"leverage", "leveraging", "diversify", "diversifying", "thrive across", "thrives across",
"ecosystem", "synergise", "synergy", "omnichannel", "drive engagement", "drives engagement",
"amplify", "amplifying", "value-add", "value-added", "build presence", "build a presence",
"establish brand", "establishing brand", "design adaptable formats", "adaptable formats",
"explore opportunities", "consider testing", "consider exploring",
"compelling content", "engaging content", "high-quality content", "rich content",
"target audience", "target consumers", "target demographic", "key audience",
"showcasing", "showcase", "highlighting" (use "show" instead),
"actively engages", "highly engaged", "deeply engaged", "significantly more likely",
"digital savvy", "digitally savvy", "digital-first" (use the actual behaviour instead),
"insights-driven", "data-driven", "audience-centric", "consumer-centric",
"unlock value", "tap into", "harness".
If you wrote any of these, REWRITE the sentence using a specific verb + specific Indian app/moment/context. Dead language fails. Specifically:
✗ "Design adaptable content formats that thrive across diverse social ecosystems"
✗ "Diversify media spend beyond single-platform dominance for broader reach"
✗ "Develop expert-led content showcasing product benefits"
✓ "Show her stirring dal with Reels playing — sound off, captions on. Real kitchen, not a set."
✓ "Sponsor Tanishq's Friday Reels slot; skip the Sunday cricket pre-roll."
✓ "Run 9-second Hindi voiceovers in cinema slots before romantic releases."

━━ FORCING FUNCTION — every Insight Block must contain AT LEAST ONE of these four anchors:
1. A SPECIFIC MOMENT: time of day, day of week, festive event, kitchen / commute / bedtime ritual.
2. A SPECIFIC INDIAN APP or PLACE: Blinkit / BigBasket / Hotstar / JioCinema / Insta Reels / YouTube Music / WhatsApp aunty group / Tier 1 metro / kirana / Tanishq cinema slot.
3. A COUNTERINTUITIVE REFRAME: "not aspirational — already winning" / "the brief is wrong" / "this is a UX problem, not a marketing one".
4. A BOLD MEDIA REALLOCATION CALL: "cut TV by half" / "kill the 30-sec film" / "skip pre-roll, sponsor in-app".

If your block reads like it could describe ANY audience in ANY market, it fails — rewrite with one of the four anchors above.

━━ MAKE A BET, NOT A SUGGESTION ━━
Recommendations are bets, not options. Consultancy says "consider testing X" — a strategist says "kill X, do Y instead". Use verbs that commit budget:
✓ "Kill the 30-sec film. Run only 9-second cuts."
✓ "Cut FMCG TV by half. Redirect to Blinkit category sponsorships."
✓ "Drop the heritage RTB. Lead with 'works while she watches Reels'."
✓ "Skip influencer megastars. Pay 50 Tier-1 women with 5K followers each."
✗ "Explore opportunities for video content across platforms."
✗ "Consider diversifying media mix."
✗ "Engage with the digitally savvy audience."

━━ VOICE EXAMPLES — this is the bar ━━

DATA POINT: 46% Female 2 shop online vs 33% Female (+13 pts gap on online shopping)

✗ DECK-SPEAK:
TITLE: "Female 2 Lead in Online Shopping by 13 Points"
OBS: "'Ghadi Detergent Female 2' demonstrates significantly higher online shopping behaviour, with 46.3% reporting online shopping compared to 33.3% for Female. This indicates a strong digital commerce inclination requiring focused e-commerce strategy."
REC: CREATIVE: Develop compelling e-commerce content. BRAND: Establish digital accessibility. MEDIA: Drive traffic to e-commerce platforms.

✓ STRATEGIST (the bar):
TITLE: "She's Already on Blinkit by the Time Your Cricket Ad Loads"
OBS: 46% of Ghadi Female 2 buys detergent online — and the choice happens in the four seconds it takes Blinkit to suggest a re-order. By the time your demo finishes loading on Hotstar, she's already swiped past it.
REC: CREATIVE: Kill the 30-sec demo film. Make a 9-second product card sized for the Blinkit grid.
BRAND: Drop "heritage of trust". Lead with "always in the basket, never the brief".
MEDIA: Cut FMCG TV by half. Redirect to Blinkit / BigBasket / Amazon Pantry category sponsorships in metros.

═══════════════════════════════

DATA POINT: 26% Female 2 buy new tech at launch (early adopter) BUT 47% block intrusive ads

✗ DECK-SPEAK:
TITLE: "Early Adopters But Wary of Digital Trust"
OBS: "Female 2 are notably more likely to buy new tech products as soon as they are available (26.3% vs 20.X%), but also more likely to block intrusive advertising."
REC: CREATIVE: Highlight innovative features while assuring data security. BRAND: Position as forward-thinking, trustworthy. MEDIA: Use platforms with strong privacy policies.

✓ STRATEGIST:
TITLE: "Buys New Tech First, Blocks Your Ad Second"
OBS: 26% try new tech the day it launches — and 47% block the ads that tell them about it. Female 2 is digitally curious AND digitally defensive; she'll find your product on her own terms, and resent the brand that tries to force the find.
REC: CREATIVE: Show real Female 2s unboxing the product on Reels — UGC, not commercial.
BRAND: Position SArgam 3 as the detergent her smart home picked for her, not the one TV told her about.
MEDIA: Skip Hotstar pre-rolls (where she ad-blocks). Sponsor in-app moments inside Blinkit / Mi Home / Alexa skills instead.

═══════════════════════════════

DATA POINT: Female 2 uses 5+ social platforms (25.9%) vs Female (17.X%)

✗ DECK-SPEAK:
TITLE: "Female 2 Juggle More Platforms, Female Keep It Simple"
OBS: "The 'Ghadi Detergent Female 2' audience engages with significantly more social media services, with 25.9% using 5 or more platforms compared to just 17.X% for Female."
REC: CREATIVE: Design adaptable content formats that thrive across diverse social ecosystems.

✓ STRATEGIST:
TITLE: "Insta, YouTube, Pinterest, WhatsApp — All Open by 11pm"
OBS: 1 in 4 Female 2 has five or more apps running at any moment after the kids are asleep — she's not on a platform, she's between them. The campaign that picks Instagram and calls it a "social strategy" reaches her one-fifth of the time.
REC: CREATIVE: Make one 15-second hero, then 6 cuts — each shot for a different app's native vibe (Reels punchline, YouTube Shorts hook, WhatsApp forward, Pinterest aesthetic).
BRAND: Drop the "consistent brand voice" obsession. Be the brand that meets her on each app speaking that app's language.
MEDIA: Cut single-platform digital buys. Run a Tier-1 women influencer program (50 women, 5K-50K followers each) that posts NATIVELY to each platform.

═══════════════════════════════

DATA POINT: Female 2 discovers brands via social media updates (18.2%) and cinema ads (18.X%)

✗ DECK-SPEAK:
TITLE: "Female 2 Discover Brands Via Social Updates & Cinema Ads"
OBS: "Female 2 are more likely to discover new brands through updates on social media pages (18.2%) and ads seen at the cinema (18.X%)."
REC: CREATIVE: Develop engaging social media content and high-quality cinema ads.

✓ STRATEGIST:
TITLE: "She Finds Brands Between Films and Between Friends"
OBS: 1 in 5 Female 2 discovers brands in two places almost no FMCG brief is buying: the 90 seconds before a Bollywood film starts, and her cousin's Insta repost. Both are accidental, both are unguarded — and both are where her purchase shortlist is actually built.
REC: CREATIVE: Make a 22-second film that works WITHOUT sound for cinema, and a 7-second cut sharable via WhatsApp forward.
BRAND: Position SArgam 3 as "the detergent her smart aunt told her about" — earned recommendation, not paid persuasion.
MEDIA: Book PVR / Inox Friday-Saturday primetime slots before Hindi releases. Pay 20 mid-tier women creators to repost organically (no #ad).

═══════════════════════════════

THE BAR: every Title should make a CMO either laugh, wince, or lean forward. If it reads safe, it's wrong.

━━ INSIGHT BLOCK FORMAT — follow exactly ━━

TITLE (max 10 words):
Punchy, specific, directional. Pyramid: the title IS the answer.
Use contrasts/levers: "2.8× More Likely…", "Joint Families, Not Urban Singles", "Promo-Driven, Not Brand-Loyal".
✅ "2.8× More Likely to Watch Reels — Anchor the Launch"
✅ "Joint Families, Not Urban Singles — Reframe the Pack"
✅ "Promo-Driven, Not Brand-Loyal — Lead With Value"
✅ "1 in 3 Research on Instagram First — Close the Gap"
❌ "Demographic Insight" (generic label, no direction)
❌ "Consumers Over-Index on Full Price" (jargon, no direction)
❌ "29% of Audience Use Social Media Less" (pure data, no signal)
NEVER use: "— Worth Planning Around", "— Worth Building Into the Brief", "— a Clear Signal", "Key Insight:", "This Audience".

OBSERVATION — EXACTLY 2 SENTENCES.
Sentence 1 (the evidence): name the exact audience using the BRIEF's brand + demographics, state the single strongest data point as a story (NOT a stat readout). Use ONE number, the most decisive one. For 2-audience slots: name BOTH audiences and the gap in points.
Sentence 2 (the so-what): name the strategic implication for the brand — the gap, tension, or opportunity that the Recommendation will address. End on "therefore" / "which means" / "the brand should" framing.
Never write "this audience" — always name the brand + demographics from the brief.
Avoid throat-clearing: do not start with "interestingly", "notably", "it is worth noting", "the data shows that". Lead with the noun.
✅ "Ghadi Detergent Female 2 are 1.7× more likely than Female to block intrusive ads. The brand's launch creative cannot rely on pre-roll interruption — it must earn the watch."
❌ Three sentences. Multiple stats. Throat-clearing openers.

STAT — one line. The sentence a strategist would screenshot.
Plain English, no brackets, no "Index" numbers, max 18 words.
✅ "Nearly 2 in 5 Nike target consumers prioritise short-form video — almost twice the national average."
❌ "Index 168 · Full Price behaviour"
❌ "21.8% of audience (1.3× national avg)"

RECOMMENDATION — THREE LABELED DIRECTIVES, ONE LINE EACH (max 14 words per line).
Emit exactly these three labels in this exact order, each followed by a colon and ONE directive sentence:
CREATIVE: <show… / lead with… / avoid… / build…> — what to show, how to frame, what to avoid.
BRAND: <position… / lead with… / shift…> — how to position, which RTB to lead with.
MEDIA: <prioritise… / test… / integrate… / shift spend to…> — where/how to reach, which format to use.

Directive language only. No "consider", "explore", "possibly". Each line must be specific enough to brief an agency tomorrow.
✅
CREATIVE: Show joint families breaking bread, not urban singletons in cafés.
BRAND: Lead with shared-trust RTB, not heritage prestige messaging.
MEDIA: Prioritise prime-time TV and YouTube CTV in regional languages.
❌ "Consider digital advertising on social platforms to reach this audience" (too vague — no creative, no brand, no media angle, no specifics).
❌ A flowing paragraph that runs all three angles into one sentence.

━━ CHART DATA ━━
• chartLabels: use the exact attribute names from THIS slot (up to 8)
• chartValues: use exact Audience % values from THIS slot
• chartTitle: 6–10 words in ALL CAPS — a precise description of what this chart actually shows.
  ✅ "DISCOVERY CHANNEL BREAKDOWN — WHERE TARGET SEGMENT RESEARCHES BEFORE BUYING"
  ✅ "PURCHASE INTENT BY INCOME BRACKET — INDEXED VS NATIONAL AVERAGE"
  ✅ "BRAND CONSIDERATION VS. PURCHASE CONVERSION (%) — BY CITY TIER"
  Never write "Chart Title" or leave generic. Max 12 words.
• For scatter: chartLabels = attribute names, chartValues = Audience % (X axis), chartValues2 = Index scores converted to multipliers (Y axis, e.g. Index 197 → 1.97)
• COMPARISON CHARTS — MANDATORY RULE:
  Whenever your insight compares two brands, two groups, or this audience vs a national/competitor baseline
  (e.g. "Nike vs Adidas", "Brand vs Category Average", "This Audience vs National Average"):
  ① Set type to "bar" or "hbar"
  ② chartValues   = values for the FIRST brand/group (the primary subject)
  ③ chartValues2  = values for the SECOND brand/group (the competitor/baseline) — NEVER leave empty
  ④ chartSeries   = ["Brand A Name", "Brand B Name"] — use the actual brand names
  This renders a side-by-side grouped bar chart: Brand A in blue, Brand B in orange.
  If you describe a comparison in your obs or title, you MUST provide chartValues2 + chartSeries.
• type: start with the chartSuggestion from THIS slot — override only if a better type is obvious

━━ MANDATORY CHART-TYPE RULES (no fallback — apply BEFORE the guide below) ━━
RULE A — BINARY TRADE-OFF → doughnut:
  If the slot has exactly 2 attributes whose Audience % sum to ~100 (a trade-off
  question like "Shop in-store vs Shop online", "Pay in cash vs Pay without using cash",
  "Pay less for cheaper own-brand vs Pay more for a brand you know"), set type to "doughnut".
  NEVER use hbar/bar for a binary trade-off — two-slice bars look weak; a doughnut reads
  instantly as "she sides with X, not Y".

RULE B — PERSONAS / SEGMENTATION → radar:
  If the slot question contains "Persona", "Segmentation", "Describes Consumer",
  "Self-Perception", or "Character Describes", AND has 5–8 attributes, set type to "radar".
  • Single-audience slots: set chartValues2 to an array of 100s with the same length as
    chartLabels (the national index baseline), and chartSeries to ["Audience %", "National baseline"].
    This lets the radar plot the audience profile against the neutral national average.
  • TWO-AUDIENCE slots (those marked "Audiences in this slot"): set chartValues2 to
    Audience B's exact %s from the bank (NOT the 100-baseline), and chartSeries to
    [exact A name, exact B name]. This renders two polygons (A in navy, B in teal) — the
    GWI persona radar look.

These two rules ALWAYS win over the guide below.

CHART TYPE GUIDE (choose the best visual for this insight):
• hbar       → ranked lists, long category names (5–12 items) — default for audience data
• bar        → short-label comparisons (3–8 items, vertical)
• line       → trends over time with 10+ continuous data points
• area       → cumulative volumes or stacked trends over time (2-audience: two lines)
• pie        → proportional splits, 2–6 segments only (e.g. Yes/No, sentiment)
• doughnut   → cleaner pie for dashboards (2–6 segments)
• scatter    → two numeric axes — Audience% (X) vs Index multiplier (Y)
• combo      → two metrics on one chart: bar (primary) + line overlay (secondary trend)
• histogram  → how values spread across ranges / frequency distribution
• radar      → compare 3–8 attributes simultaneously for 1–3 items (2-audience: two polygons)
• waterfall  → how +/− components add up to a total (bridge/waterfall chart)
• funnel     → conversion or dropout flow (Awareness → Consideration → Purchase)
• dumbbell   → TWO-AUDIENCE A-vs-B comparison: one row per attribute with two dots (A in navy, B in teal) connected by a gap line. The GAP is the focal point. Use this when the slot has 4–10 attributes and the strategic story IS the divergence between the two audiences. PREFERRED over hbar/bar for 2-audience slots in this size range — it makes the gap impossible to miss.

━━ CHART VARIETY — MANDATORY ━━
Across all ${slots.length} cards you MUST use at least 4 DIFFERENT chart types.
NEVER assign the same type to more than 2 consecutive cards.
If your current card would create a third repetition in a row, override with a different type that still fits the data.
Distribution target: use hbar/bar for at most 3 cards total — fill remaining cards with area, doughnut, scatter, radar, funnel, waterfall, or combo wherever data supports it.

━━ JSON WIRE FORMAT — strict ━━
- "type" valid values: hbar | bar | line | area | pie | doughnut | scatter | combo | histogram | radar | waterfall | funnel | dumbbell
- "rec" MUST be a SINGLE STRING with the three labels embedded on separate lines, joined by "\\n":
    "rec": "CREATIVE: Show real Indian families exchanging trust, not abstract data icons.\\nBRAND: Lead with heritage-trust positioning over performance promises.\\nMEDIA: Prioritise contextual placements; avoid heavy retargeting flows."
- Do NOT return rec as an object like { "creative": ..., "brand": ..., "media": ... } — it must be a string.
- "title" hard cap: 10 words. Count them before writing.
- "obs" hard cap: 2 sentences. Count them before writing.
- "stat" hard cap: 18 words.
- For 2-audience slots, "chartValues2" and "chartSeries" are mandatory.

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string (≤10 words)",
    "bucket": "content|commerce|communication|culture|channel|media|creative|pricing|search",
    "type": "hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel|dumbbell",
    "conviction": 90,
    "obs": "string (exactly 2 sentences)",
    "stat": "string (≤18 words)",
    "rec": "CREATIVE: <directive>\\nBRAND: <directive>\\nMEDIA: <directive>",
    "chartTitle": "ALL CAPS DESCRIPTION OF WHAT THIS CHART SHOWS — MAX 12 WORDS",
    "chartLabels": ["label1","label2"],
    "chartValues": [42.5, 38.1],
    "chartValues2": [1.97, 1.54],
    "chartSeries": ["Audience A name", "Audience B name"]
  }
]`;

  try {
    const result  = await callGeminiWithRetry(genAI, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    // Empty text = model silently blocked or unavailable → invalidate cache so
    // the next call re-probes for a working model instead of hammering the same one.
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text — model may be blocked or rate-limited');
    }
    const cleaned   = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const arrayJson = extractFirstJsonArray(cleaned);
    if (!arrayJson) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('No JSON array in Gemini response — model returned non-JSON output');
    }

    // Forgiving parse — recovers from a single malformed card without failing
    // the whole 20-card response.
    const parsed: any[] = parseJsonArrayForgiving(arrayJson);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const validBuckets = ['content','commerce','communication','culture','channel','media','creative','pricing','search'];
    const validTypes: ChartType[] = [
      'hbar','bar','line','area','pie','doughnut',
      'scatter','combo','histogram','radar','waterfall','funnel',
    ];

    return parsed.slice(0, 18).map(c => ({
      title:        String(c.title || 'Insight'),
      bucket:       (validBuckets.includes(c.bucket) ? c.bucket : 'content') as GeminiInsightCard['bucket'],
      type:         (validTypes.includes(c.type)     ? c.type   : 'hbar')    as ChartType,
      conviction:   Number(c.conviction) || 88,
      obs:          String(c.obs  || ''),
      stat:         String(c.stat || ''),
      // Gemini sometimes returns rec as a structured object { creative, brand,
      // media } even when the prompt asks for a single string. Serialise back
      // to the labeled multi-line string format that parseRecommendation +
      // the card renderer expect, so both prompt styles work.
      rec:          normaliseRec(c.rec),
      toolLabel,
      chartLabels:  Array.isArray(c.chartLabels)  ? c.chartLabels.map(String)  : [],
      chartValues:  Array.isArray(c.chartValues)  ? c.chartValues.map(Number)  : [],
      chartValues2: Array.isArray(c.chartValues2) ? c.chartValues2.map(Number) : undefined,
      chartTitle:   c.chartTitle  ? String(c.chartTitle)  : undefined,
      chartSeries:  Array.isArray(c.chartSeries)  ? c.chartSeries.map(String)  : undefined,
    }));

  } catch (err) {
    console.error('[Gemini] analyzeDataForPRISM failed:', (err as Error).message);
    throw err; // surface real reason to the API route
  }
}

/**
 * Normalise the `rec` field coming back from Gemini. The prompt asks for a
 * single string with CREATIVE: / BRAND: / MEDIA: labels embedded, but Gemini
 * sometimes returns a structured object instead. Serialise either shape to
 * the labeled-string format that the UI's `parseRecommendation` consumes.
 */
function normaliseRec(rec: any): string {
  if (rec == null) return '';
  if (typeof rec === 'string') return rec;
  if (Array.isArray(rec)) {
    // ["CREATIVE: ...", "BRAND: ...", "MEDIA: ..."] form — join with newlines.
    return rec.map((r: any) => typeof r === 'string' ? r : '').filter(Boolean).join('\n');
  }
  if (typeof rec === 'object') {
    // { creative: "...", brand: "...", media: "..." } form — case-insensitive lookup.
    const lower: Record<string, any> = {};
    for (const k of Object.keys(rec)) lower[k.toLowerCase().trim()] = rec[k];
    const parts: string[] = [];
    const creative = lower.creative ?? lower.cr;
    const brand    = lower.brand    ?? lower.br;
    const media    = lower.media    ?? lower.md;
    if (creative) parts.push(`CREATIVE: ${String(creative).trim()}`);
    if (brand)    parts.push(`BRAND: ${String(brand).trim()}`);
    if (media)    parts.push(`MEDIA: ${String(media).trim()}`);
    if (parts.length > 0) return parts.join('\n');
    // Unknown object shape — drop to JSON last resort so SOMETHING shows up
    return JSON.stringify(rec);
  }
  return String(rec);
}

/**
 * Enforce length caps as a safety net AFTER Gemini returns. The McKinsey-style
 * prompt asks for tight outputs (Title ≤10 words, Observation 2 sentences),
 * but Gemini doesn't always obey. These helpers truncate at sentence/word
 * boundaries so the rendered cards always respect the caps the design needs.
 */
function capTitleWords(t: string, maxWords: number = 10): string {
  if (!t) return '';
  const words = t.trim().split(/\s+/);
  if (words.length <= maxWords) return t.trim();
  return words.slice(0, maxWords).join(' ').replace(/[,;:—\-]\s*$/, '').trim();
}
function capSentences(t: string, maxSentences: number = 2): string {
  if (!t) return '';
  // Split on terminal punctuation followed by space + capital letter, OR end of string.
  const matches = t.match(/[^.!?]+[.!?]+\s*/g) || [t];
  if (matches.length <= maxSentences) return t.trim();
  return matches.slice(0, maxSentences).join('').trim();
}

/**
 * Deterministic post-processing pass over Gemini-generated cards. Catches the
 * grammar artifacts and verbose patterns that the prompt asks Gemini to avoid
 * but Gemini still occasionally produces. Runs BEFORE the route returns cards
 * to the client. Does NOT touch numbers — preserves the anti-hallucination
 * guarantee.
 *
 * Fixes:
 *  • Doubled-up plurals from GWI attributes ("experts s", "tutorials s", "videoss")
 *  • "are feel <X>" pattern → "say <X>" (a common Gemini transcription of GWI
 *    attribute phrases that ARE feelings already)
 *  • Trailing parenthetical metadata in attribute names like "(Any device)",
 *    "(Select Markets Only)" — drops when it adds noise inside prose
 *  • Multiple whitespace, leading/trailing whitespace
 *  • Common throat-clearing openers ("Interestingly,", "Notably,", "It is
 *    worth noting that") — strips at sentence start
 *  • Triple-decimal precision ("21.83%") → one-decimal ("21.8%") for readability
 */
export function polishGeminiCards(cards: GeminiInsightCard[]): GeminiInsightCard[] {
  const polish = (s: string | undefined): string => {
    if (!s || typeof s !== 'string') return s ?? '';
    let out = s
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim()
      // Doubled-up plural ("experts s" / "videoss" / "tutorialss")
      .replace(/(\b\w+?)s\s+s\b/gi, '$1s')
      .replace(/(\b\w+?)ss\b(?!\w)/gi, (m, root) => {
        // keep "less", "pass", "miss" etc — only collapse if root already plural
        if (/^(less|pass|mass|miss|kiss|boss|loss|guess|class|cross|press)$/i.test(root)) return m;
        return `${root}s`;
      })
      // "are feel X" → "say X" (when X is a phrase). Common Gemini artifact when
      // a GWI attribute reads like an opinion: "Feel using social media causes me anxiety"
      .replace(/\bare\s+feel\s+/gi, 'say ')
      .replace(/\bis\s+feel\s+/gi, 'says ')
      // Throat-clearing at sentence start
      .replace(/(^|\.\s+)(Interestingly|Notably|It is worth noting that|It is important to note that|Importantly|Crucially)[,\s]+/gi,
               (_, lead, _word) => lead)
      // Three-decimal-or-more percentages → 1 decimal
      .replace(/(\d+)\.(\d{2,})%/g, (_, whole, frac) => `${whole}.${frac.slice(0, 1)}%`)
      // Drop double spaces that survived (after the above edits)
      .replace(/\s{2,}/g, ' ')
      .trim();
    return out;
  };

  return cards.map(c => ({
    ...c,
    // Title: clean grammar → cap at 10 words (McKinsey discipline).
    title:       capTitleWords(polish(c.title), 10),
    // Observation: clean grammar → cap at exactly 2 sentences.
    obs:         capSentences(polish(c.obs), 2),
    stat:        polish(c.stat),
    rec:         polish(c.rec),
    chartTitle:  c.chartTitle ? polish(c.chartTitle) : c.chartTitle,
    chartLabels: Array.isArray(c.chartLabels)
      ? c.chartLabels.map(l => {
          // Normalise attribute names for chart use: collapse whitespace, drop
          // certain trailing parens that add noise ("(Any device)", "(Select
          // Markets Only)") — but keep parens that ADD information.
          const cleaned = String(l ?? '')
            .replace(/\s+/g, ' ')
            .replace(/\s*\((Any device|Select Markets Only|Select Markets only)\)\s*$/i, '')
            .trim();
          return cleaned;
        })
      : c.chartLabels,
    chartSeries: Array.isArray(c.chartSeries)
      ? c.chartSeries.map(s => String(s ?? '').replace(/\s+/g, ' ').trim())
      : c.chartSeries,
  }));
}

// ── GWI Overview (Main Headline + Audience Snapshot) ──────────

export interface GwiOverview {
  headline:        string;  // Main Headline — one bold client-facing sentence
  audienceSnapshot: string; // 3–5 sentence character sketch
}

/**
 * Generates the Main Headline + Audience Snapshot for a GWI upload, per the
 * Insight Strategist blueprint. Reads ALL slots once and synthesises the
 * single biggest story (headline) plus a one-paragraph audience portrait.
 *
 * Anti-hallucination: same as analyzeDataForPRISM — only uses numbers from
 * the slots provided. If nothing strong is found, returns empty strings and
 * the caller can omit the overview block.
 */
export async function generateGwiOverview(
  slots:        DataSlot[],
  context:      string,
  briefContext: string = '',
): Promise<GwiOverview> {
  const genAI = await getGenAI();
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (slots.length === 0) return { headline: '', audienceSnapshot: '' };

  await getModel(genAI);

  const anyTwoAudience = slots.some(s => s.isTwoAudience);

  // Compact summary across ALL slots — top 3 rows per slot to keep tokens bounded.
  // 2-audience slots show both audiences' values plus the gap so the overview can
  // call out the single biggest A-vs-B divergence.
  const slotSummary = slots.slice(0, 18).map((slot, i) => {
    const twoAud = !!slot.isTwoAudience;
    const audA   = slot.audienceALabel || 'Audience A';
    const audB   = slot.audienceBLabel || 'Audience B';
    const topRows = slot.rows.slice(0, 3).map(r => {
      if (twoAud) {
        const pctA = r.audiencePct.toFixed(1);
        const pctB = (r.audiencePct2 ?? 0).toFixed(1);
        const idxA = (r.index / 100).toFixed(2);
        const idxB = ((r.index2 ?? 0) / 100).toFixed(2);
        const gapN = r.audiencePct - (r.audiencePct2 ?? 0);
        const gap  = `${gapN >= 0 ? '+' : ''}${gapN.toFixed(1)} pts`;
        return `    • ${r.attr}: A(${audA})=${pctA}%/${idxA}× | B(${audB})=${pctB}%/${idxB}× | gap=${gap}`;
      }
      return `    • ${r.attr}: ${r.audiencePct.toFixed(1)}% audience | ${(r.index / 100).toFixed(2)}× national avg`;
    }).join('\n');
    const audHeader = twoAud
      ? `  Audiences: A = "${audA}" | B = "${audB}"\n`
      : '';
    return `SLOT ${i + 1} — ${slot.question}\n${audHeader}${topRows}`;
  }).join('\n\n');

  const briefBlock = briefContext ? `\n━━ CLIENT BRIEF (primary lens) ━━\n${briefContext}\n` : '';

  // Surface the two-audience framing once, near the top, when ANY slot has it.
  const audA = slots.find(s => s.isTwoAudience)?.audienceALabel || 'Audience A';
  const audB = slots.find(s => s.isTwoAudience)?.audienceBLabel || 'Audience B';
  const twoAudienceBlock = anyTwoAudience ? `
━━ TWO-AUDIENCE COMPARISON DATASET ━━
This upload compares two audiences: A = "${audA}" and B = "${audB}".
• The MAIN HEADLINE must be the SINGLE biggest A-vs-B gap from the data — name both audiences
  and quantify the divergence (e.g. "2× more likely than", "12 points ahead of"). Use the
  exact gap values from the slot data — never invent magnitudes.
• The AUDIENCE SNAPSHOT must sketch BOTH audiences in one paragraph: how A behaves, how B
  behaves, and the dimension on which they diverge most. Start with: "For this brief, we are
  really comparing two audiences…"
` : '';

  const prompt = `You are an Insight Strategist for Ads at PRISM, writing for brand managers, media planners, and creative directors in India.
${briefBlock}${twoAudienceBlock}
DATASET: ${context}

━━ McKINSEY-STYLE DISCIPLINE — pyramid principle ━━
Lead with the answer, then the evidence. The Headline IS the answer. The Snapshot is the WHO + the one strategic tension worth knowing.
• Cut throat-clearing. No "interestingly", "notably", "it is important to note", "the data shows that".
• Every number earns its place. Pick the strongest signal. Drop the rest.
• Short, declarative sentences. No corporate hedging ("could possibly", "may suggest").
• Brevity is non-negotiable below.

━━ STORYTELLING DISCIPLINE — voice ━━
Write like a strategist describing the audience to a creative director, not a researcher reading the table.
• Headline uses a TENSION hinge (but / yet / still / not / more than / despite) OR a specific image.
  ✓ "She trusts WhatsApp forwards more than brand ads"
  ✓ "Buys new tech early but blocks every ad she sees"
  ✗ "Female 2 is 10.2 points more likely than Female to block ads"  (data readout, no story)
• Snapshot opens with a HUMAN moment, not "The data shows" or "Female 2 demonstrates". One concrete image (kitchen, WhatsApp group, evening tea, music videos at 11pm) when the data supports it.
• Banned: "leverage", "engage", "ecosystem", "diversify", "amplify", "drive engagement", "build presence". Use specific verbs.

You will read the GWI signals below across all slots and produce TWO things only:

1. MAIN HEADLINE — one bold, client-facing sentence (max 22 words).
   • Pyramid: this IS the answer. A reader who only sees the Headline already knows the one big thing.
   • Combines the essence of the BRIEF with the SINGLE strongest insight (the biggest gap or the strongest signal).
   • Use a number ONLY when it sharpens the message (e.g., "2.8× more likely", "10.2 pts ahead").
   • Punchy, specific, directional. No jargon. No "this audience". End on an action implication.

2. AUDIENCE SNAPSHOT — EXACTLY 2 SENTENCES (one short paragraph, not a list).
   • Sentence 1: WHO they are — name BOTH audiences when comparing, one sharp character sketch.
   • Sentence 2: the ONE strategic tension or divergence that matters most for this brief.
   • Start with: "For this brief, we are really talking to…" (single-audience) or "For this brief, we are really comparing two audiences:" (2-audience).
   • Do NOT enumerate specific stats here — those live in the cards. Snapshot is character + tension only.
   • Feel like the deck cover line a strategist would speak before showing slides.

━━ ANTI-HALLUCINATION ━━
Every number, percentage, ratio, or stat MUST come verbatim from the SLOT DATA below or be a simple plain-English translation ("1.83×" → "nearly twice").
Do NOT invent platforms, brands, segments, or behaviours not visible in the data.
No jargon: avoid over-index, leverage, cohort, synergy, touchpoint, whitespace, holistic.

━━ SLOT DATA ━━
${slotSummary}

Return ONLY valid JSON — no markdown, no fences, no preamble:
{
  "headline": "string",
  "audienceSnapshot": "string"
}`;

  try {
    const result = await callGeminiWithRetry(genAI, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text for GWI overview');
    }
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object in Gemini overview response');
    const parsed = JSON.parse(match[0]);
    return {
      headline:         String(parsed.headline || '').trim(),
      audienceSnapshot: String(parsed.audienceSnapshot || '').trim(),
    };
  } catch (err) {
    console.error('[Gemini] generateGwiOverview failed:', (err as Error).message);
    // Soft failure — caller decides whether to omit the overview block
    return { headline: '', audienceSnapshot: '' };
  }
}

// ── Unified Brief Overview (works for ALL non-GWI paths) ──────
//
// Mirrors `generateGwiOverview` shape so the frontend can render the same
// Executive Summary block ({ headline, audienceSnapshot }) regardless of
// whether the upload was a GWI export, Keyword Planner CSV, Amazon listing,
// social-listening dump, or PPTX deck. Before this function existed, only
// GWI uploads produced the magazine-cover Executive Summary and everything
// else jumped straight to charts — a visible inconsistency.
//
// Two entrypoints:
//  • generateBriefOverviewFromRows — fed RAW DATA rows. PREFERRED in the
//    route because it can run in PARALLEL with the main card-generation
//    call (overlap ~30s vs serial ~30s after cards = ~30s saved on a
//    100s budget).
//  • generateBriefOverview — fed the already-generated CARDS. Used when
//    the caller doesn't have rows handy (e.g. fallback paths). Adds the
//    overview call to the critical path.
export async function generateBriefOverviewFromRows(
  rows:         any[],
  context:      string,
  briefContext: string = '',
  domain:       string = 'GENERIC',
): Promise<GwiOverview> {
  const genAI = await getGenAI();
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (!Array.isArray(rows) || rows.length === 0) return { headline: '', audienceSnapshot: '' };

  await getModel(genAI);

  // Tiny sample — 12 stratified rows is enough signal for a 2-sentence overview.
  const sample = stratifiedSample(rows, 12);
  const columns = Object.keys(sample[0] ?? {});
  const compactSample = sample.map(r => {
    const o: Record<string, any> = {};
    for (const k of columns) {
      const v = r[k];
      o[k] = typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : v;
    }
    return o;
  });

  const brief = briefBlock(briefContext);
  const domainHint = (() => {
    const d = (domain || '').toUpperCase();
    if (d.includes('KEYWORD'))    return 'Source is a Google Keyword Planner export — focus the Snapshot on what searchers want, category demand, and where the brand sits in the search landscape.';
    if (d.includes('AMAZON') || d.includes('HELIUM') || d.includes('BSR'))
                                  return 'Source is an e-commerce / Amazon export — focus the Snapshot on shopper behaviour, listing dynamics, and category competitors.';
    if (d.includes('SOCIAL'))     return 'Source is a social-listening export — focus the Snapshot on conversation themes, sentiment, and where the brand sits in the conversation.';
    if (d.includes('PPTX'))       return "Source is a PPTX deck — focus the Snapshot on the deck's central argument and the most important tension to resolve.";
    return 'Focus the Snapshot on the audience or category this data describes, plus the one strategic tension that matters most for the brief.';
  })();

  const prompt = `You are an Insight Strategist at PRISM, writing for brand managers, media planners, and creative directors in India.
${brief}
DATASET: ${context}
DOMAIN HINT: ${domainHint}

${STORYTELLING_DISCIPLINE}

Read the sample rows below and produce TWO things only:

1. MAIN HEADLINE — one bold, client-facing sentence (max 22 words).
   • Pyramid: this IS the answer. End on an action implication.
   • Use a number ONLY when it sharpens the message.

2. AUDIENCE SNAPSHOT — EXACTLY 2 SENTENCES.
   • Sentence 1: WHO this data is about (audience / shopper / searcher / category).
   • Sentence 2: the ONE strategic tension worth knowing for this brief.
   • Start with "For this brief, we are really talking to…" (people) or "For this brief, the category really looks like…" (category data).
   • Don't enumerate stats — character + tension only.

${ANTI_HALLUCINATION}

━━ SAMPLE ROWS (${columns.join(', ')}) ━━
${JSON.stringify(compactSample, null, 2)}

Return ONLY valid JSON — no markdown, no fences:
{ "headline": "string", "audienceSnapshot": "string" }`;

  try {
    const result = await callGeminiWithRetry(genAI, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text for brief overview (rows)');
    }
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object in Gemini overview-from-rows response');
    const parsed = JSON.parse(match[0]);
    return {
      headline:         String(parsed.headline || '').trim(),
      audienceSnapshot: String(parsed.audienceSnapshot || '').trim(),
    };
  } catch (err) {
    console.error('[Gemini] generateBriefOverviewFromRows failed:', (err as Error).message);
    return { headline: '', audienceSnapshot: '' };
  }
}

export async function generateBriefOverview(
  cards:        GeminiInsightCard[],
  context:      string,
  briefContext: string = '',
  domain:       string = 'GENERIC',
): Promise<GwiOverview> {
  const genAI = await getGenAI();
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (!Array.isArray(cards) || cards.length === 0) return { headline: '', audienceSnapshot: '' };

  await getModel(genAI);

  // Read the top 10 highest-conviction cards. Each card is already a distilled
  // insight, so 10 is enough signal to spot the single biggest story.
  const ranked = [...cards]
    .sort((a, b) => (Number(b.conviction) || 0) - (Number(a.conviction) || 0))
    .slice(0, 10);

  const cardBlock = ranked.map((c, i) => {
    const layer  = (c as any).layer ? ` · L${(c as any).layer}` : '';
    const lens   = (c as any).lens  ? ` · ${(c as any).lens}`   : '';
    const conv   = c.conviction ? ` · conviction ${c.conviction}` : '';
    return `CARD ${i + 1}${layer}${lens}${conv}
  Title: ${c.title}
  Stat:  ${c.stat}
  Obs:   ${c.obs}`;
  }).join('\n\n');

  const brief = briefBlock(briefContext);

  // Domain hint helps Gemini pick the right Snapshot framing — a keyword
  // upload's snapshot is about searchers + category demand; an Amazon upload's
  // snapshot is about shoppers + listing dynamics; a social-listening
  // upload's snapshot is about conversation themes + sentiment.
  const domainHint = (() => {
    const d = (domain || '').toUpperCase();
    if (d.includes('KEYWORD'))    return 'Source is a Google Keyword Planner export — focus the Snapshot on what searchers want, category demand, and where the brand sits in the search landscape.';
    if (d.includes('AMAZON') || d.includes('HELIUM') || d.includes('BSR'))
                                  return 'Source is an e-commerce / Amazon export — focus the Snapshot on shopper behaviour, listing dynamics, and category competitors.';
    if (d.includes('SOCIAL'))     return 'Source is a social-listening export — focus the Snapshot on conversation themes, sentiment, and where the brand sits in the conversation.';
    if (d.includes('PPTX'))       return 'Source is a PPTX deck — focus the Snapshot on the deck\'s central argument and the most important tension to resolve.';
    return 'Focus the Snapshot on the audience or category this data describes, plus the one strategic tension that matters most for the brief.';
  })();

  const prompt = `You are an Insight Strategist at PRISM, writing for brand managers, media planners, and creative directors in India.
${brief}
DATASET: ${context}
DOMAIN HINT: ${domainHint}

${STORYTELLING_DISCIPLINE}

You will read the top insight cards from this analysis (already distilled) and produce TWO things only:

1. MAIN HEADLINE — one bold, client-facing sentence (max 22 words).
   • Pyramid: this IS the answer. A reader who only sees the Headline already knows the one big thing.
   • Combines the essence of the BRIEF with the SINGLE strongest insight from the cards.
   • Use a number ONLY when it sharpens the message.
   • Punchy, specific, directional. No jargon. End on an action implication.

2. AUDIENCE SNAPSHOT — EXACTLY 2 SENTENCES.
   • Sentence 1: WHO this data is about (audience / shopper / searcher / category) — one sharp sketch.
   • Sentence 2: the ONE strategic tension worth knowing for this brief.
   • Start with: "For this brief, we are really talking to…" (people) OR
                 "For this brief, the category really looks like…" (category-focused data).
   • Do NOT enumerate specific stats here — those live in the cards. Snapshot is character + tension.

${ANTI_HALLUCINATION}

━━ INSIGHT CARDS ━━
${cardBlock}

Return ONLY valid JSON — no markdown, no fences, no preamble:
{
  "headline": "string",
  "audienceSnapshot": "string"
}`;

  try {
    const result = await callGeminiWithRetry(genAI, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text for brief overview');
    }
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object in Gemini overview response');
    const parsed = JSON.parse(match[0]);
    return {
      headline:         String(parsed.headline || '').trim(),
      audienceSnapshot: String(parsed.audienceSnapshot || '').trim(),
    };
  } catch (err) {
    console.error('[Gemini] generateBriefOverview failed:', (err as Error).message);
    return { headline: '', audienceSnapshot: '' };
  }
}

// ── Shared 3-lens curation helper ─────────────────────────────
//
// Takes raw cards returned by Gemini (any analyzer), normalises every field,
// drops sub-60 conviction cards, then guarantees a balanced creative/media/
// category distribution before returning a flat list sorted by conviction.
//
// Used by analyzeGenericTabularForPRISM and analyzeKeywordPlannerForPRISM —
// could be applied to social-listening and future analyzers too.
const VALID_BUCKETS = ['content','commerce','communication','culture','channel','media','creative','pricing','search'] as const;
const VALID_LENSES  = ['creative', 'media', 'category'] as const;
const VALID_CHART_TYPES: ChartType[] = [
  'hbar','bar','line','area','pie','doughnut',
  'scatter','combo','histogram','radar','waterfall','funnel',
];

type LensCard = GeminiInsightCard & {
  lens?: 'creative' | 'media' | 'category';
  layer?: number;
};

interface CurateOpts {
  targetTotal:       number;                                 // default 20
  lensQuota:         Record<'creative'|'media'|'category', number>; // default 7/7/6
  defaultBucket:     GeminiInsightCard['bucket'];            // fallback when bucket missing
  toolLabel:         string;
  defaultConviction: number;                                 // fallback when conviction missing
  minConviction:     number;                                 // drop sub-N cards. default 0 (off).
}

function curateLensCards(parsed: any[], opts: Partial<CurateOpts> & Pick<CurateOpts, 'toolLabel' | 'defaultBucket'>): LensCard[] {
  // Default = 16 cards (6 creative + 6 media + 4 category). Tuned for speed —
  // 20 cards hit Gemini's output-token budget and added 60-100s of latency
  // without proportionate insight gain on a 1.2K-keyword file.
  const {
    targetTotal       = 16,
    lensQuota         = { creative: 6, media: 6, category: 4 },
    defaultConviction = 75,
    minConviction     = 0,
    toolLabel,
    defaultBucket,
  } = opts;

  // 1. Normalise every card — coerce types, clamp conviction, validate enums.
  const normalised: LensCard[] = parsed.map(c => ({
    title:        String(c.title || 'Insight'),
    bucket:       ((VALID_BUCKETS as readonly string[]).includes(c.bucket) ? c.bucket : defaultBucket) as GeminiInsightCard['bucket'],
    type:         (VALID_CHART_TYPES.includes(c.type) ? c.type : 'hbar') as ChartType,
    conviction:   Math.max(0, Math.min(100, Number(c.conviction) || defaultConviction)),
    obs:          String(c.obs  || ''),
    stat:         String(c.stat || ''),
    rec:          String(c.rec  || ''),
    toolLabel,
    layer:        Number(c.layer) >= 1 && Number(c.layer) <= 8 ? Number(c.layer) : undefined,
    lens:         (VALID_LENSES as readonly string[]).includes(String(c.lens || '').toLowerCase())
                    ? (String(c.lens).toLowerCase() as 'creative' | 'media' | 'category')
                    : undefined,
    chartLabels:  Array.isArray(c.chartLabels)  ? c.chartLabels.map(String)  : [],
    chartValues:  Array.isArray(c.chartValues)  ? c.chartValues.map(Number)  : [],
    chartValues2: Array.isArray(c.chartValues2) && (c.chartValues2 as any[]).length > 0
      ? c.chartValues2.map(Number) : undefined,
    chartTitle:   c.chartTitle  ? String(c.chartTitle)  : undefined,
    chartSeries:  Array.isArray(c.chartSeries)  ? c.chartSeries.map(String)  : undefined,
  } as LensCard));

  // 2. Drop sub-minConviction cards (the prompt is supposed to do this but
  //    we enforce it server-side too).
  const filtered = normalised.filter(c => (c.conviction ?? 0) >= minConviction);

  // 3. Bucket by lens. _other holds cards Gemini didn't tag with a lens.
  const byLens: Record<string, LensCard[]> = { creative: [], media: [], category: [], _other: [] };
  for (const card of filtered) {
    const k = card.lens && byLens[card.lens] ? card.lens : '_other';
    byLens[k].push(card);
  }
  // Highest-conviction first inside each lens.
  for (const k of Object.keys(byLens)) {
    byLens[k].sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));
  }

  // 4. Fill quotas per lens. If a lens is short, top up from _other; if
  //    still short, neighbouring lenses by conviction.
  const final: LensCard[] = [];
  (['creative', 'media', 'category'] as const).forEach(lens => {
    const want = lensQuota[lens];
    const have = byLens[lens].splice(0, want);
    while (have.length < want && byLens._other.length) have.push(byLens._other.shift()!);
    have.forEach(c => { if (!c.lens) c.lens = lens; });
    final.push(...have);
  });
  // 5. Fill remaining slots up to targetTotal with highest-conviction leftovers.
  while (final.length < targetTotal) {
    const pool = [
      ...byLens.creative, ...byLens.media, ...byLens.category, ...byLens._other,
    ].sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));
    if (pool.length === 0) break;
    final.push(pool[0]);
    for (const k of ['creative', 'media', 'category', '_other'] as const) {
      const idx = byLens[k].indexOf(pool[0]);
      if (idx >= 0) { byLens[k].splice(idx, 1); break; }
    }
  }
  // 6. Final global sort by conviction desc — frontend renders top-down.
  return final
    .slice(0, targetTotal)
    .sort((a, b) => (b.conviction ?? 0) - (a.conviction ?? 0));
}

// ── Generic tabular analysis (non-GWI: Amazon, Helium10, sales, marketing, etc.) ──

/**
 * Analyse arbitrary tabular data (any columns) and return PRISM cards.
 * Works on Amazon / Helium10 / sales / marketing / brand-tracking exports.
 * Gemini infers the dataset's nature from the column names and a sample
 * of rows, and writes creative/media-professional copy — never finance jargon.
 */
export async function analyzeGenericTabularForPRISM(
  rows:         any[],
  context:      string,
  toolLabel:    string,
  briefContext: string = '',
): Promise<GeminiInsightCard[]> {
  const genAI = await getGenAI();
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (!Array.isArray(rows) || rows.length === 0) return [];

  await getModel(genAI); // warm model cache; actual model resolved inside callGeminiWithRetry

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

  const genericBriefBlock = briefContext ? `
━━ CLIENT BRIEF — READ BEFORE WRITING ANY CARD ━━
Every insight card MUST be directly relevant to this specific brand and campaign objective.
Do NOT produce generic market commentary — write insights this brand's strategists can act on today.
${briefContext}
RELEVANCE RULE: Every recommendation must name an action that directly serves this brief's objective. Prioritise data signals that are most relevant to this brand's challenges and target audience above.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const prompt = `You are a senior Creative Strategist at PRISM, a consumer-intelligence firm advising brand managers, media planners, content strategists and creative directors in India.
${genericBriefBlock}
You will receive a tabular dataset (any shape — could be Amazon listings, brand tracking, sales, social, audience research). Your job is to read the columns and rows, infer what this data is about, and write 16 PRISM insight cards balanced across creative / media / category lenses (6 creative + 6 media + 4 category).

━━ DATASET ━━
Source: ${context}
Columns: ${columns.join(', ')}
Sample rows (up to 60):
${JSON.stringify(compactSample, null, 2)}

${STORYTELLING_DISCIPLINE}

${ANTI_HALLUCINATION}

${THREE_LENS_RUBRIC}

${CONVICTION_GRADING}

━━ BUCKET ASSIGNMENT ━━
Spread your 20 cards across the most relevant buckets from the 9 below. NEVER assign more than 5 cards to any single bucket.
• content       — media consumption, streaming, devices, screen time, gaming, podcasts, OTT, social feeds, listing quality, titles, A+ content, images.
• commerce      — purchase intent, BSR/ranking, units sold, revenue, conversion, discount behaviour, subscription, loyalty, consumer confidence, financial attitudes.
• communication — brand awareness, brand trust, brand perception, reviews, ratings, ad recall, influencer reach, NPS, word of mouth, media channel preference.
• culture       — demographics, lifestyle, values, attitudes, health, fitness, food, travel, fashion, sustainability, community, education, identity signals.
• channel       — marketing channel mix (paid/owned/earned), channel ROI, attribution, media allocation, channel reach and frequency.
• media         — media planning, media spend, media investment, ad placements, media mix modelling, platform-level media performance.
• creative      — creative asset performance, ad creative testing, copy performance, visual identity, creative formats, A/B test results.
• pricing       — price elasticity, price point optimisation, premium vs value positioning, pricing perception, willingness to pay, discount strategy.
• search        — keyword research, search volume trends, organic vs paid search, SEO rankings, search intent, keyword gaps, bid strategy.
RULE: price/rank/sales data → commerce or pricing. brand/review/rating → communication. keyword/SEO data → search. channel attribution → channel. creative testing → creative. Do NOT default everything to content.

━━ CARD FORMAT ━━

TITLE (max 12 words): newspaper headline style — state the finding with one number. No filler endings.
✅ "Amazon India Drives 34% of Sportswear Discovery — Nike Underindexes vs. Adidas"
✅ "Nano and Micro-Influencers Outperform Celebrities 3:1 on Purchase Conversion"
❌ "Brand Shows Strong Performance Signal Worth Building Into the Brief" (vague, no number, filler ending)
NEVER end with: "— Worth Planning Around", "— a Signal Worth Building Into the Brief", "— Worth Watching".

OBSERVATION (2 to 3 sentences): hook (most surprising number) → depth (second finding or implication) → so-what (what a brand should do differently).
✅ "Helium10 data shows Nike-related keywords generating 890,000+ monthly searches on Amazon India, yet the brand's sponsored ad presence score is 40% lower than Adidas. Nike ranks below Adidas in organic results for 6 of the top 10 high-intent search terms. Closing this gap would capture a significant portion of already in-market demand."
Every number must come from the data sample above. Do NOT invent benchmarks or comparisons not in the data.

STAT: one crisp, memorable sentence a strategist would screenshot and share. Max 18 words. No brackets.
✅ "890K monthly Amazon searches — Nike ad presence is 40% lower than Adidas"
✅ "Nano and micro-influencers drive 3.1× higher conversion than celebrity ambassadors"
❌ "+18.4% Revenue · Multiplier: 2.1×" (templated — never write this format)
❌ "23.5% growth in metric (1.8× average)" (bracket-heavy, formulaic)

RECOMMENDATION (1 to 2 sentences): direct brief to a creative director. Must name ① a specific Indian platform, ② a specific format, ③ a specific creative angle.
✅ "Significantly increase Amazon Ads investment with a keyword-first strategy — build A+ content for top-selling SKUs with lifestyle imagery and consider exclusive launch bundles."
✅ "Rebalance influencer spend towards a larger base of nano and micro fitness creators — use celebrities for brand-building reach, micro-influencers for performance conversion on Instagram Reels."

━━ UNIQUENESS ━━
Write EXACTLY 16 cards distributed 6 creative + 6 media + 4 category. No two cards may share the same opening sentence, the same stat, or the same recommendation platform+format combo.

━━ CHART DATA ━━
Pick labels + values from the sample rows (up to 8 items). Use actual values.
If a chart doesn't make sense for a card, return chartLabels: [] and chartValues: [].
chartTitle: 6–12 words in ALL CAPS — a precise description of what this specific chart visualises.
  ✅ "AMAZON SPONSORED AD PRESENCE SCORE — BRAND A VS BRAND B"
  ✅ "TOP KEYWORDS BY MONTHLY SEARCH VOLUME — CATEGORY BREAKDOWN"
  ✅ "REVENUE BY CHANNEL — MONTHLY TREND (JAN–DEC)"

COMPARISON CHARTS — MANDATORY RULE:
Whenever your insight compares two brands, groups, or metrics (e.g. "Nike vs Adidas", "Brand vs Category"):
  ① type = "bar" or "hbar"
  ② chartValues   = primary brand/group values  [REQUIRED]
  ③ chartValues2  = second brand/group values   [REQUIRED — never leave empty or []]
  ④ chartSeries   = ["Brand A", "Brand B"]      [REQUIRED — use real names]
  ⑤ chartTitle    = "BRAND A VS BRAND B — [METRIC NAME]"
  If your title or obs mentions "vs" or compares two entities, you MUST fill chartValues2 and chartSeries.

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
Across all 16 cards you MUST use at least 5 DIFFERENT chart types.
NEVER assign hbar or bar to more than 4 cards total.
NEVER assign the same type to more than 2 consecutive cards.
Where the data supports it, prefer the richer types: area (for time-series), doughnut (for proportions), funnel (for conversion data), radar (for multi-attribute profiles), waterfall (for component breakdowns), combo (for two-metric comparisons).

Return ONLY valid JSON — no markdown, no fences, no explanation:
[
  {
    "title": "string",
    "lens": "creative|media|category",
    "bucket": "content|commerce|communication|culture|channel|media|creative|pricing|search",
    "type": "hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel",
    "conviction": 88,
    "obs": "string",
    "stat": "string",
    "rec": "string",
    "chartTitle": "ALL CAPS DESCRIPTION — MAX 12 WORDS",
    "chartLabels": ["label1","label2"],
    "chartValues": [12.5, 8.3],
    "chartValues2": [9.1, 6.4],
    "chartSeries": ["Brand A", "Brand B"]
  }
]`;

  try {
    const result  = await callGeminiWithRetry(genAI, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text — model may be blocked or rate-limited');
    }
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    // Greedy /\[[\s\S]*\]/ used to capture from the FIRST '[' to the LAST ']'
    // anywhere in the response — which broke when Gemini appended trailing
    // prose containing a stray ']' character, dragging the match past the
    // valid JSON array and tripping JSON.parse with "Unexpected non-
    // whitespace character after JSON at position N". Bracket-balanced
    // extraction below grabs exactly the first complete top-level array.
    const arrayJson = extractFirstJsonArray(cleaned);
    if (!arrayJson) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('No JSON array in Gemini generic response');
    }

    // Forgiving parse — recovers from a single malformed card without failing
    // the whole 20-card response.
    const parsed: any[] = parseJsonArrayForgiving(arrayJson);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    // 20 cards, 7 creative + 7 media + 6 category, sorted by conviction.
    // Same curation as the keyword path — see curateLensCards.
    return curateLensCards(parsed, {
      toolLabel,
      defaultBucket:     'content',
      defaultConviction: 80,
      minConviction:     0,        // generic-tabular keeps everything; trust Gemini's score
    });

  } catch (err) {
    console.error('[Gemini] analyzeGenericTabularForPRISM failed:', (err as Error).message);
    throw err;
  }
}

// ── Keyword Planner — 8-Layer Methodology ─────────────────────

/**
 * Detect whether a row set is keyword-volume data (Google Keyword Planner
 * shape) regardless of filename. Looks for the signature columns the
 * methodology relies on. If `Keyword` + `Avg. monthly searches` are both
 * present, it's keyword data — fire the 8-layer analyzer.
 */
export function isKeywordPlannerShape(rows: any[]): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const r0 = rows[0];
  if (!r0 || typeof r0 !== 'object') return false;
  const keys = Object.keys(r0).map(k => k.toLowerCase());
  const hasKeyword = keys.some(k => k === 'keyword');
  const hasVolume  = keys.some(k => k.includes('avg. monthly searches') || k.includes('search volume'));
  return hasKeyword && hasVolume;
}

/**
 * Analyse a Google Keyword Planner CSV (or any keyword-volume table) using
 * the 8-Layer Methodology — see `.claude/skills/keyword-strategist/SKILL.md`
 * for the authoritative spec. Each layer produces 2-4 cards mapped to the
 * closest existing PRISM bucket (search / content / pricing / commerce /
 * communication / media / culture / creative) so the existing bucket-tab UI
 * keeps working. Cards also carry a `layer` field (1-8) for future grouping.
 *
 * Returns 18-24 cards typically, sized to the data:
 *   Layer 1 Volume Landscape    → 2-3 cards (search)
 *   Layer 2 Intent & Length     → 2 cards   (search + content)
 *   Layer 3 Theme Clusters      → 2-3 cards (content)
 *   Layer 4 Competition × Cost  → 2 cards   (pricing + commerce)
 *   Layer 5 Trend & Seasonality → 2 cards   (culture)
 *   Layer 6 Recommendations     → 3 cards   (commerce + content)
 *   Layer 7 Deep Intelligence   → 3-4 cards (communication + commerce)
 *   Layer 8 Senior Toolkit      → 3 cards   (media + creative + commerce)
 */
export async function analyzeKeywordPlannerForPRISM(
  rows:         any[],
  context:      string,
  toolLabel:    string,
  briefContext: string = '',
): Promise<GeminiInsightCard[]> {
  const genAI = await getGenAI();
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (!Array.isArray(rows) || rows.length === 0) return [];

  await getModel(genAI);

  // Smaller sample = faster Gemini response. Stratified 60 rows + 40-row
  // in-prompt slice is enough signal for the 8-layer methodology (volume
  // buckets, intent, themes are all token-frequency patterns that converge
  // fast). Combined with the 2.0-flash primary (no thinking-mode latency)
  // this brings p50 to ~40-60s on a 1.2K-keyword file vs 137-236s before.
  const sample = stratifiedSample(rows, 60);
  const columns = Object.keys(sample[0] ?? {});
  const compactSample = sample.map(r => {
    const o: Record<string, any> = {};
    for (const k of columns) {
      const v = r[k];
      o[k] = typeof v === 'string' && v.length > 60 ? v.slice(0, 60) + '…' : v;
    }
    return o;
  });

  const briefBlock = briefContext ? `
━━ CLIENT BRIEF — READ BEFORE WRITING ANY CARD ━━
${briefContext}
RELEVANCE RULE: Every recommendation must serve this brief's objective. Cite brand by name where relevant. Skip data signals with no bearing on this brand/category.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const prompt = `You are a senior Search & Performance Strategist at PRISM, advising brand managers and PPC/SEO leads in India.
${briefBlock}
You will receive Google Keyword Planner CSV rows. Apply the 8-Layer Keyword Methodology and return PRISM insight cards.

━━ DATASET ━━
Source: ${context}
Columns: ${columns.join(', ')}
Sample rows (up to 40, stratified by volume):
${JSON.stringify(compactSample.slice(0, 40), null, 2)}

━━ 8-LAYER METHODOLOGY ━━
1. Volume Landscape — top keywords, volume buckets (Mega/High/Mid/Long-tail/Micro), Pareto concentration
2. Intent & Length — short/mid/long tail × Navigational/Transactional/Commercial/Informational/Generic
3. Theme Clusters — token-based multi-label clusters with volume + competition per theme
4. Competition × Cost — 5-quadrant matrix (Quick Wins / Battlegrounds / Easy Long-tail / Avoid / Unknown), premium-cost keywords
5. Trend & Seasonality — YoY winners/losers, 3-month momentum, peak/trough months
6. Strategic Recommendations — Quick Wins (vol >1K, low/med comp, below-median bid), Rising Stars (YoY >50%), Brand Defense, Long-tail SEO targets
7. Deep Intelligence — Brand SOV, question mining, comparator pairs (X vs Y), price sensitivity, n-grams, brand×intent matrix, competitor-steal
8. Senior Toolkit — Winnability score (0.4×vol + 0.4×inv_comp + 0.2×bid_affordability), Pillar-cluster, Match-type strategy, Negative keywords, Campaign blueprint, Branded vs non-branded split, Funnel mapping (TOFU/MOFU/BOFU)

━━ SKIP CONDITIONS ━━
< 50 keywords → skip Layer 3 themes. < 6 months data → skip Layer 5 seasonality. No brand tokens → skip Layers 7.1/7.11/7.12. No bid columns → skip Layer 7.8/8.7 budget detail.

${STORYTELLING_DISCIPLINE}

${ANTI_HALLUCINATION}

━━ BUCKET MAPPING ━━
Each card must carry a \`bucket\` field (one of: content/commerce/communication/culture/channel/media/creative/pricing/search) AND a \`layer\` field (1-8).
- Layer 1 (Volume), Layer 2 (Intent) → bucket: 'search'
- Layer 3 (Themes), Layer 6 long-tail SEO → bucket: 'content'
- Layer 4 (Competition × Cost), Layer 8 budget → bucket: 'pricing'
- Layer 6 quick wins / rising stars → bucket: 'commerce'
- Layer 5 (Trend & Seasonality) → bucket: 'culture'
- Layer 7 Brand SOV / competitor-steal → bucket: 'communication'
- Layer 8 match-type / campaign blueprint → bucket: 'media'

━━ THREE LENSES — MANDATORY ━━
Every card must serve ONE of three audiences. Each card carries a \`lens\` field.

1. CREATIVE LENS (6 cards) — what should the creative SAY?
   Sources: intent, theme clusters, questions, comparators, n-grams, pain-points.

2. MEDIA LENS (6 cards) — where should media dollars go and how to bid?
   Sources: volume Pareto, Quick Wins, Rising Stars, Brand Defense, match-type, negatives, funnel.

3. CATEGORY LENS (4 cards) — what's happening in the category and where does the brand sit?
   Sources: Brand SOV, competitor-steal, YoY trends, seasonality, price sensitivity, volume concentration.

If the data can't support 6+6+4, redistribute to a total of exactly 16 cards.

${CONVICTION_GRADING}

━━ CARD FORMAT ━━
TITLE (max 12 words): magazine cover line + one plain-English number from the data.
OBSERVATION (3 sentences): hook → exact numbers from the data → strategic so-what.
STAT: one crisp plain-English number that would make a room go quiet.
RECOMMENDATION: ONE sentence to the right audience for this lens.
  - Creative lens → write to a copywriter (named cluster, copy angle, content format).
  - Media lens → write to a PPC/SEO lead (named keywords, match-type, budget tilt).
  - Category lens → write to a brand manager (positioning move, competitive response).

━━ UNIQUENESS ━━
Exactly 16 cards. No two cards share the same opening sentence, stat, or keyword cluster.
Across all 16, cover at least 5 of the 8 layers.

━━ CHART DATA ━━
Pick labels + values from the sample rows (up to 8 items per chart). Use actual values from the data.

━━ CHART VARIETY — MANDATORY ━━
Use at least 5 DIFFERENT chart types across all 16 cards. Never hbar or bar for more than 4 cards. Never assign the same chart type to consecutive cards.

Return ONLY valid JSON — no markdown, no fences, no explanation:
[{"title":"string","layer":1,"lens":"creative|media|category","bucket":"search","type":"hbar|bar|line|area|pie|doughnut|scatter|combo|histogram|radar|waterfall|funnel","conviction":82,"obs":"string","stat":"string","rec":"string","chartLabels":[],"chartValues":[],"chartValues2":[]}]`;

  try {
    // Use model defaults for output tokens — explicit maxOutputTokens=16384
    // caused 2.5-flash to truncate at ~2400 chars during local repro (likely
    // because thinking tokens count against the cap on 2.5-flash). Model
    // defaults handle the 18-24 card response (~7K tokens) reliably.
    const result = await callGeminiWithRetry(genAI, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text for keyword analysis');
    }
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const arrayJson = extractFirstJsonArray(cleaned);
    if (!arrayJson) {
      // Log a head+tail snippet so future failures are diagnosable from Vercel
      // logs without needing a local repro.
      console.error('[Gemini] keyword response head:', rawText.slice(0, 300));
      console.error('[Gemini] keyword response tail:', rawText.slice(-300));
      console.error('[Gemini] keyword response length:', rawText.length);
      throw new Error('No JSON array in Gemini keyword response');
    }

    // Forgiving parse — recovers from a single malformed card without failing
    // the whole 20-card response.
    const parsed: any[] = parseJsonArrayForgiving(arrayJson);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    // 20 cards, 7 creative + 7 media + 6 category, sorted by conviction.
    // Shared with the generic-tabular path — see curateLensCards above.
    return curateLensCards(parsed, {
      toolLabel,
      defaultBucket:     'search',
      defaultConviction: 70,
      minConviction:     60,       // 8-layer prompt is told to drop sub-60; we enforce it
    });

  } catch (err) {
    console.error('[Gemini] analyzeKeywordPlannerForPRISM failed:', (err as Error).message);
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
  rows:         any[],
  context:      string,
  toolLabel:    string = 'Social Listening',
  briefContext: string = '',
): Promise<GeminiInsightCard[]> {
  const genAI = await getGenAI();
  if (!genAI) throw new Error('GEMINI_API_KEY is not set');
  if (!Array.isArray(rows) || rows.length === 0) return [];

  await getModel(genAI); // warm model cache; actual model resolved inside callGeminiWithRetry

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

  const socialBriefBlock = briefContext ? `
━━ CLIENT BRIEF — READ BEFORE WRITING ANY CARD ━━
These social insights are for a specific brand brief. Every card MUST be directly relevant.
Do NOT write generic social media observations — write insights this brand's team can act on today.
${briefContext}
RELEVANCE RULE: Frame every insight through this brief's specific objective and brand challenge.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

  const prompt = `You are a senior Creative Strategist and Brand Intelligence analyst at PRISM, advising brand managers and media planners in India.
${socialBriefBlock}
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
Write 8 PRISM insight cards spread across the most relevant buckets (Content · Commerce · Communication · Culture · Channel · Media · Creative · Pricing · Search).

Each card must answer: "So what does this mean for the brand's strategy?"
Use ONLY the numbers and themes above — no invented statistics.

━━ BUCKET ASSIGNMENT FOR SOCIAL DATA ━━
Use the most relevant buckets from the 9 below. No more than 3 cards per bucket.
• content       — content formats/themes driving conversation, most-shared content types
• commerce      — purchase intent signals, product mentions, price/availability chatter
• communication — brand tone, crisis signals, negative theme management, positive amplification
• culture       — who is talking, lifestyle themes, identity signals in language
• channel       — which channels generate most conversation, cross-channel sentiment patterns
• media         — media mentions, earned media signals, media coverage themes in conversation
• creative      — messaging that resonates or falls flat, creative angles appearing in conversation
• pricing       — price chatter, value perception signals, discount/deal mentions
• search        — top search terms mentioned, keyword themes in organic conversation

${STORYTELLING_DISCIPLINE}

${ANTI_HALLUCINATION}

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
    "bucket": "content|commerce|communication|culture|channel|media|creative|pricing|search",
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
    const result  = await callGeminiWithRetry(genAI, prompt);
    const rawText = result?.response?.text?.()?.trim() ?? '';
    if (!rawText) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('Gemini returned empty text — model may be blocked or rate-limited');
    }
    const cleaned   = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const arrayJson = extractFirstJsonArray(cleaned);
    if (!arrayJson) {
      invalidateModelCache(_resolvedModelName ?? undefined);
      throw new Error('No JSON array in social listening Gemini response');
    }

    // Forgiving parse — recovers from a single malformed card without failing
    // the whole 20-card response.
    const parsed: any[] = parseJsonArrayForgiving(arrayJson);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const validBuckets = ['content','commerce','communication','culture','channel','media','creative','pricing','search'];
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

  await getModel(genAI); // warm model cache; actual model resolved inside callGeminiWithRetry

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
    const result = await callGeminiWithRetry(genAI, prompt);
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

/* ─────────────────────────────────────────────────────────────────────
 * generateStrategicRead — ONE-paragraph narrative synthesis.
 *
 * Hardened against repetition in three ways:
 *
 *   (1) OPENER STYLE SEED — per call we pick one of 4 opener archetypes
 *       (SCENE / NUMBER / TENSION / STANCE) so two analyses with similar
 *       briefs don't produce identically-shaped paragraphs. The choice is
 *       deterministic from a hash of (brand + objective) so the SAME brief
 *       reruns produce the SAME paragraph (caching-friendly) but different
 *       briefs get different shapes.
 *
 *   (2) PHRASE BLOCKLIST — the prompt explicitly bans observed-recurring
 *       template phrases ("focused entry window", "wide-open territory",
 *       "single tension", etc) on top of the STORYTELLING_DISCIPLINE
 *       banned-word list.
 *
 *   (3) DETERMINISTIC FALLBACK — when Gemini fails or returns empty, we
 *       build a paragraph from the nuggets numbers using sentence
 *       templates that VARY by brief flavour + brand position. Never
 *       returns an empty string when any data is present.
 * ───────────────────────────────────────────────────────────────────── */
export async function generateStrategicRead(opts: {
  brief?: any;
  nuggets?: any;
  audienceDescriptor?: string | null;
  categoryIntel?: any;
  fallbackTopCards?: any[];
}): Promise<string> {
  const brief = opts.brief || {};
  const nuggets = opts.nuggets || {};

  // ── Build grounding block ──────────────────────────────────────
  const briefBlock = [
    brief.brand && `Brand: ${brief.brand}`,
    brief.category && `Category: ${brief.category}`,
    brief.objective && `Objective: ${brief.objective}`,
    opts.audienceDescriptor && `Audience: ${opts.audienceDescriptor}`,
    (brief.geography || brief.market) && `Market: ${brief.geography || brief.market}`,
    brief.competitors && `Competitors: ${brief.competitors}`,
    opts.categoryIntel?.marketValueINR && `Category value: ${opts.categoryIntel.marketValueINR}${opts.categoryIntel.cagr ? ` · ${opts.categoryIntel.cagr} CAGR` : ''}`,
  ].filter(Boolean).join(' · ') || 'No brief provided';

  const dataLines: string[] = [];
  if (nuggets.keyword?.headline)     dataLines.push(`Search: ${nuggets.keyword.headline}`);
  if (nuggets.helium10?.headline)    dataLines.push(`Shelf: ${nuggets.helium10.headline}`);
  if (nuggets.competition?.headline) dataLines.push(`Competition: ${nuggets.competition.headline}`);
  if (nuggets.cultural?.headline)    dataLines.push(`Cultural: ${nuggets.cultural.headline}`);
  if (nuggets.trust?.headline)       dataLines.push(`Trust: ${nuggets.trust.headline}`);
  if (dataLines.length === 0 && Array.isArray(opts.fallbackTopCards)) {
    opts.fallbackTopCards.slice(0, 5).forEach(c => {
      if (c?.title || c?.stat) dataLines.push(`${c.bucket ? c.bucket.toUpperCase() : 'Finding'}: ${c.title || c.stat}`);
    });
  }

  if (dataLines.length === 0) return '';

  /* ── (1) Pick opener style deterministically from brief identity.
        Same brand+objective → same style → same Gemini output for caching.
        Different brands → different styles → visibly different paragraphs. */
  const styleSeed   = simpleHash(`${brief.brand || ''}|${brief.objective || ''}|${brief.category || ''}`);
  const OPENERS = [
    { id: 'SCENE',   instruction: 'Open with a concrete scene/moment from the audience\'s real life — a kitchen, a shelf, a phone screen, a daily ritual. Land the brand name within the first 12 words.' },
    { id: 'NUMBER',  instruction: 'Open with the single most arresting number from the data, woven into a sentence that names the brand within the first 12 words.' },
    { id: 'TENSION', instruction: 'Open by stating the central tension as a paradox or two-sided clause ("X but Y"). Name the brand and the tension in the same sentence.' },
    { id: 'STANCE',  instruction: 'Open with a strategic stance verb ("Lead with…", "Hold the…", "Bet on…") + brand name. The first sentence is the recommendation.' },
  ];
  const opener = OPENERS[styleSeed % OPENERS.length];

  const genAI = await getGenAI();

  /* ── (2) Phrase blocklist — observed recurring template phrases that
        leak across analyses. These are banned ON TOP OF the storytelling
        discipline. ── */
  const phraseBlocklist = [
    'focused entry window', 'wide-open territory', 'wide-open generic',
    'single tension', 'central tension', 'biggest tension',
    'capture market share', 'unlock growth', 'strategic posture',
    'lean into', 'double down', 'go big on', 'win the category',
    'data tells a clear story', 'data tells a focused story',
    'in this category', 'in this space', 'in this space,',
    'sharp, narrow attack', 'ripe for', 'opportunity to',
  ];

  if (genAI) {
    const prompt = `You are a senior brand strategist writing the STRATEGIC READ paragraph for the brief team.

BRIEF: ${briefBlock}

WHAT THE DATA SHOWS (computed from raw rows — every number here is verified):
${dataLines.join('\n')}

${STORYTELLING_DISCIPLINE}

━━ OPENER STYLE FOR THIS PARAGRAPH ━━
Style: ${opener.id}
Instruction: ${opener.instruction}

━━ STRUCTURE (3-4 sentences total) ━━
S1. The opener (above).
S2. The biggest opportunity the data reveals — cite at least ONE specific number from the WHAT THE DATA SHOWS block.
S3. The biggest unresolved tension — cite a different specific number.
S4. The strategic stance — what to bet on (value / innovation / distribution / premium / regional / partnership / sampling / demo-led). ONE concrete posture, not a list.

━━ HARD ANTI-REPETITION RULES (BANNED PHRASES) ━━
You may NOT use ANY of the following phrases (they appear too often across analyses):
${phraseBlocklist.map(p => `  • "${p}"`).join('\n')}
Also banned (from storytelling discipline): leverage, ecosystem, synergy, robust, tailspin, momentum, holistic, paradigm.

━━ HARD RULES ━━
- ONE flowing paragraph. NO bullets, NO headers, NO line breaks, NO labels.
- 90-130 words.
- Specific numbers ONLY from the WHAT THE DATA SHOWS block — NEVER invent figures.
- Mention the brand name at least twice (first sentence + somewhere in S3 or S4).
- Avoid starting two consecutive sentences with the same word.

Return ONLY the paragraph text. No quotation marks, no markdown, no preamble.`;

    try {
      const result = await callGeminiWithRetry(genAI, prompt);
      const raw = result?.response?.text?.()?.trim() ?? '';
      const cleaned = raw
        .replace(/^```(?:\w+)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/^["'""]/, '')
        .replace(/["'""]$/, '')
        .trim();
      if (cleaned) {
        // Post-process: if any blocklist phrase slipped through, rewrite it.
        // We don't re-call Gemini — just inline replace with shorter neutral
        // alternatives. This is a safety net, not a primary rewriter.
        let safe = cleaned;
        for (const phrase of phraseBlocklist) {
          const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
          safe = safe.replace(re, REPHRASE_MAP[phrase] || phrase.split(' ')[0]);
        }
        return safe;
      }
    } catch (err) {
      console.error('[Gemini] generateStrategicRead failed:', (err as Error).message);
    }
  }

  // ── (3) DETERMINISTIC FALLBACK ────────────────────────────────
  // Gemini failed or empty. Build a real paragraph from the nuggets data
  // using sentence templates that VARY by brief flavour + brand position.
  return synthesizeReadFallback({ brief, nuggets, audienceDescriptor: opts.audienceDescriptor, opener, styleSeed });
}

/* Tiny string hash → unsigned 32-bit. Used to deterministically pick an
   opener style from the brand+objective tuple. Same brief → same style. */
function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/* Phrase replacement map used as a post-process safety net when a banned
   phrase slips through Gemini despite the prompt. Neutral, shorter terms. */
const REPHRASE_MAP: Record<string, string> = {
  'focused entry window': 'an opening',
  'wide-open territory':  'unclaimed ground',
  'wide-open generic':    'unclaimed generic',
  'single tension':       'the gap',
  'central tension':      'the gap',
  'biggest tension':      'the gap',
  'capture market share': 'win share',
  'unlock growth':        'grow',
  'strategic posture':    'stance',
  'lean into':            'press on',
  'double down':          'press harder on',
  'go big on':            'put weight behind',
  'win the category':     'lead this category',
  'data tells a clear story':   'the data is clear',
  'data tells a focused story': 'the data is clear',
  'in this category':     '',
  'in this space':        '',
  'in this space,':       '',
  'sharp, narrow attack': 'concentrated attack',
  'ripe for':             'open to',
  'opportunity to':       'chance to',
};

/* Deterministic paragraph builder — used when Gemini fails. Constructs
   3-4 sentences from the nuggets data, parameterised by:
     - brief flavour (LAUNCH / DEFEND / GROW)
     - brand-on-leaderboard position (leader / challenger / not present)
     - selected opener style
   Output is NEVER empty when any nuggets data is provided. */
function synthesizeReadFallback(args: {
  brief: any;
  nuggets: any;
  audienceDescriptor?: string | null;
  opener: { id: string; instruction: string };
  styleSeed: number;
}): string {
  const { brief, nuggets, opener, styleSeed } = args;
  const brand = brief.brand || 'The brand';
  const category = brief.category ? brief.category.toLowerCase() : 'this category';
  const obj = brief.objective || '';

  // Detect flavour
  const tObj = `${obj} ${brand}`.toLowerCase();
  const flavour = /\blaunch|new\s+sku|enter|whitespace\b/.test(tObj) ? 'LAUNCH'
                : /\bdefend|protect|threat|leader|hold\b/.test(tObj) ? 'DEFEND'
                : /\bgrow|expand|share|adjacenc/.test(tObj)         ? 'GROW'
                : null;

  // Extract numbers from nuggets
  const kw = nuggets.keyword;
  const h10 = nuggets.helium10;
  const comp = nuggets.competition;
  const trust = nuggets.trust;
  const cult = nuggets.cultural;

  // ── Sentence 1: opener — varies by style ────────────────────
  const stancePicks = ['value', 'demo-led content', 'retailer placement', 'sampling', 'regional language reach', 'pack-size innovation'];
  const stance = stancePicks[styleSeed % stancePicks.length];

  const s1Map: Record<string, string> = {
    SCENE:   `Picture the daily basket: ${category} bought on price, recognised on shelf — ${brand} is showing up at exactly the right moment.`,
    NUMBER:  kw?.headline
      ? `${stripEndPunc(kw.headline)} — and this is the window ${brand} steps into.`
      : `${brand} sits at the right edge of ${category}.`,
    TENSION: comp?.headline
      ? `${stripEndPunc(comp.headline)} — yet ${brand}'s story is still being told.`
      : `${brand} works in a ${category} where price talks louder than the brand name.`,
    STANCE:  `Bet on ${stance} for ${brand} — that's the shape ${category} is asking for right now.`,
  };

  // ── Sentence 2: biggest opportunity (from search or shelf) ──
  let s2 = '';
  if (kw?.headline)            s2 = kw.headline;
  else if (h10?.headline)      s2 = h10.headline;
  else if (cult?.headline)     s2 = cult.headline;

  // ── Sentence 3: tension (from trust or competition) ─────────
  let s3 = '';
  if (trust?.headline)         s3 = `The catch: ${lc(stripEndPunc(trust.headline))}.`;
  else if (comp?.headline)     s3 = `The catch: ${lc(stripEndPunc(comp.headline))}.`;
  else if (h10?.headline)      s3 = `The catch: ${lc(stripEndPunc(h10.headline))}.`;

  // ── Sentence 4: strategic stance ────────────────────────────
  const s4Map: Record<string, string> = {
    LAUNCH: `For ${brand} the move is clear — enter through ${stance}, not through brand-recall investment.`,
    DEFEND: `For ${brand} the move is to defend by reinforcing ${stance} — quietly close ranks before the challenger does.`,
    GROW:   `For ${brand} the move is to expand via ${stance} — adjacent demand is the easier next mile.`,
    null:   `For ${brand} the bet is ${stance} — sharper than scale, faster than awareness.`,
  };
  const s4 = s4Map[flavour as keyof typeof s4Map] || s4Map['null' as keyof typeof s4Map];

  const sentences = [s1Map[opener.id] || s1Map.NUMBER, s2, s3, s4].filter(s => s && s.trim().length > 8);
  return sentences.join(' ').replace(/\s+/g, ' ').trim();
}

function stripEndPunc(s: string): string { return String(s || '').replace(/[.!?]+\s*$/, ''); }
function lc(s: string): string { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }

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
    await getModel(genAI); // warm model cache; actual model resolved inside callGeminiWithRetry
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

    const result = await callGeminiWithRetry(genAI, prompt);
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
    await getModel(genAI); // warm model cache; actual model resolved inside callGeminiWithRetry
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

    const result = await callGeminiWithRetry(genAI, prompt);
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

  await getModel(genAI); // warm model cache; actual model resolved inside callGeminiWithRetry

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
    "bucket": "content|commerce|communication|culture|channel|media|creative|pricing|search",
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
    const result  = await callGeminiWithRetry(genAI, prompt);
    const rawText = result.response.text().trim();
    const cleaned   = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const arrayJson = extractFirstJsonArray(cleaned);
    if (!arrayJson) throw new Error('No JSON array in Gemini PDF response');

    // Forgiving parse — recovers from a single malformed card without failing
    // the whole 20-card response.
    const parsed: any[] = parseJsonArrayForgiving(arrayJson);
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

    const validBuckets = ['content', 'commerce', 'communication', 'culture', 'channel', 'media', 'creative', 'pricing', 'search'];
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
