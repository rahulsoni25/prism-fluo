/**
 * POST /api/ai/analyze-data
 *
 * Pre-processes raw rows into structured insight slots (exact data per slot),
 * then asks Gemini 2.5 to write narrative around those exact numbers only.
 *
 * Body:  { rows: object[], sheetName: string, fileNames?: string[] }
 * Reply: { insights: GeminiInsightCard[], slots: DataSlot[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { analyzeDataForPRISM, analyzeGenericTabularForPRISM, analyzeSocialListeningForPRISM, analyzeKeywordPlannerForPRISM, isKeywordPlannerShape, generateGwiOverview, generateBriefOverview, generateBriefOverviewFromRows, polishGeminiCards } from '@/lib/ai/gemini';
import type { GwiOverview } from '@/lib/ai/gemini';
import { synthesizeNuggets } from '@/lib/nuggets/synthesize';
import type { NuggetsSummary } from '@/lib/nuggets/synthesize';
import { analyzeWithOpenRouter, analyzeGenericWithOpenRouter, analyzeSocialWithOpenRouter } from '@/lib/ai/openrouter';
import type { DataSlot, GeminiInsightCard } from '@/lib/ai/gemini';
import { getPool } from '@/lib/db/client';

// Sequential Gemini batches: up to 3 × 38 s = 114 s worst case.
// Vercel Hobby max is 60 s — upgrade to Pro (300 s) is recommended for
// multi-file GWI uploads.  We set 300 here so Pro deployments get the full
// budget; Hobby deployments are capped at 60 s automatically by the platform.
export const maxDuration = 300;

// ── Column aliases ────────────────────────────────────────────
function col(row: any, ...keys: string[]): string {
  for (const k of keys) if (row[k] != null && row[k] !== '') return String(row[k]);
  return '';
}
function num(row: any, ...keys: string[]): number {
  for (const k of keys) { const v = parseFloat(String(row[k] ?? '')); if (!isNaN(v)) return v; }
  return 0;
}

// ── Question → PRISM bucket ───────────────────────────────────
// Order matters: Communication checked BEFORE Content so "social media brand"
// questions route to Communication, not the Content default.
function questionBucket(q: string): DataSlot['bucket'] {
  const t = q.toLowerCase();

  // ── COMMUNICATION — brand touchpoints, advertising, social signals, discovery ──
  if (
    /paid media|advert|discover|brand.rel|brand.action|brand.qual|advocacy|earned.media|word.of.mouth/.test(t) ||
    /brand.aware|brand.trust|brand.image|brand.percep|brand.sentiment|brand.affin|brand.equity/.test(t) ||
    /influenc|creator.market|ad.recall|net.promot|\bnps\b|social.media.attit|social.media.brand/.test(t) ||
    /brand.discov|discover.brand|brand.famil|brand.consider|brand.prefer/.test(t) ||
    /social.network.attit|platform.attit|media.channel|channel.prefer/.test(t)
  ) return 'communication';

  // ── COMMERCE — purchase intent, spending, financial, retail, pricing ──────
  if (
    /purchase|buy|shop|price|retailer|\bsale\b|ecomm|product.research|familiarity|purchase.driver|in.store|online.brand/.test(t) ||
    /income|mortgage|grocer|financ|saving|loan|credit|subscript|afford|discount|voucher|cashback/.test(t) ||
    /loyalty.prog|reward.point|consumer.confid|disposable|spend.habit|money.manage|financial.attit/.test(t) ||
    /\beco\b|product.categor|brand.switch|value.for.money|deal.seek/.test(t) ||
    // Payment + spending-behaviour trade-offs (Cash vs Card, Save Up vs Sacrifice)
    /cash.vs.card|pay.in.cash|pay.without|payment.method|cash.or.card/.test(t) ||
    /save.up.vs|sacrifice.spend|save.up.to.buy|sacrifice.other.spend/.test(t) ||
    // Acquisition mode (Ownership vs Access)
    /ownership.vs.access|own.vs.rent|rent.vs.buy|access.over.ownership|subscription.vs.purchase/.test(t) ||
    // Purchase preference (Products vs Experiences)
    /products?.vs.experiences?|experiential.spend|spend.on.experiences|experiences.over.product/.test(t)
  ) return 'commerce';

  // ── CULTURE — demographics, attitudes, lifestyle, values, identity ─────────
  if (
    /employ|household|children|vehicle|living.arrangement|\bpet\b|lifestyle|family|grandchild|age.child|properties.owned|number.child/.test(t) ||
    /attitude|values?|\bbelief|\bopinion|wellbeing|mental.health|physical.health/.test(t) ||
    /fitness|\bsport|\bexercis|\bhealth\b|food.habit|drink.habit|\btravel\b|holiday|vacation/.test(t) ||
    /fashion|style|\bbeauty\b|grooming|environment|sustainab|social.issue|politic|religion|spirit/.test(t) ||
    /community|education|\bcareer|work.life|life.goal|parenting|identity|demograph|hobbi/.test(t) ||
    /luxury.attit|social.cause|personal.value|cultural.identity|self.image/.test(t) ||
    // Identity + self-perception questions (Character Describes Consumer, Self-Perceptions)
    /character.describ|describes.consumer|self.percep|self.descrip|self.identif|how.you.see.yourself/.test(t) ||
    // Socio-economic class as a demographic identifier
    /socio.econom|socioeconomic|sec.class|sec.segment|class.segment|income.tier|income.bracket/.test(t) ||
    // Outlook + life satisfaction (Future Outlook Get Better/Worse)
    /future.outlook|outlook.get|outlook.improve|life.outlook|world.outlook|optimis|pessimis|life.satisfact/.test(t)
  ) return 'culture';

  // ── SEARCH — keyword research, SEO/SEM, search analytics ─────────────────
  if (
    /keyword|search.volume|search.rank|seo|sem|organic.search|paid.search/.test(t) ||
    /search.intent|search.trend|search.query|search.traffic|bid.strateg/.test(t) ||
    /google.search.consol|keyword.gap|keyword.research|search.optimis/.test(t)
  ) return 'search';

  // ── PRICING — price strategy, elasticity, pricing analytics ───────────────
  if (
    /price.elastic|price.point|price.strateg|price.optimis|price.percep/.test(t) ||
    /willingness.to.pay|premium.pric|value.pric|price.tier|price.sensitiv/.test(t)
  ) return 'pricing';

  // ── CHANNEL — channel attribution, media mix, channel ROI ─────────────────
  if (
    /channel.mix|channel.roi|channel.attrib|channel.alloc|omni.channel/.test(t) ||
    /cross.channel|paid.channel|owned.channel|earned.channel|channel.strateg/.test(t)
  ) return 'channel';

  // ── MEDIA — media planning, media spend, ad investment ────────────────────
  if (
    /media.plan|media.spend|media.invest|media.mix|media.alloc|media.buy/.test(t) ||
    /ad.spend|media.weight|media.schedule|media.optim/.test(t)
  ) return 'media';

  // ── CREATIVE — creative testing, ad creative performance ──────────────────
  if (
    /creative.test|creative.perform|ad.creative|creative.asset|copy.test/.test(t) ||
    /creative.format|visual.identity|a.b.test|split.test|creative.score/.test(t)
  ) return 'creative';

  // ── CONTENT — media consumption, devices, screen time, formats ────────────
  if (
    /device|owned.media|content.format|streaming|screen.time|television|\btv\b/.test(t) ||
    /gaming|\bgame\b|podcast|\bmusic\b|radio|internet.usage|digital.device|\bott\b/.test(t) ||
    /social.media(?!.attit)(?!.brand)|social.network(?!.attit)|messag.app|content.consumption/.test(t) ||
    /news.consumption|video.content|audio.content|reading.habit/.test(t)
  ) return 'content';

  return 'content'; // default — media consumption is the most common unclassified category
}

// ── Suggest best chart type for this question's data ─────────
// Uses both the question semantics AND data shape to pick the right visual.
function suggestChart(
  rowCount: number,
  rows:     DataSlot['rows'],
  question: string = '',
  isTwoAudience: boolean = false,
): DataSlot['chartSuggestion'] {
  const q = question.toLowerCase();

  // ── MANDATORY MAPPING RULES (top priority — no fallback) ──────────────

  // Rule A: Binary trade-off → doughnut.
  // Two attributes whose Audience % sum to ~100 (e.g. "Shop in-store" vs "Shop online",
  // "Pay in cash" vs "Pay without using cash"). Two-slice bars look weak; a doughnut
  // reads instantly as "she sides with X, not Y".
  // (2-audience caveat: still doughnut for now; renders the trade-off for
  // audience A. Paired side-by-side doughnuts are a follow-up.)
  if (rowCount === 2) {
    const sum = (rows[0]?.audiencePct ?? 0) + (rows[1]?.audiencePct ?? 0);
    if (sum >= 95 && sum <= 105) return 'doughnut';
  }

  // Rule B: Personas / segmentation → radar.
  // 5–8 attributes that describe segments, personas, or self-perception axes.
  // Plots the audience profile across all axes simultaneously.
  // For 2-audience comparisons the radar gets a second polygon (audience B)
  // instead of the 100-baseline — wired in build-gemini-chart-data.ts and
  // in enforceChartTypeRules below.
  if (/persona|segmentation|describes consumer|self.perception|character describes/i.test(q)
      && rowCount >= 5 && rowCount <= 8)
    return 'radar';

  // ── Semantic overrides (question topic takes priority over Rule C) ──────
  // These fire for BOTH single-audience and 2-audience uploads where the
  // chart type supports 2 series. For the types that DON'T support 2 series
  // (funnel, waterfall, histogram), we restrict them to single-audience.

  // Multi-attribute profile / attitude / lifestyle → radar (2-polygon-capable)
  // Promoted ABOVE Rule C so 2-audience attitude/lifestyle questions render
  // as paired radars instead of grouped bars — key chart-variety win.
  if (/attitude|value|lifestyle|personalit|psycho|dimension|profile|attribute|habit|charact|device|brand.qual|brand.rel/i.test(q)
      && rowCount >= 3 && rowCount <= 8)
    return 'radar';

  // Temporal / trend data → area (supports 2 lines via build-gemini-chart-data)
  if (/week|month|quarter|season|over time|trend|yearly|annual|growth|longitudinal/i.test(q))
    return 'area';

  // Single-audience-only semantic overrides — these chart types don't
  // visualise A vs B, so for 2-audience uploads we fall through to Rule C.
  if (!isTwoAudience) {
    // Purchase / conversion journey  → funnel (stages narrowing to outcome)
    if (/purchas|funnel|convert|journey|path.*buy|awareness.*intent|stage/i.test(q) && rowCount <= 8)
      return 'funnel';

    // Revenue / spend / budget component breakdown → waterfall
    if (/revenue|spend|budget|breakdown|bridge|contribut|cost.*break|decompos/i.test(q)
        && rowCount >= 3 && rowCount <= 10)
      return 'waterfall';

    // Distribution / frequency across ranges → histogram
    if (/distribut|frequenc|range|bucket|bracket|spread/i.test(q) && rowCount >= 4)
      return 'histogram';
  }

  // Rule C: Two-audience comparison default.
  // Dumbbell (one row per attribute, A and B dots connected by a gap line)
  // is the GWI-report-style choice for 4-10 attributes where the gap IS the
  // strategic message. Below 4 attrs, dumbbell looks sparse → grouped bar.
  // Above 10 attrs, dumbbell rows get too tall → grouped hbar.
  if (isTwoAudience) {
    if (rowCount >= 4 && rowCount <= 10) return 'dumbbell';
    return rowCount <= 7 ? 'bar' : 'hbar';
  }

  // ── Data-shape overrides ─────────────────────────────────────────────────

  // Very small set → doughnut (cleaner than pie for 3–5)
  if (rowCount <= 3) return 'pie';
  if (rowCount <= 5) return 'doughnut';

  // Good scatter signal: both audiencePct and index available on 4+ rows
  const hasGoodScatter = rows.filter(r => r.audiencePct > 0 && r.index > 80).length >= 4;
  if (hasGoodScatter && rowCount >= 6) return 'scatter';

  // Medium set → bar (vertical, clean)
  if (rowCount <= 7) return 'bar';

  // Large set with long category labels → horizontal bar
  return 'hbar';
}

// ── Build insight slots from raw rows ─────────────────────────
// Returns ALL slots (one per question group), sorted by Index signal strength.
// Caller decides how many to send per Gemini batch.
function buildInsightSlots(rows: any[]): DataSlot[] {
  // Normalise all row keys to lowercase+trimmed for case-insensitive column matching.
  // GWI exports vary: "Short Label Question" / "short label question" / "Attributes" / "ATTRIBUTES"
  const normRows = rows.map(r => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return r;
    const n: Record<string, any> = {};
    for (const k of Object.keys(r)) n[k.toLowerCase().trim()] = r[k];
    return n;
  });

  // 1. Group by question
  const groups: Record<string, any[]> = {};
  for (const row of normRows) {
    const q = col(row,
      'short label question', 'short_label_question',
      'question', 'time_bucket',
      'category', 'sheet',
    ) || 'General';
    if (!groups[q]) groups[q] = [];
    groups[q].push(row);
  }

  // ── Two-audience detection (parser stamps __audienceA / __audienceB
  // on every row of a comparison export — see parseGwiCore in
  // lib/uploads/handler.ts) ──────────────────────────────────────────
  const sampleMeta = normRows.find(r =>
    r && typeof r === 'object' && (r['__audiencea'] || r['__audienceb'])
  );
  const audienceALabel: string | undefined =
    sampleMeta?.['__audiencea'] ? String(sampleMeta['__audiencea']) : undefined;
  const audienceBLabel: string | undefined =
    sampleMeta?.['__audienceb'] ? String(sampleMeta['__audienceb']) : undefined;
  const isTwoAudience = !!(audienceALabel && audienceBLabel);

  // 2. For each question compute rows sorted by Index (high signal first).
  // For 2-audience uploads, the parser disambiguated metric columns with a
  // " (B)" suffix, which gets lowercased here to "audience % (b)" etc.
  const questions = Object.entries(groups).map(([question, qRows]) => {
    const parsed = qRows
      .map(r => {
        const audiencePct2 = isTwoAudience
          ? num(r, 'audience % (b)', 'audience_pct_b', 'audience%(b)')
          : 0;
        const dataPct2 = isTwoAudience
          ? num(r, 'data point % (b)', 'data_point_pct_b', 'datapoint%(b)')
          : 0;
        const index2 = isTwoAudience
          ? num(r, 'index (b)', 'index_score_b')
          : 0;
        const universe2 = isTwoAudience
          ? num(r, 'universe (b)')
          : 0;
        return {
          attr:        col(r, 'attributes', 'attribute', 'audience', 'label', 'name'),
          audiencePct: num(r, 'audience %', 'audience_pct', 'audience%'),
          dataPct:     num(r, 'data point %', 'data_point_pct', 'datapoint%'),
          index:       num(r, 'index', 'index_score'),
          universe:    num(r, 'universe'),
          // Only attach B fields when this slot is part of a 2-audience export;
          // single-audience consumers must keep seeing undefined.
          ...(isTwoAudience ? { audiencePct2, dataPct2, index2, universe2 } : {}),
        };
      })
      // Keep a row if EITHER audience has a real index signal — a strong
      // signal on audience B alone should still surface for comparison.
      .filter(r => r.attr && (r.index > 0 || ((r as any).index2 ?? 0) > 0))
      // Sort by the stronger of the two audiences so the most informative
      // attributes come first regardless of which side carries the signal.
      .sort((a, b) =>
        Math.max(b.index, (b as any).index2 ?? 0) -
        Math.max(a.index, (a as any).index2 ?? 0)
      );

    return {
      question,
      bucket: questionBucket(question),
      maxIndex: Math.max(parsed[0]?.index ?? 0, (parsed[0] as any)?.index2 ?? 0),
      // Send top 10 rows per slot (was 7) for richer Gemini context
      topRows: parsed.slice(0, 10),
      rowCount: parsed.length,
    };
  }).filter(q => q.topRows.length >= 2);

  // 3. Group by bucket, sort each group by signal strength
  const byBucket: Record<string, typeof questions> = {};
  for (const q of questions) {
    if (!byBucket[q.bucket]) byBucket[q.bucket] = [];
    byBucket[q.bucket].push(q);
  }

  // Enforce target distribution across all 9 PRISM buckets.
  // New buckets (channel/media/creative/pricing/search) get 1-2 slots each so they
  // contribute when the data supports them — GWI questions rarely match those patterns,
  // so their unfilled slots fall through to the overflow mechanism below.
  const MAX_SLOTS = 18;
  const TARGETS: Record<string, number> = {
    content:       3,
    communication: 2,
    culture:       2,
    commerce:      2,
    channel:       2,
    media:         2,
    creative:      2,
    pricing:       2,
    search:        1,
  }; // total = 18

  const BUCKET_ORDER = ['content', 'communication', 'culture', 'commerce',
                        'channel', 'media', 'creative', 'pricing', 'search'] as const;
  const distributed: typeof questions = [];
  for (const bucket of BUCKET_ORDER) {
    const sorted = (byBucket[bucket] ?? []).sort((a, b) => b.maxIndex - a.maxIndex);
    distributed.push(...sorted.slice(0, TARGETS[bucket]));
  }

  // Fill any remaining slots from questions not yet included, sorted by maxIndex
  const distributedKeys = new Set(distributed.map(q => q.question));
  const overflow = questions
    .filter(q => !distributedKeys.has(q.question))
    .sort((a, b) => b.maxIndex - a.maxIndex);

  return [...distributed, ...overflow].slice(0, MAX_SLOTS).map(q => ({
    bucket: q.bucket,
    question: q.question,
    chartSuggestion: suggestChart(q.rowCount, q.topRows, q.question, isTwoAudience),
    rows: q.topRows,
    // Carry 2-audience metadata onto every slot when the upload was a
    // comparison export. Downstream consumers (Gemini prompt, chart-data
    // builder, enforceChartTypeRules) branch on isTwoAudience to decide
    // whether to render comparison framing.
    ...(isTwoAudience ? { isTwoAudience: true, audienceALabel, audienceBLabel } : {}),
  }));
}

// Split slots into batches of batchSize for parallel Gemini calls
function chunkSlots(slots: DataSlot[], batchSize: number): DataSlot[][] {
  const batches: DataSlot[][] = [];
  for (let i = 0; i < slots.length; i += batchSize) {
    batches.push(slots.slice(i, i + batchSize));
  }
  return batches;
}

// ── Pure-data fallback: no Gemini, grounded in actual slot numbers ────────────
// Matches the prototype card style exactly:
//   Title  → stat-led headline, plain number, active language
//   Obs    → 3 sentences: punchy finding · second signal · strategic so-what
//   Stat   → pull-quote, plain English, no raw "Index N"
//   Rec    → specific Indian platform + format + creative angle
// conviction = 70 (lower than Gemini's 88–90) signals auto-analysis to the UI.

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

/** audience% → plain-English fraction  e.g. 48.6 → "nearly 1 in 2" */
function pctToWords(pct: number): string {
  if (pct >= 80) return 'more than 4 in 5';
  if (pct >= 70) return 'about 7 in 10';
  if (pct >= 60) return 'more than 3 in 5';
  if (pct >= 55) return 'more than half';
  if (pct >= 48) return 'nearly 1 in 2';
  if (pct >= 40) return 'about 2 in 5';
  if (pct >= 33) return 'about 1 in 3';
  if (pct >= 25) return 'about 1 in 4';
  if (pct >= 20) return 'about 1 in 5';
  if (pct >= 16) return 'roughly 1 in 6';
  if (pct >= 13) return 'roughly 1 in 7';
  if (pct >= 10) return 'about 1 in 10';
  return `${pct.toFixed(0)}%`;
}

/** GWI index → plain-English multiplier  e.g. 167 → "nearly 70% more likely than" */
function indexToWords(index: number): string {
  const m = index / 100;
  if (m >= 4.0) return `nearly ${Math.floor(m)} times more likely than`;
  if (m >= 3.0) return `more than three times as likely as`;
  if (m >= 2.5) return `more than twice as likely as`;
  if (m >= 2.0) return `twice as likely as`;
  if (m >= 1.75) return `nearly twice as likely as`;
  if (m >= 1.5)  return `one and a half times more likely than`;
  if (m >= 1.3)  return `about ${Math.round((m - 1) * 100)}% more likely than`;
  if (m >= 1.1)  return `around ${Math.round((m - 1) * 100)}% more likely than`;
  return `slightly more likely than`;
}

/**
 * Strip GWI attribute text into natural English:
 *   "I am using social media less than I used to" → "using social media less than before"
 *   "Challenging myself, (Important to me)"       → "challenging myself"
 *   "Other home/lifestyle interests"               → "home/lifestyle interests"
 */
function cleanAttrText(attr: string): string {
  return attr
    .replace(/,?\s*\([^)]*\)/g, '')   // remove "(Important to me)" etc.
    .replace(/^I am /i, '')            // "I am using…" → "using…"
    .replace(/^I /i,   '')             // "I prefer…"   → "prefer…"
    .replace(/^My /i,  '')             // "My income…"  → "income…"
    .replace(/^Other /i, '')           // "Other home…" → "home…"
    .replace(/ than I used to$/i, ' than before')
    .trim();
}

/**
 * Build a directional, action-signalling headline title.
 * Rules:
 *   1. Always include the multiplier or percentage — one hard number per title.
 *   2. End with a strategic gap / opportunity signal, not a neutral data statement.
 *   3. Never use "This Audience" (anonymous) — use "Your Audience" or the behaviour itself.
 *   4. Max ~12 words, newspaper headline rhythm.
 *
 * ✅ "1 in 3 of Your Audience Prefer Shopping Online — Close the Social-to-DTC Gap"
 * ✅ "Young Parents Over-Index 2.4× Here — An Underserved High-Value Segment"
 * ✅ "Health & Wellness Drives 1 in 4 — Lead With Fitness in Your Messaging"
 * ❌ "1 in 3 in This Audience Are Using Social Media Less Than Before" (no direction)
 * ❌ "Young Parents Make Up 12% of This Audience" (pure data, no signal)
 */
function buildTitle(attr: string, pctNum: string | null, multFmt: string, question?: string): string {
  const clean   = cleanAttrText(attr);
  const short   = clean.length > 40 ? clean.slice(0, 38) + '…' : clean;
  const wasIAm  = /^I am /i.test(attr);
  const wasVerb = /^I (am |)(using|watch|buy|prefer|trust|worry|think|feel|read|listen|spend|value|choos|believ|driv|own|follow|support|creat|shar|post|play|cook|exercis|travel)/i.test(attr);

  // Ordinal-only labels ("5th", "4th", "3rd") are SEC class codes — make them readable
  const isOrdinal = /^\d+(st|nd|rd|th)$/.test(attr.trim());
  if (isOrdinal) {
    const qCtx = question ? question.replace(/^which|^what|^how/i, '').trim().slice(0, 30) : 'segment';
    return pctNum
      ? `${pctNum} of Your Audience Are SEC ${attr} — ${multFmt} the National Average`
      : `SEC ${attr} Segment Over-Indexes ${multFmt} Here — A High-Value Targeting Opportunity`;
  }

  const frac = pctNum ? pctToWords(parseFloat(pctNum)) : null;
  const fracStr = frac && !frac.startsWith('about') && !frac.startsWith('roughly') ? frac : null;

  if (wasIAm || wasVerb) {
    // Verb-behaviour: state the scale + gap signal
    if (fracStr) return `${cap(fracStr)} of Your Audience Are ${cap(short)} — ${multFmt} the National Average`;
    if (pctNum)  return `${pctNum} of Your Audience Are ${cap(short)} — ${multFmt} the National Average`;
    return `Your Audience Over-Indexes ${multFmt} on ${cap(short)} — A Gap Worth Closing`;
  }

  // Persona (title-case, ≤ 3 words: "Young Parent", "Social Media Scroller")
  const words = attr.trim().split(/\s+/);
  if (words.length <= 3 && /^[A-Z]/.test(words[0])) {
    return pctNum
      ? `${attr}s Are ${pctNum} of Your Audience — ${multFmt} the National Average`
      : `${attr}s Over-Index ${multFmt} Here — High-Value, Underserved Segment`;
  }

  // Topic / interest — make the number lead, end with the strategic signal
  if (fracStr) {
    return `${cap(fracStr)} Prioritise ${cap(short)} — ${multFmt} the National Average`;
  }
  if (pctNum) {
    return `${pctNum} Prioritise ${cap(short)} — ${multFmt} Over the National Average`;
  }
  return `${cap(short)} Is ${multFmt} More Prevalent Here — Build It Into Your Strategy`;
}

/**
 * Build a named audience description from brief context.
 * Falls back to "target consumers in this market" if no brief.
 * e.g. "Nike 18–34 consumers in India" or "Adidas target segment across metros"
 */
function audienceLabel(brief: { brand?: string; age_ranges?: string; geography?: string } | null): string {
  if (!brief) return 'target consumers in this market';
  const parts: string[] = [];
  if (brief.brand)      parts.push(brief.brand);
  if (brief.age_ranges) parts.push(brief.age_ranges);
  parts.push('consumers');
  if (brief.geography)  parts.push(`in ${brief.geography}`);
  return parts.join(' ');
}

/**
 * Write observation S1 — names the audience from the brief, tells WHO does WHAT.
 */
function buildS1(
  attr: string,
  pctNum: string | null,
  pctFrac: string | null,
  multFmt: string,
  brief: { brand?: string; age_ranges?: string; geography?: string } | null = null,
): string {
  const clean   = cleanAttrText(attr);
  const label   = audienceLabel(brief);
  const wasVerb = /^I (am |)(using|watch|buy|prefer|trust|worry|think|feel|read|listen|spend|value|choos|believ|driv|own|follow|support|creat|shar|post|play|cook|exercis|travel)/i.test(attr);

  if (pctNum && wasVerb) {
    return `${pctNum} of ${label} are ${clean} — ${multFmt} the national average, and the strongest signal in this category.`;
  }
  if (pctNum) {
    return `${pctNum} of ${label} prioritise ${clean} — ${multFmt} the national average, making it the top signal in this dataset.`;
  }
  if (pctFrac) {
    return `${cap(pctFrac)} of ${label} lean strongly towards ${clean} — ${multFmt} the national average.`;
  }
  return `${cap(clean)} is the leading signal among ${label} — ${multFmt} the national average.`;
}

/**
 * Write observation S2 — names the second attribute with its % and multiplier.
 */
function buildS2(attr1: string, attr2: string, pct2Raw: number, index2: number): string {
  if (attr2 === attr1) {
    return `This pattern holds consistently across multiple attributes in this category, suggesting a deliberate audience orientation rather than an isolated data point.`;
  }
  const clean2   = cleanAttrText(attr2);
  const wasVerb2 = /^I /i.test(attr2);
  const pct2Str  = pct2Raw > 0 ? `${pct2Raw.toFixed(1)}%` : null;
  const mult2    = `${(index2 / 100).toFixed(1)}×`;

  // Vary the closing phrase so all cards don't end identically
  const closings = [
    'a pattern that confirms this is a deliberate audience orientation, not a one-off reading.',
    'together these signals point to a clear strategic opportunity worth building into the brief.',
    'the two signals reinforce each other — this is a consistent audience lean, not noise.',
    'this spread shows the category has depth beyond the headline number.',
  ];
  const closing = closings[Math.abs(attr1.length + attr2.length) % closings.length];

  if (wasVerb2 && pct2Str) {
    return `${pct2Str} are also ${clean2} (${mult2} the national rate) — ${closing}`;
  }
  if (pct2Str) {
    return `${cap(clean2)} follows at ${pct2Str} (${mult2} the national rate) — ${closing}`;
  }
  return `${cap(clean2)} follows closely at ${mult2} the national average — ${closing}`;
}

/**
 * Write a platform-specific recommendation matching prototype style:
 * names a specific Indian platform, a specific format, and a specific creative angle.
 */
function buildRec(slot: DataSlot, topAttr: string, pctNum: string | null): string {
  const q    = slot.question.toLowerCase();
  const attr = cleanAttrText(topAttr).toLowerCase();

  if (/stream|ott|netflix|hotstar|prime|jio.*cinema|zee5/i.test(q + attr))
    return `Shift 60–65% of video budget to JioCinema and Hotstar pre-rolls — this audience spends a disproportionate amount of screen time inside these apps and will reward brands that show up in relevant, in-moment placements.`;

  if (/social media|using.*less|spend.*time.*social|worry.*social|instagram|facebook/i.test(attr + q))
    return `Build a "less is more" content strategy — fewer, higher-quality short-form videos on Instagram Reels and YouTube. This audience is already pulling back from volume content; brands that respect their attention will earn more of it.`;

  if (/device|smartphone|phone|laptop|tablet|gadget|smart/i.test(q + attr))
    return `Run YouTube bumper ads and connected TV pre-rolls on Hotstar that show technology fitting naturally into everyday Indian home life — utility-led creative outperforms aspirational messaging with this group by a significant margin.`;

  if (/purchas|buy|shop|price|store|retail|ecomm|discount|full.price/i.test(q + attr))
    return `Integrate Instagram Shopping tags and Flipkart in-app placements into the media plan. This audience researches heavily before buying — invest in retargeting sequences that bridge social discovery to purchase, and prioritise DTC trust signals over discount-led creative.`;

  if (/health|fitness|wellness|wellbeing|body|exercise|gym|sport|yoga|diet|nutrition|weight|active|physical/i.test(q + attr))
    return `Invest in health-and-wellness creator content on Instagram and YouTube — short-form videos featuring real Indians achieving fitness goals outperform polished brand ads with this group by a wide margin. Prioritise Moj and Josh for vernacular reach, and brief creators on the specific behaviour showing the strongest signal rather than generic "healthy living" messaging.`;

  if (/beauty|grooming|skin|personal.care|cosmetic|haircare|makeup|fragrance|hygiene/i.test(q + attr))
    return `Build a creator-first beauty strategy on Instagram Reels and YouTube Shorts — tutorial and review formats from mid-tier Indian creators (50K–500K followers) outperform celebrity-led content with this audience. Invest in Nykaa and Flipkart Beauty in-app placements to close the discovery-to-purchase gap at the point of intent.`;

  if (/interest|hobby|leisure|pop.culture|entertain|music|gaming|fashion|style|travel|festival/i.test(q + attr))
    return `Build interest-cluster content on Instagram Reels and YouTube Shorts — place the brand inside genuine passion communities (fitness, gaming, fashion, music) rather than interrupting them. Audiences that find a brand in their interest feed, not their ad break, deliver significantly higher organic engagement and brand recall.`;

  if (/sec|socio.econom|class|income.bracket|household.income|affluent|premium|tier/i.test(q + attr))
    return `Concentrate premium product messaging on this SEC segment across OTT pre-rolls (JioCinema, Hotstar) and Instagram — these households have both the intent and the spending power to convert. Avoid discount-first creative; this group responds to quality signals and aspirational but attainable brand positioning.`;

  if (/challeng|aspir|ambiti|goal|learn|grow|improv|achiev/i.test(attr))
    return `Run 15-second Instagram Reels and YouTube pre-rolls built around personal progress moments — real Indians setting and hitting goals, not aspirational models. This audience responds to creative that mirrors their own ambitions rather than selling a lifestyle.`;

  if (/family|household|children|parent|home|domestic/i.test(q + attr))
    return `Place CTV pre-rolls on Hotstar family content in the 7–10pm slot — this audience is most receptive during family viewing time. Creative should feature warm, realistic Indian family moments rather than idealised imagery.`;

  if (/employ|work|career|income|profession|job/i.test(q + attr))
    return `Target LinkedIn sponsored content and YouTube pre-rolls with career-aspiration messaging that acknowledges this audience's professional identity. They respond to brands that see them as capable and ambitious, not just consumers.`;

  if (/news|inform|read|current|aware/i.test(q + attr))
    return `Build content partnerships with news and editorial platforms — Times of India, Scroll, and YouTube news channels. This audience actively seeks information and will engage with brand stories that feel editorial and well-sourced rather than promotional.`;

  // Bucket-level defaults that still name specific platforms and actions
  if (slot.bucket === 'commerce')
    return `Allocate a meaningful share of commerce spend to Meesho and Flipkart in-app placements — this audience is purchase-ready but trust-sensitive. Lead creative with social proof and value clarity, not discount depth.`;
  if (slot.bucket === 'communication')
    return `Shift 40–50% of paid social spend to creator-led Instagram Reels and YouTube Shorts. This audience trusts peer recommendations over polished brand content — brief creators with the insight, not the script.`;
  if (slot.bucket === 'culture')
    return `Build regional-language creative for Moj and Josh in addition to Hindi-first platforms. This audience's cultural identity is a real strategic signal — campaigns that acknowledge it will outperform those that flatten it.`;
  if (slot.bucket === 'channel')
    return `Concentrate budget on the top 2 channels in this mix — audit each platform for ROI before the next planning cycle, and shift spend aggressively away from the lowest-performing channel.`;
  if (slot.bucket === 'media')
    return `Build a media brief that prioritises the formats and platforms showing the strongest signals here — even a 10% budget shift to the top-performing media can drive disproportionate returns on reach and engagement.`;
  if (slot.bucket === 'creative')
    return `Brief the creative team on the specific angles and formats that tested strongest — produce 3 variations for the top-performing format and run a rapid A/B test on Instagram Reels before the full campaign launch.`;
  if (slot.bucket === 'pricing')
    return `Position the hero SKU at the price point that best matches the value perception in this data — avoid leading with discounts, and instead build the narrative around quality and value clarity on Flipkart and Amazon product pages.`;
  if (slot.bucket === 'search')
    return `Prioritise bid spend on the highest-intent keywords in this data — build a Google Ads and Flipkart search campaign around the top 5 terms, and ensure landing pages are conversion-optimised for each intent level.`;

  // content default
  return `Prioritise short-form video on Instagram Reels and YouTube — 15-second formats that lead with the insight rather than the brand. This audience rewards creative that reflects their actual life, not a brand-polished version of it.`;
}

// ── Chart variety helpers ─────────────────────────────────────────────────────
// Rotation used by the fallback generator to pick varied chart types.
// Order matters: we cycle through visually distinct types first.
// hbar/bar → ranked-list reading, doughnut/pie → share/proportion,
// area/line → magnitude/trend feel, radar → profile, funnel → journey,
// waterfall → decomposition, histogram → distribution.
const VARIETY_ROTATION: GeminiInsightCard['type'][] = [
  'hbar', 'doughnut', 'dumbbell', 'bar', 'area', 'radar', 'pie', 'line', 'funnel', 'waterfall', 'histogram',
];

/** Return a chart type that hasn't been over-used and doesn't repeat the last card. */
// Chart types that visualise TWO audiences as side-by-side series. Used to
// constrain pickFallbackType's variety rotation when the slot is 2-audience —
// without this, the variety enforcer could pick (e.g.) histogram or funnel,
// which only show one distribution and silently drop audience B.
const TWO_AUDIENCE_SAFE_TYPES: GeminiInsightCard['type'][] = ['dumbbell', 'hbar', 'bar', 'radar', 'area', 'line'];

function pickFallbackType(
  preferred: GeminiInsightCard['type'],
  typeUsed:  Record<string, number>,
  lastType:  GeminiInsightCard['type'] | null,
  rowCount:  number,
  isTwoAudience: boolean = false,
): GeminiInsightCard['type'] {
  // funnel / waterfall only make sense for 3–8 items; strip them from candidate list if too few/many
  const safePool = VARIETY_ROTATION.filter(t => {
    if ((t === 'funnel' || t === 'waterfall') && (rowCount < 3 || rowCount > 8)) return false;
    if ((t === 'radar')     && rowCount < 3) return false;
    if ((t === 'histogram') && rowCount < 4) return false;
    // Dumbbell rows fit cleanly between 4 and 10 attributes — sparse below,
    // overflowing above.
    if ((t === 'dumbbell')  && (rowCount < 4 || rowCount > 10 || !isTwoAudience)) return false;
    // 2-audience: only keep types whose chart-data builder produces TWO datasets.
    if (isTwoAudience && !TWO_AUDIENCE_SAFE_TYPES.includes(t)) return false;
    return true;
  });

  // 1. Preferred is fine: not consecutive, used < 2 times
  if (preferred !== lastType && (typeUsed[preferred] ?? 0) < 2 && safePool.includes(preferred))
    return preferred;

  // 2. Scan rotation for a type that passes all checks
  for (const t of safePool) {
    if (t !== lastType && (typeUsed[t] ?? 0) < 2) return t;
  }

  // 3. Relax consecutive constraint (all good types used twice)
  for (const t of safePool) {
    if ((typeUsed[t] ?? 0) < 2) return t;
  }

  // 4. Everything maxed — just avoid consecutive
  return safePool.find(t => t !== lastType) ?? preferred;
}

function generateFallbackCards(
  slots: DataSlot[],
  toolLabel: string,
  brief: { brand?: string; age_ranges?: string; geography?: string } | null = null,
): GeminiInsightCard[] {
  const cards: GeminiInsightCard[] = [];

  // Variety state tracked across all cards in this set
  const typeUsed: Record<string, number> = {};
  let   lastType: GeminiInsightCard['type'] | null = null;

  for (const slot of slots) {
    if (slot.rows.length < 2) continue;

    const topN   = slot.rows.slice(0, 6);
    const top    = topN[0];
    // Pick a genuinely different second attribute
    const second = topN.find(r => r.attr !== top.attr) ?? topN[1];

    // Plain-English values
    const pctRaw  = top.audiencePct > 0 ? top.audiencePct : top.dataPct;
    const hasPct  = pctRaw > 0;
    const pctNum  = hasPct ? `${pctRaw.toFixed(1)}%` : null;
    const pctFrac = hasPct ? pctToWords(pctRaw) : null;
    const multFmt = `${(top.index / 100).toFixed(1)}×`;

    // ── TITLE ────────────────────────────────────────────────────────────────
    const title = buildTitle(top.attr, pctNum, multFmt, slot.question);

    // ── OBSERVATION — use top-3 rows for a rich, multi-stat picture ─────────
    const s1 = buildS1(top.attr, pctNum, pctFrac, multFmt, brief);

    // S2: name rows 2 AND 3 in one sentence so the breakdown is complete
    const s2pct    = second.audiencePct > 0 ? second.audiencePct : second.dataPct;
    const third    = topN.find(r => r.attr !== top.attr && r.attr !== second.attr);
    const thirdPct = third ? (third.audiencePct > 0 ? third.audiencePct : third.dataPct) : 0;
    const thirdMul = third ? `${(third.index / 100).toFixed(1)}×` : '';

    let s2: string;
    if (third && thirdPct > 0 && s2pct > 0) {
      const c2 = cleanAttrText(second.attr);
      const c3 = cleanAttrText(third.attr);
      s2 = `${cap(c2)} accounts for ${s2pct.toFixed(1)}% (${(second.index / 100).toFixed(1)}× the national rate), `
         + `while ${c3} adds another ${thirdPct.toFixed(1)}% (${thirdMul} national) — `
         + `together these three signals account for the dominant share of this category.`;
    } else {
      s2 = buildS2(top.attr, second.attr, s2pct, second.index);
    }

    const s3map: Record<string, string> = {
      content:       'For brands in this space, reflecting this behaviour in content strategy — not just targeting — will deliver meaningfully stronger engagement with this group.',
      commerce:      'Messaging that acknowledges how this audience actually makes purchase decisions will consistently outperform generic category creative.',
      communication: 'Media spend aligned to the platforms and formats this audience actively uses will deliver higher earned attention and more efficient CPMs.',
      culture:       'Campaigns that genuinely connect with these cultural values will feel authentic to this group — and they have a sharp radar for brands that do it well vs. brands that appropriate.',
      channel:       'A channel-specific brief that concentrates budget on the most efficient medium in this mix will outperform a broad spray-and-pray approach every time.',
      media:         'Media investment concentrated on the platforms showing the highest engagement in this data will deliver better reach-to-impact ratios than an even-spread plan.',
      creative:      'Creative assets directly informed by what this data shows about resonant formats and messages will outperform brief-free executions in every measure that matters.',
      pricing:       'Positioning that matches the value perceptions evident in this data — rather than leading with discounts — will build longer-term brand equity and margin resilience.',
      search:        'Search investment that maps to the keyword themes in this data will capture high-intent demand from exactly the audience most likely to convert.',
    };
    const s3 = s3map[slot.bucket] ?? 'A clear strategic signal worth building into the next campaign brief.';

    const obs = `${s1} ${s2} ${s3}`;

    // ── STAT — pull-quote style: one crisp sentence, no brackets, no raw Index numbers ─────────
    const cleanAttr = cleanAttrText(top.attr);
    const isVerb    = /^I (am |)(using|watch|buy|prefer|trust|worry|think|feel|read|listen|spend|value|choos|believ|driv|own|follow|support|creat|shar|post|play|cook|exercis|travel)/i.test(top.attr);
    const stat = hasPct && pctFrac
      ? isVerb
        ? `${cap(pctFrac)} of your audience are ${cleanAttr} — ${multFmt} the national average`
        : `${cap(pctFrac)} prioritise ${cleanAttr} — ${multFmt} more common here than the national average`
      : hasPct
        ? `${pctNum} of your audience prioritise ${cleanAttr} — ${multFmt} the national average`
        : `${cap(cleanAttr)} is ${multFmt} more prevalent here than in the general Indian population`;

    // ── RECOMMENDATION ───────────────────────────────────────────────────────
    const rec = buildRec(slot, top.attr, pctNum);

    // ── CHART — variety enforcement (handles 2-audience too) ───────────────
    // Phase 3c: removed the unconditional bar/hbar override for 2-audience.
    // pickFallbackType now knows the audience mode and restricts its rotation
    // to types that visualise A vs B (hbar/bar/radar/area/line). This
    // recovers chart-type variety across the 18-card grid — without it the
    // page was rendering ~14 grouped bars and reading monotonous.
    const preferred        = slot.chartSuggestion as GeminiInsightCard['type'];
    const isTwoAudienceSlot = !!slot.isTwoAudience;
    const chartType = pickFallbackType(
      preferred, typeUsed, lastType, topN.length, isTwoAudienceSlot,
    );
    typeUsed[chartType] = (typeUsed[chartType] ?? 0) + 1;
    lastType            = chartType;

    const useAudiencePct = topN.some(r => r.audiencePct > 0);
    const chartLabels    = topN.map(r => r.attr);
    const chartValues    = topN.map(r => useAudiencePct ? r.audiencePct : r.index);

    // chartValues2: precedence is
    //   1. 2-audience slot + non-scatter, non-pure-doughnut → audience B's actuals
    //      (renders as grouped bar/hbar or 2-polygon radar via the chart-data builder)
    //   2. scatter (single-audience) → index multiplier on Y axis
    //   3. otherwise undefined (chart-data builder treats absence as "no compare")
    let chartValues2: number[] | undefined;
    let chartSeries:  string[] | undefined;
    if (isTwoAudienceSlot && chartType !== 'doughnut' && chartType !== 'pie' && chartType !== 'scatter') {
      // For each top attribute, pair audience A's value with audience B's value.
      // useAudiencePct decides whether to compare pct or index — same metric across both
      // audiences keeps the magnitude comparable.
      chartValues2 = topN.map(r => useAudiencePct ? (r.audiencePct2 ?? 0) : (r.index2 ?? 0));
      chartSeries  = [
        slot.audienceALabel || 'Audience A',
        slot.audienceBLabel || 'Audience B',
      ];
    } else if (chartType === 'scatter') {
      chartValues2 = topN.map(r => +(r.index / 100).toFixed(2));
    }

    // Build a short uppercase chart descriptor from the slot question
    const chartTitle = slot.question.length <= 60
      ? slot.question.toUpperCase()
      : slot.question.slice(0, 58).toUpperCase() + '…';

    cards.push({
      title,
      bucket:      slot.bucket,
      type:        chartType,
      conviction:  85,
      obs,
      stat,
      rec,
      toolLabel,   // no "· Auto-Analysis" suffix — shows as normal PRISM analysis
      chartLabels,
      chartValues,
      chartValues2,
      chartSeries,
      chartTitle,
    });
  }

  return cards;
}

// ── Post-process: enforce balanced bucket distribution ───────────────────────
// Applied to ALL card outputs regardless of which tier generated them.
// Tracks all 9 buckets but only enforces the CORE 4 (content/commerce/communication/culture)
// to guarantee every primary PRISM tab in the UI shows at least 1 card.
// The 5 new buckets (channel/media/creative/pricing/search) are optional extras.
const CORE_BUCKETS = ['content', 'commerce', 'communication', 'culture'] as const;
const ALL_BUCKET_KEYS = ['content', 'commerce', 'communication', 'culture',
                         'channel', 'media', 'creative', 'pricing', 'search'] as const;

// ── Mandatory chart-type enforcement (Rule A + B, no fallback) ───────────
// Applied to every card BEFORE rebalanceCards — works for Gemini, OpenRouter,
// and the pure-data fallback uniformly. The detection is shape-based (chartLabels +
// chartValues) so it doesn't depend on slot-to-card index matching, which can
// drift when a Gemini batch fails partway through.
function enforceChartTypeRules(cards: GeminiInsightCard[]): GeminiInsightCard[] {
  return cards.map(c => {
    const labels = c.chartLabels || [];
    const values = c.chartValues || [];
    const titleU = (c.chartTitle || '').toUpperCase();

    // Rule A: binary trade-off → doughnut.
    // Detection: exactly 2 labels whose values sum to ~100 (within 5pt tolerance).
    if (labels.length === 2 && values.length === 2) {
      const sum = (Number(values[0]) || 0) + (Number(values[1]) || 0);
      if (sum >= 95 && sum <= 105) {
        return { ...c, type: 'doughnut' };
      }
    }

    // Rule B: personas / segmentation → radar.
    // Detection: chartTitle contains a persona/segmentation keyword AND 5–8 labels.
    // For single-audience uploads, seeds chartValues2 with a 100-baseline so
    // the radar shows the audience profile vs national average.
    // For 2-audience uploads, chartValues2 already holds audience B's real
    // values (set in generateFallbackCards / Gemini prompt) — leave them
    // alone so build-gemini-chart-data renders two polygons.
    if (
      /PERSONA|SEGMENTATION|DESCRIBES CONSUMER|SELF[ \-]?PERCEPTION|CHARACTER DESCRIBES/i.test(titleU)
      && labels.length >= 5 && labels.length <= 8
    ) {
      // Two-audience detection: chartValues2 present, same length as values,
      // and NOT the all-100 baseline (some value != 100).
      const has2Audience =
        Array.isArray(c.chartValues2)
        && c.chartValues2.length === labels.length
        && c.chartValues2.some(v => Number(v) !== 100);
      if (has2Audience) {
        return { ...c, type: 'radar' };  // keep values2 + series as-is
      }
      return {
        ...c,
        type:         'radar',
        chartValues2: c.chartValues2 ?? new Array(labels.length).fill(100),
        chartSeries:  c.chartSeries  ?? ['Audience %', 'National baseline'],
      };
    }

    return c;
  });
}

function rebalanceCards(cards: GeminiInsightCard[]): GeminiInsightCard[] {
  if (cards.length < 4) return cards;

  // Count cards per bucket across all 9 buckets
  const counts: Record<string, number> = Object.fromEntries(ALL_BUCKET_KEYS.map(b => [b, 0]));
  cards.forEach(c => {
    const b = (ALL_BUCKET_KEYS as readonly string[]).includes(c.bucket) ? c.bucket : 'content';
    counts[b]++;
  });

  // Only enforce coverage for the 4 core PRISM buckets
  const emptyBuckets = CORE_BUCKETS.filter(b => counts[b] === 0);
  if (emptyBuckets.length === 0) return cards;

  // Donor = the most card-rich bucket across ALL 9 (may be a new bucket)
  const dominant = ALL_BUCKET_KEYS.reduce((a, b) => (counts[a] > counts[b] ? a : b));

  const result = [...cards];
  for (const target of emptyBuckets) {
    if (counts[dominant] <= 1) break;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].bucket === dominant) {
        result[i] = { ...result[i], bucket: target };
        counts[dominant]--;
        counts[target]++;
        break;
      }
    }
  }

  return result;
}

// ── Brief context builder ──────────────────────────────────────
// Converts a brief DB row into a compact, human-readable context
// block that is injected into every Gemini / OpenRouter prompt so
// the AI frames insights against the specific brand objective.
function buildBriefContext(brief: any): string {
  if (!brief) return '';
  const lines: string[] = [];
  if (brief.brand)    lines.push(`BRAND: ${brief.brand}`);
  if (brief.category) lines.push(`CATEGORY: ${brief.category}`);
  if (brief.objective)lines.push(`CAMPAIGN OBJECTIVE: ${brief.objective}`);
  if (brief.background) lines.push(`BRIEF BACKGROUND: ${brief.background}`);
  const audience: string[] = [];
  if (brief.age_ranges) audience.push(brief.age_ranges);
  if (brief.gender)     audience.push(brief.gender);
  if (brief.sec)        audience.push(`SEC ${brief.sec}`);
  if (audience.length)  lines.push(`TARGET AUDIENCE: ${audience.join(' · ')}`);
  if (brief.geography)  lines.push(`GEOGRAPHY: ${brief.geography}`);
  if (brief.market)     lines.push(`MARKET: ${brief.market}`);
  if (brief.competitors)lines.push(`KEY COMPETITORS: ${brief.competitors}`);
  if (brief.insight_buckets) lines.push(`PRIORITY INSIGHT AREAS: ${brief.insight_buckets}`);
  return lines.join('\n');
}

// ── Fetch brief from DB (non-blocking — returns null on failure) ──
async function fetchBrief(briefId: string): Promise<any | null> {
  try {
    const { rows } = await getPool().query(
      `SELECT brand, category, objective, background, age_ranges, gender, sec,
              market, geography, competitors, insight_buckets
         FROM briefs WHERE id = $1`,
      [briefId],
    );
    return rows[0] ?? null;
  } catch (err: any) {
    console.warn('[analyze-data] Could not fetch brief:', err.message);
    return null;
  }
}

// ── PPTX-deck row flattener ────────────────────────────────────
// Slides land in tool_data as nested objects: { slideNumber, title,
// bullets:[…], tables:[{headers,rows:[[]]}], notes }. Gemini's
// generic-tabular prompt expects FLAT rows (string-keyed, scalar
// values), so feeding it the nested shape silently produces garbage
// and a 502. Detect the deck shape and project each slide into one
// "overview" row (title + bullets + notes) plus one row per table
// data-row with the table's headers as field names. The downstream
// analyzer then treats the deck like any other tabular source.
function isPptxDeckShape(rows: any[]): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const r0 = rows[0];
  return r0 && typeof r0 === 'object'
    && 'slideNumber' in r0
    && 'bullets'     in r0
    && 'tables'      in r0;
}

/**
 * Last-resort Tier-3 fallback for pptx_deck data. Runs when both Gemini and
 * OpenRouter fail (rate limits, JSON parse errors, network outages). Builds
 * up to 6 deterministic insight cards directly from slide titles + bullets,
 * so the user gets SOMETHING readable instead of a 502.
 *
 * Input: the same flattened rows the LLMs see — { Slide, Title, Section,
 * Content }. We pick the slides with the most signal (longest Content), one
 * card per slide, distributed across the PRISM buckets.
 */
function generatePptxFallbackCards(
  rows: any[],
  toolLabel: string,
): GeminiInsightCard[] {
  // Group by slide → keep only the Overview row (skip table-data rows).
  const overviews = rows.filter(r =>
    r && r.Section === 'Overview' && typeof r.Title === 'string' && typeof r.Content === 'string',
  );
  if (overviews.length === 0) return [];

  // Rank by content density (longer Content = more bullets = more signal).
  const ranked = [...overviews]
    .sort((a, b) => (b.Content?.length ?? 0) - (a.Content?.length ?? 0))
    .slice(0, 6);

  // Rotate through buckets so the dashboard doesn't pile cards in one place.
  const bucketRotation: GeminiInsightCard['bucket'][] = [
    'content', 'culture', 'commerce', 'communication', 'creative', 'media',
  ];

  return ranked.map((r, idx): GeminiInsightCard => {
    // First sentence of Content makes a sharp observation.
    const content    = String(r.Content ?? '');
    const firstStop  = content.search(/(?<=[.!?])\s/);
    const observation = firstStop > 30 ? content.slice(0, firstStop + 1) : content.slice(0, 220);
    const rest       = firstStop > 30 ? content.slice(firstStop + 1, firstStop + 221) : '';

    return {
      title:        String(r.Title || `Slide ${r.Slide}`).slice(0, 100),
      bucket:       bucketRotation[idx % bucketRotation.length],
      type:         'hbar',
      conviction:   65, // marked low because this is deterministic, not LLM-generated
      obs:          observation || 'See source deck for full context.',
      stat:         '',
      rec:          rest || 'Build a creative angle around this slide.',
      toolLabel,
      chartLabels:  [],
      chartValues:  [],
      chartValues2: [],
    } as GeminiInsightCard;
  });
}

function flattenPptxRows(rows: any[]): any[] {
  const out: Record<string, any>[] = [];
  for (const r of rows) {
    const slide   = r?.slideNumber ?? null;
    const title   = String(r?.title ?? '').trim();
    const bullets = Array.isArray(r?.bullets) ? r.bullets : [];
    const tables  = Array.isArray(r?.tables)  ? r.tables  : [];
    const notes   = String(r?.notes ?? '').trim();

    // One "overview" row per slide — captures the narrative spine.
    const content = [
      bullets.length ? bullets.join(' · ') : '',
      notes ? `[notes] ${notes}` : '',
    ].filter(Boolean).join(' · ');
    if (title || content) {
      out.push({
        Slide:   slide,
        Title:   title || `Slide ${slide}`,
        Section: 'Overview',
        Content: content,
      });
    }

    // One row per table data-row, with that table's headers as fields.
    // Preserves keyword lists, persona profiles, and platform matrices
    // as real columns Gemini can group on.
    for (const t of tables) {
      const headers: string[]   = Array.isArray(t?.headers) ? t.headers.map((h: any) => String(h ?? '').trim()) : [];
      const dataRows: string[][] = Array.isArray(t?.rows)    ? t.rows                                            : [];
      for (const dr of dataRows) {
        const obj: Record<string, any> = {
          Slide:   slide,
          Title:   title || `Slide ${slide}`,
          Section: 'Table',
        };
        headers.forEach((h, i) => {
          if (h && dr[i] != null && String(dr[i]).trim() !== '') obj[h] = dr[i];
        });
        // Skip rows that ended up with only the three meta fields (no
        // table content) — they add noise without signal.
        if (Object.keys(obj).length > 3) out.push(obj);
      }
    }
  }
  return out;
}

// ── Timeout wrapper ────────────────────────────────────────────
// Races a promise against a hard deadline. When Gemini hangs past
// the deadline the batch is treated as failed so we fall through to
// OpenRouter before Vercel kills the whole function at 60 s.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

/**
 * Generates the Executive Summary (headline + audienceSnapshot) from the
 * already-generated insight cards and attaches it to the response payload.
 *
 * Before this helper existed, only the GWI path produced an overview block —
 * keyword, generic-tabular, social-listening, PPTX and auto-fallback all
 * returned `insights` without `overview`, so the frontend's Executive Summary
 * section silently hid on every non-GWI upload. That made GWI uploads look
 * polished and everything else look thin.
 *
 * Soft-fails: if the overview Gemini call errors or times out, returns the
 * payload with `overview: { headline: '', audienceSnapshot: '' }` and the
 * frontend gracefully omits the block. No card output is ever blocked on
 * overview success.
 */
async function withBriefOverview(
  insights:     GeminiInsightCard[],
  context:      string,
  briefContext: string,
  domain:       string,
  payload:      Record<string, any>,
  /** Optional pre-running overview promise (from generateBriefOverviewFromRows
   *  kicked off in parallel with the main card-gen call). */
  overviewPromise?: Promise<GwiOverview>,
  /** Optional raw rows for deterministic Nuggets synthesis. Pass the same
   *  rows the analyzer was given — synthesize computes Pareto, HHI, brand SOV,
   *  YoY etc. server-side so the frontend's Nuggets rail renders without
   *  having to guess from Gemini's chosen phrasing. */
  synthOpts?: {
    keywordRows?:  any[] | null;
    helium10Rows?: any[] | null;
    brief?:        any;
    audienceDescriptor?: string | null;
    categoryIntel?: any;
  },
): Promise<NextResponse> {
  const overview = overviewPromise
    ? await overviewPromise.catch((err: any) => {
        console.warn('[analyze-data] Parallel overview failed:', err?.message);
        return { headline: '', audienceSnapshot: '' } as GwiOverview;
      })
    : await withTimeout(
        generateBriefOverview(insights, context, briefContext, domain),
        30_000,
        'Gemini brief overview',
      ).catch((err: any) => {
        console.warn('[analyze-data] Brief overview failed:', err?.message);
        return { headline: '', audienceSnapshot: '' } as GwiOverview;
      });

  // Deterministic Nuggets summary — computed from the raw rows, not from
  // Gemini's chosen titles. Soft-fails on any error so the response still
  // ships if the math throws.
  let nuggets: NuggetsSummary | undefined;
  if (synthOpts) {
    try {
      nuggets = synthesizeNuggets(synthOpts);
    } catch (err: any) {
      console.warn('[analyze-data] Nugget synthesis failed:', err?.message);
    }
  }

  return NextResponse.json({ ...payload, insights, overview, ...(nuggets ? { nuggets } : {}) });
}

// ── Route ─────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sheetName, fileNames, briefId, uploadId } = body;
    let rows = body.rows;

    if (!Array.isArray(rows) || rows.length === 0)
      return NextResponse.json({ error: 'rows array required' }, { status: 400 });

    // ── Cache strategy note ──────────────────────────────────────
    // Caching now lives at the UPLOAD layer (lib/uploads/handler.ts):
    // when content-hash dedup hits AND a prior analysis exists for the
    // matching (upload_id, brief_id), the upload response surfaces
    // `existingAnalysisId` and the frontend short-circuits to
    // /insights?id=… without ever calling this route. That's a clean
    // strategy because cached results never need to be reverse-converted
    // from `charts[]` back to `insights[]` (the frontend stores cards
    // as `results.charts`, not `results.insights`, so a route-level
    // cache here would have been silently dead code).
    //
    // Reaching this point means: fresh upload, OR same file under a new
    // brief — either way we want a live analysis run.

    // PPTX decks ship as nested-object slides; flatten before any slot
    // detection or prompt construction touches them.
    if (isPptxDeckShape(rows)) {
      const before = rows.length;
      rows = flattenPptxRows(rows);
      console.log(`[analyze-data] flattened pptx deck: ${before} slides → ${rows.length} tabular rows`);
    }

    // BUG FIX: Do NOT exit here if GEMINI_API_KEY is missing.
    // Gemini functions throw internally when the key is absent, which is caught
    // by Promise.allSettled / try-catch — fallbacks (OpenRouter, auto-analysis)
    // then run as normal.  Returning 503 here would have killed every fallback.
    if (!process.env.GEMINI_API_KEY)
      console.warn('[analyze-data] GEMINI_API_KEY not set — Gemini will fail, OpenRouter + auto-analysis will handle it');

    // Fetch brief context (non-blocking — null if no briefId or DB unreachable)
    const brief       = briefId ? await fetchBrief(briefId) : null;
    const briefContext = buildBriefContext(brief);
    if (briefContext) console.log(`[analyze-data] Brief context loaded for briefId=${briefId} (${brief?.brand})`);

    const slots = buildInsightSlots(rows);
    const context = [fileNames?.join(' + ') || sheetName].filter(Boolean).join(' ');

    // GWI-shaped data → structured slot path (exact numbers, anti-hallucination)
    // Cap at 18 slots (3 batches of 6) — covers all key GWI questions while keeping
    // parallel API calls at ≤ 3, which fits within the free-tier 15 RPM rate limit.
    if (slots.length > 0) {
      const gwiContext = `${context} — India 18–64 Gen Pop`;
      const toolLabel  = fileNames?.[0]?.toLowerCase().includes('household') ? 'GWI HOUSEHOLD' : 'GWI';

      try {
        // Larger batches = fewer Gemini round-trips = less daily quota burn.
        // Was 6 (3 batches for 18 slots). Now 9 (2 batches for 18 slots).
        // Each batch still well below Gemini's 8K output-token ceiling for
        // ~9 cards of structured JSON.
        const BATCH_SIZE = 9;
        // Limit to 18 slots max → 2 sequential batches, not 3
        const batches    = chunkSlots(slots.slice(0, 18), BATCH_SIZE);

        // Kick off the Main Headline + Audience Snapshot generator in parallel
        // with the per-slot batches. Soft-fails: returns empty strings on error,
        // so the UI can simply omit the overview block.
        const overviewPromise: Promise<GwiOverview> = withTimeout(
          generateGwiOverview(slots.slice(0, 18), gwiContext, briefContext),
          30_000,
          'Gemini overview',
        ).catch((err: any) => {
          console.warn('[analyze-data] Overview generation failed:', err?.message);
          return { headline: '', audienceSnapshot: '' } as GwiOverview;
        });

        // Run batches SEQUENTIALLY — not in parallel.
        // Why: parallel fires 3 simultaneous Gemini calls per file.
        // With multiple files uploading concurrently that hits 429 (rate limit)
        // immediately on the free tier (15 RPM) and causes every batch to fail.
        // Sequential: each batch only runs after the previous one completes,
        // keeping peak load at 1 Gemini call at a time regardless of file count.
        // Trade-off: ~5-10s slower per file, but reliably gets AI insights.
        const batchResults: PromiseSettledResult<any[]>[] = [];
        for (let i = 0; i < batches.length; i++) {
          // 2 s breathing room between batches — gives Gemini quota a brief reset window
          // and prevents the second/third batch from immediately hitting the same rate limit.
          // Skip pause before the first batch so overall latency only grows by 2×(n-1) seconds.
          if (i > 0) await new Promise(r => setTimeout(r, 2000));
          try {
            const value = await withTimeout(
              analyzeDataForPRISM(batches[i], gwiContext, toolLabel, briefContext),
              90_000,  // 42s → 90s. The 42s cap was timing out the model-retry
                       // chain (Flash → Flash 2.0 → Pro → Flash-Lite, each ~10-30s
                       // on rate-limited days). With 2 batches × 90s + ~30s
                       // overview, total worst case ~210s < route maxDuration 300s.
              `Gemini batch ${i + 1}/${batches.length}`,
            );
            batchResults.push({ status: 'fulfilled', value });
          } catch (reason: any) {
            batchResults.push({ status: 'rejected', reason });
          }
        }

        // Merge successful results, log failures without crashing.
        // Also collect the actual failure messages so the API response can
        // surface the real Gemini error to the upload UI — otherwise the user
        // just sees "AI unavailable" with no actionable diagnostic.
        const geminiErrors: string[] = [];
        const insights = batchResults.flatMap((result, i) => {
          if (result.status === 'fulfilled') return result.value;
          const msg = (result as any).reason?.message ?? 'unknown error';
          console.warn(`[analyze-data] Batch ${i + 1}/${batches.length} failed:`, msg);
          geminiErrors.push(`batch ${i + 1}: ${msg}`);
          return [];
        });

        // Await overview (already in-flight). Will be empty on failure.
        const overview = await overviewPromise;

        if (insights.length === 0) {
          console.warn('[analyze-data] All Gemini batches failed — trying OpenRouter fallback');

          // ── Tier 2: OpenRouter (free LLM models, same prompt) ──────────
          // BUG FIX: wrapped in withTimeout(20_000) so OpenRouter cannot hang
          // past 20 s — leaving ~10 s buffer for Tier 3 auto-analysis before
          // Vercel kills the function at 60 s.
          if (process.env.OPENROUTER_API_KEY) {
            try {
              const orCards = await withTimeout(
                analyzeWithOpenRouter(slots, gwiContext, toolLabel, briefContext),
                40_000,
                'OpenRouter GWI',
              );
              if (orCards.length > 0) {
                console.log(`[analyze-data] OpenRouter returned ${orCards.length} cards`);
                return NextResponse.json({
                  insights:     rebalanceCards(enforceChartTypeRules(polishGeminiCards(orCards))),
                  slots,
                  overview,
                  path:         'gwi-slots',
                  totalSlots:   slots.length,
                  batches:      batches.length,
                  fallback:     'openrouter',
                  geminiErrors,  // expose why Gemini failed — UI can log this
                });
              }
            } catch (orErr: any) {
              console.warn('[analyze-data] OpenRouter GWI fallback failed:', orErr.message);
            }
          } else {
            console.warn('[analyze-data] OPENROUTER_API_KEY not set — skipping OpenRouter fallback');
          }

          // ── Tier 3: Pure-data auto-analysis (no AI, grounded in slot numbers) ──
          console.warn('[analyze-data] Using pure-data auto-analysis as last resort');
          const fallbackCards = generateFallbackCards(slots, toolLabel, brief);
          if (fallbackCards.length > 0) {
            return NextResponse.json({
              insights:     rebalanceCards(enforceChartTypeRules(polishGeminiCards(fallbackCards))),
              slots,
              overview,
              path:         'gwi-slots',
              totalSlots:   slots.length,
              batches:      batches.length,
              fallback:     'auto',
              geminiErrors,  // expose why Gemini failed — UI can log this
            });
          }
          // Nothing worked and data has no index scores — genuine failure
          return NextResponse.json(
            { error: 'No insights could be generated — data may not contain index scores.', path: 'gwi-slots', slotCount: slots.length },
            { status: 422 },
          );
        }

        return NextResponse.json({ insights: rebalanceCards(enforceChartTypeRules(polishGeminiCards(insights))), slots, overview, path: 'gwi-slots', totalSlots: slots.length, batches: batches.length });
      } catch (err: any) {
        return NextResponse.json(
          { error: `Gemini failed on GWI slots: ${err.message}`, path: 'gwi-slots', slotCount: slots.length },
          { status: 502 },
        );
      }
    }

    // Non-GWI data (Amazon, Helium10, sales, marketing, etc.)
    // → generic Gemini path with creative/media-pro prompt.
    // The rule engine is NOT a fallback any more — its language sounds
    // like a stock-market terminal, which is wrong for our audience.
    const firstName  = fileNames?.[0] ?? sheetName ?? 'data';
    const lower      = firstName.toLowerCase();
    // Detect tool type from filename OR from row column names
    const colKeys    = rows.length > 0 ? Object.keys(rows[0]).map(k => k.toLowerCase()) : [];
    const hasSocialCols = colKeys.some(k => k.includes('sentiment')) &&
                          (colKeys.some(k => k.includes('mediatype') || k.includes('platform')) ||
                           colKeys.some(k => k.includes('message')));
    const hasSocialFilename = /sentiment|shareofvoice|share.of.voice|social.listening|brandwatch|meltwater|talkwalker|konnect/i.test(lower);

    const toolLabel  = (hasSocialCols || hasSocialFilename)  ? 'SOCIAL_LISTENING'
                     : lower.includes('keyword')             ? 'KEYWORD_PLANNER'
                     : lower.includes('amazon')              ? 'AMAZON'
                     : lower.includes('helium')              ? 'HELIUM10'
                     : lower.includes('flipkart')            ? 'FLIPKART'
                     : lower.includes('meesho')              ? 'MEESHO'
                     : 'TABULAR';

    // ── Social Listening path — uses pre-aggregated sentiment/platform rows ──
    if (toolLabel === 'SOCIAL_LISTENING') {
      try {
        const insights = await withTimeout(
          analyzeSocialListeningForPRISM(rows, context, 'Social Listening', briefContext),
          40_000, 'Gemini social-listening',
        );
        if (insights.length > 0) {
          const polished = rebalanceCards(insights);
          return withBriefOverview(polished, context, briefContext, 'SOCIAL_LISTENING', {
            slots: [],
            path:  'social-listening',
          });
        }
      } catch (err: any) {
        console.warn('[analyze-data] Social Listening Gemini failed:', err.message);
      }

      if (process.env.OPENROUTER_API_KEY) {
        try {
          const orCards = await withTimeout(
            analyzeSocialWithOpenRouter(rows, context, 'Social Listening', briefContext),
            40_000,
            'OpenRouter social-listening',
          );
          if (orCards.length > 0) {
            const polished = rebalanceCards(orCards);
            return withBriefOverview(polished, context, briefContext, 'SOCIAL_LISTENING', {
              slots:    [],
              path:     'social-listening',
              fallback: 'openrouter',
            });
          }
        } catch (orErr: any) {
          console.warn('[analyze-data] OpenRouter social fallback failed:', orErr.message);
        }
      }
      return NextResponse.json(
        { error: 'Could not generate insights for social listening data. Please try again.', path: 'social-listening' },
        { status: 422 },
      );
    }

    // ── Keyword Planner path — 8-Layer Methodology ──
    // Triggered when toolLabel was tagged KEYWORD_PLANNER by filename OR when
    // the row shape itself carries `Keyword` + `Avg. monthly searches` columns
    // (Google Keyword Planner export signature). This path embeds the 8-layer
    // blueprint into the Gemini prompt — see lib/ai/gemini.ts
    // `analyzeKeywordPlannerForPRISM` + the keyword-strategist skill for the
    // authoritative methodology.
    const isKeywordPath = toolLabel === 'KEYWORD_PLANNER' || isKeywordPlannerShape(rows);
    if (isKeywordPath) {
      console.log('[analyze-data] Keyword path entered (8-layer methodology)');
      // Kick off the Executive Summary IN PARALLEL with the main card-gen
      // call. Same data, two prompts — they run concurrently. Saves ~15-30s
      // wall time vs running overview serially after cards.
      const overviewPromise = withTimeout(
        generateBriefOverviewFromRows(rows, context, briefContext, 'KEYWORD_PLANNER'),
        90_000, 'Gemini brief overview (parallel, keyword)',
      ).catch((err: any) => {
        console.warn('[analyze-data] Keyword parallel overview failed:', err?.message);
        return { headline: '', audienceSnapshot: '' } as GwiOverview;
      });

      // 220s budget — local repro of this prompt completed in 137-234s on a
      // 1.2K keyword file. 220s leaves 80s of the route's 300s budget for
      // OpenRouter fallback below.
      try {
        const t0 = Date.now();
        const insights = await withTimeout(
          analyzeKeywordPlannerForPRISM(rows, context, 'KEYWORD_PLANNER', briefContext),
          220_000, 'Gemini KEYWORD_PLANNER (8-layer)',
        );
        const ms = Date.now() - t0;
        console.log(`[analyze-data] Keyword 8-layer Gemini returned ${insights.length} cards in ${ms}ms`);
        if (insights.length > 0) {
          const polished = rebalanceCards(enforceChartTypeRules(polishGeminiCards(insights)));
          return withBriefOverview(polished, context, briefContext, 'KEYWORD_PLANNER', {
            slots: [],
            path:  'keyword-8layer',
          }, overviewPromise, { keywordRows: rows, brief: null });
        }
      } catch (err: any) {
        console.warn('[analyze-data] Keyword 8-layer Gemini failed:', err.message);
      }

      // ── Tier 2: OpenRouter fallback for keyword path ──
      // If Gemini timed out or rate-limited, retry the same 8-layer task on
      // OpenRouter before degrading to the generic-tabular prompt.
      if (process.env.OPENROUTER_API_KEY) {
        try {
          const orCards = await withTimeout(
            analyzeGenericWithOpenRouter(rows, context, 'KEYWORD_PLANNER', briefContext),
            60_000,
            'OpenRouter KEYWORD_PLANNER',
          );
          if (orCards.length > 0) {
            console.log(`[analyze-data] Keyword OpenRouter fallback returned ${orCards.length} cards`);
            const polished = rebalanceCards(orCards);
            return withBriefOverview(polished, context, briefContext, 'KEYWORD_PLANNER', {
              slots:    [],
              path:     'keyword-8layer',
              fallback: 'openrouter',
            }, undefined, { keywordRows: rows, brief: null });
          }
        } catch (orErr: any) {
          console.warn('[analyze-data] OpenRouter keyword fallback failed:', orErr.message);
        }
      }
      // Final fallback: continue to generic-tabular below so the user still
      // gets some cards rather than a 422.
      console.warn('[analyze-data] Keyword path exhausted — degrading to generic-tabular');
    }

    // ── Generic tabular path (Helium10, Amazon, sales, etc.) ──
    // Timeout raised 40s → 60s → 120s. The inner callGeminiWithRetry cycles
    // through 4 model candidates on rate-limit (Flash → Flash 2.0 → Pro →
    // Flash-Lite), each attempt taking 10–30s. After several uploads in a
    // session the user can exhaust the per-day Flash quota, and the retry
    // walks the full chain. 60s wasn't enough to traverse it; 120s leaves
    // room for the worst case while still preserving ~180s under the route's
    // 300s maxDuration for OpenRouter (Tier 2) and auto-analysis (Tier 3).
    // Detect whether the current generic-tabular run is an ecom export so
    // synthesize gets the rows in the right slot for the Helium 10 Nugget.
    const isEcomTool = /AMAZON|HELIUM|BLACKBOX|FLIPKART|MEESHO|BSR/i.test(toolLabel);
    const synthOptsGeneric = isEcomTool ? { helium10Rows: rows, brief: null } : undefined;

    try {
      const insights = await withTimeout(
        analyzeGenericTabularForPRISM(rows, context, toolLabel, briefContext),
        120_000, `Gemini ${toolLabel}`,
      );
      if (insights.length > 0) {
        const polished = rebalanceCards(insights);
        return withBriefOverview(polished, context, briefContext, toolLabel, {
          slots: [],
          path:  'generic-tabular',
        }, undefined, synthOptsGeneric);
      }
    } catch (err: any) {
      console.warn('[analyze-data] Generic tabular Gemini failed:', err.message);
    }

    // ── Tier 2: OpenRouter (raw rows, same generic-tabular prompt) ──────────
    if (process.env.OPENROUTER_API_KEY) {
      try {
        const orCards = await withTimeout(
          analyzeGenericWithOpenRouter(rows, context, toolLabel, briefContext),
          40_000,
          `OpenRouter ${toolLabel}`,
        );
        if (orCards.length > 0) {
          const polished = rebalanceCards(orCards);
          return withBriefOverview(polished, context, briefContext, toolLabel, {
            slots:    [],
            path:     'generic-tabular',
            fallback: 'openrouter',
          }, undefined, synthOptsGeneric);
        }
      } catch (orErr: any) {
        console.warn('[analyze-data] OpenRouter generic fallback failed:', orErr.message);
      }
    }

    // ── Tier 3: Pure-data auto-analysis ────────────────────────────────────
    const genericSlots = buildInsightSlots(rows);
    if (genericSlots.length > 0) {
      const autoCards = generateFallbackCards(genericSlots, toolLabel);
      if (autoCards.length > 0) {
        console.warn('[analyze-data] Using auto-analysis fallback for generic tabular data');
        const polished = rebalanceCards(autoCards);
        return withBriefOverview(polished, context, briefContext, toolLabel, {
          slots:    genericSlots,
          path:     'generic-tabular',
          fallback: 'auto',
        });
      }
    }

    // ── Tier 4: pptx_deck deterministic fallback ──
    // For decks specifically: synthesize cards from slide titles + bullets so
    // users never see "All analysis tiers failed" just because Gemini was
    // rate-limited and OpenRouter returned an empty parse. The cards are
    // marked with conviction 65 to signal they're deterministic, not LLM.
    const isFlatPptx = rows[0] && typeof rows[0] === 'object'
      && 'Slide' in rows[0] && 'Title' in rows[0] && 'Section' in rows[0];
    if (isFlatPptx) {
      const deckCards = generatePptxFallbackCards(rows, toolLabel);
      if (deckCards.length > 0) {
        console.warn('[analyze-data] Using pptx_deck deterministic fallback (tier 4)');
        const polished = rebalanceCards(deckCards);
        return withBriefOverview(polished, context, briefContext, 'PPTX', {
          slots:    [],
          path:     'pptx-deterministic',
          fallback: 'auto',
        });
      }
    }

    return NextResponse.json(
      { error: 'Could not generate insights. Please verify the data format and try again.', path: 'generic-tabular' },
      { status: 502 },
    );

  } catch (err: any) {
    console.error('[analyze-data]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
